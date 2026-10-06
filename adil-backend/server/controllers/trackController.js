const Visitor = require('../models/Visitor');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Event = require('../models/VisitorEvent');
const WAEvent = require('../models/WhatsAppEvent');
const Lead = require('../models/Lead');
const Enquiry = require('../models/Enquiry');
const bus = require('../services/bus');
const { score } = require('../services/scoring');
const { ensureVisitor, who } = require('../services/tracking');
const { getSettings } = require('../services/settings');
const O = require('../services/orders');
const H = require('../utils/helpers');

const PUBLIC_EVENTS = ['PAGE_VIEW', 'PRODUCT_VIEW', 'CATEGORY_VIEW', 'CART_ADD', 'CART_REMOVE', 'CART_VIEW', 'CHECKOUT_START', 'CHECKOUT_FIELD_UPDATE', 'POPUP_OPEN'];

function vid(req) {
  const id = req.body && req.body.visitorId;
  if (!H.isUUID(id)) throw Object.assign(new Error('Invalid visitorId'), { status: 400 });
  return id;
}
// atomic update, then keep the engagement score in sync
async function bump(visitorId, update) {
  const v = await Visitor.findOneAndUpdate({ visitorId }, { ...update, $set: { ...(update.$set || {}), lastActivityAt: new Date() } }, { new: true });
  if (v) { const s = score(v); if (s !== v.score) { v.score = s; await Visitor.updateOne({ _id: v._id }, { score: s }); } }
  return v;
}
function applyProfile(src) {
  const set = {};
  const name = H.clean(src.name, 80), email = H.clean(src.email, 120), address = H.clean(src.address, 400), notes = H.clean(src.notes, 600);
  if (name) set.name = name;
  if (src.phone && H.isPhone(src.phone)) set.phone = H.normPhone(src.phone);
  if (email && H.isEmail(email)) set.email = email.toLowerCase();
  if (address) set.address = address;
  if (notes) set.notes = notes;
  return set;
}

exports.visit = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const v = await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const sessionId = H.clean(req.body.sessionId, 64);
  const newSession = !!sessionId && v.lastSessionId !== sessionId;     // refresh inside same session never counts again
  if (newSession) {
    const ref = H.clean(req.body.referrer, 200);
    const set = { lastSessionId: sessionId, lastVisitAt: new Date() };
    if (!v.source) set.source = ref || 'direct';
    await bump(visitorId, { $inc: { visitCount: 1 }, $set: set });
    await Event.create({ visitorId, sessionId, type: 'SESSION_START', page: H.clean(req.body.page, 200), meta: { referrer: ref } });
  }
  const fresh = await Visitor.findOne({ visitorId }).lean();
  res.json({ ok: true, code: fresh.code, returning: fresh.visitCount > 1, newSession, popupShown: fresh.popupShown,
    profile: { name: fresh.name, phone: fresh.phone, email: fresh.email, address: fresh.address, notes: fresh.notes } });
});

exports.event = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const type = String(req.body.type || '');
  if (!PUBLIC_EVENTS.includes(type)) return res.status(400).json({ error: 'Invalid event' });
  await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const e = { visitorId, type, sessionId: H.clean(req.body.sessionId, 64), page: H.clean(req.body.page, 200) };
  const upd = {};
  if (req.body.productId) {
    const p = await Product.findOne({ pid: H.clean(req.body.productId, 40) }).select('pid name category').lean();
    if (p) {
      e.productId = p.pid; e.productName = p.name;
      if (type === 'PRODUCT_VIEW') { await Product.updateOne({ _id: p._id }, { $inc: { 'stats.views': 1 } }); upd.$addToSet = { productsViewed: p.pid }; }
      if (type === 'CART_ADD') { await Product.updateOne({ _id: p._id }, { $inc: { 'stats.cartAdds': 1 } }); upd.$inc = { cartAdds: 1 }; }
    }
  }
  if (req.body.category) { e.category = H.clean(req.body.category, 60); if (type === 'CATEGORY_VIEW') upd.$addToSet = { ...(upd.$addToSet || {}), categoriesViewed: e.category }; }
  if (type === 'PAGE_VIEW') upd.$inc = { ...(upd.$inc || {}), pagesViewed: 1 };
  if (type === 'CHECKOUT_START') { upd.$set = { checkoutStarted: true }; await Cart.updateOne({ visitorId, 'items.0': { $exists: true } }, { status: 'CHECKOUT', lastActivityAt: new Date() }); }
  if (type === 'POPUP_OPEN') upd.$set = { popupShown: true };
  const v = await bump(visitorId, upd);
  await Event.create(e);
  if (type === 'CART_ADD' && v) bus.push({ type: 'CART_ADD', text: `${who(v)} added ${e.productName || 'a product'} to cart` });
  res.json({ ok: true });
});

exports.cart = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const raw = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 50);
  const prods = await Product.find({ pid: { $in: raw.map(i => String(i.id || '')) } }).lean();
  const pm = new Map(prods.map(p => [p.pid, p]));
  const prev = await Cart.findOne({ visitorId }).lean();
  const prevAt = new Map(((prev && prev.items) || []).map(i => [i.pid, i.addedAt]));
  const items = raw.map(i => { const p = pm.get(String(i.id)); if (!p) return null;
    return { pid: p.pid, name: p.name, sku: p.sku, image: (p.images && p.images[0] && p.images[0].url) || p.externalImage || '', price: p.price,
      qty: Math.min(1000, Math.max(1, parseInt(i.qty, 10) || 1)), addedAt: prevAt.get(p.pid) || new Date() }; }).filter(Boolean);
  const total = items.reduce((a, i) => a + i.price * i.qty, 0);
  const status = !items.length ? 'EMPTY' : (prev && prev.status === 'CHECKOUT') ? 'CHECKOUT' : 'ACTIVE';
  await Cart.findOneAndUpdate({ visitorId }, { items, total, status, lastActivityAt: new Date() }, { upsert: true });
  res.json({ ok: true, total });
});

exports.profile = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const v0 = await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const set = applyProfile(req.body);
  if (!Object.keys(set).length) return res.json({ ok: true });
  const newPhone = set.phone && !v0.phone;
  await bump(visitorId, { $set: set });
  if (newPhone) { await Event.create({ visitorId, type: 'CHECKOUT_FIELD_UPDATE', meta: { field: 'phone' } }); bus.push({ type: 'PHONE', text: `New phone number submitted${set.name ? ' by ' + set.name : ''}` }); }
  res.json({ ok: true });
});

exports.whatsapp = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const v0 = await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const cart = await Cart.findOne({ visitorId }).lean();
  const pid = H.clean(req.body.productId, 40);
  const p = pid ? await Product.findOne({ pid }).select('pid name').lean() : null;
  const kind = H.clean(req.body.kind, 20) || 'general', page = H.clean(req.body.page, 200);
  const snap = ((cart && cart.items) || []).map(i => ({ pid: i.pid, name: i.name, qty: i.qty, price: i.price }));
  await WAEvent.create({ visitorId, page, kind, productId: p && p.pid, productName: p && p.name, cart: snap, cartTotal: cart ? cart.total : 0, phone: v0.phone, name: v0.name });
  await Event.create({ visitorId, type: 'WHATSAPP_CLICK', productId: p && p.pid, productName: p && p.name, page, meta: { kind } });
  if (p) await Product.updateOne({ pid: p.pid }, { $inc: { 'stats.waClicks': 1 } });
  const v = await bump(visitorId, { $inc: { waClicks: 1 } });
  bus.push({ type: 'WA', text: `New WhatsApp click${v && v.name ? ' from ' + v.name : ''}` });
  res.json({ ok: true });
});

exports.lead = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const name = H.clean(req.body.name, 80), phone = H.normPhone(req.body.phone);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name' });
  if (!H.isPhone(phone)) return res.status(400).json({ error: 'Please enter a valid mobile number' });
  await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  const interest = H.clean(req.body.interest, 60);
  const lead = await Lead.create({ visitorId, name, phone, interest, source: H.clean(req.body.source, 20) || 'POPUP', consent: true });
  await Event.create({ visitorId, type: 'POPUP_SUBMIT', meta: { interest } });
  await bump(visitorId, { $set: { name, phone, popupShown: true, consent: true } });
  bus.push({ type: 'LEAD', text: `${name} requested a price${interest ? ' (' + interest + ')' : ''}` });
  res.json({ ok: true, id: lead._id });
});

exports.enquiry = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const c = req.body.customer || {};
  const customer = { name: H.clean(c.name, 80), phone: H.normPhone(c.phone), email: H.clean(c.email, 120), address: H.clean(c.address, 400), notes: H.clean(c.notes, 600) };
  if (customer.name.length < 2) return res.status(400).json({ error: 'Please enter your full name' });
  if (!H.isPhone(customer.phone)) return res.status(400).json({ error: 'Please enter a valid phone number' });
  if (customer.email && !H.isEmail(customer.email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (customer.address.length < 6) return res.status(400).json({ error: 'Please enter your delivery address' });
  const s = await getSettings();
  const { lines, problems } = await O.priceItems(req.body.items);
  if (!lines.length) return res.status(409).json({ error: problems[0] || 'Your cart is empty', problems });
  const t = O.totals(lines, s);
  const e = await Enquiry.create({ enquiryId: await O.nextEnquiryId(), type: 'ORDER', visitorId, customer, items: lines, totalQty: lines.reduce((a, l) => a + l.qty, 0), ...t });
  const text = O.orderMessage(e, s, H.clean(req.body.base, 200));
  await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  await bump(visitorId, { $inc: { enquiries: 1 }, $set: applyProfile(customer) });
  await Cart.updateOne({ visitorId }, { status: 'COMPLETED', lastActivityAt: new Date() });
  await Product.updateMany({ pid: { $in: lines.map(l => l.pid) } }, { $inc: { 'stats.enquiries': 1 } });
  await Event.create({ visitorId, type: 'ENQUIRY_SUBMITTED', meta: { enquiryId: e.enquiryId, total: t.total } });
  bus.push({ type: 'ENQUIRY', text: `New enquiry ${e.enquiryId} from ${customer.name}` });
  res.json({ ok: true, enquiryId: e.enquiryId, total: t.total, whatsappUrl: O.waUrl(s.whatsappNumber, text), problems });
});

exports.bulk = H.wrap(async (req, res) => {
  const visitorId = vid(req);
  const c = req.body.customer || {};
  const customer = { name: H.clean(c.name, 80), phone: H.normPhone(c.phone), email: H.clean(c.email, 120), notes: H.clean(c.notes, 800) };
  if (customer.name.length < 2) return res.status(400).json({ error: 'Please enter the contact person name' });
  if (!H.isPhone(customer.phone)) return res.status(400).json({ error: 'Please enter a valid phone number' });
  if (customer.email && !H.isEmail(customer.email)) return res.status(400).json({ error: 'Please enter a valid email' });
  const rows = (Array.isArray(req.body.items) ? req.body.items : []).slice(0, 20).map(r => ({
    kind: H.clean(r.kind, 40), product: H.clean(r.product, 120), qty: Math.floor(H.num(r.qty, 0, 0, 100000)),
    budgetMin: H.num(r.budgetMin, 0, 0, 1e8), budgetMax: H.num(r.budgetMax, 0, 0, 1e8) })).filter(r => r.kind && r.qty > 0);
  if (!rows.length) return res.status(400).json({ error: 'Add at least one product with a quantity' });
  const s = await getSettings();
  const e = await Enquiry.create({ enquiryId: await O.nextEnquiryId(), type: 'BULK', visitorId, customer, company: H.clean(req.body.company, 120), city: H.clean(req.body.city, 80),
    bulkItems: rows, totalQty: rows.reduce((a, r) => a + r.qty, 0) });
  await ensureVisitor(visitorId, H.parseUA(req.get('user-agent')));
  await bump(visitorId, { $inc: { bulkEnquiries: 1, enquiries: 1 }, $set: applyProfile(customer) });
  await Event.create({ visitorId, type: 'BULK_ENQUIRY', meta: { enquiryId: e.enquiryId, qty: e.totalQty } });
  bus.push({ type: 'BULK', text: `New bulk enquiry ${e.enquiryId} (${e.totalQty} pcs)` });
  res.json({ ok: true, enquiryId: e.enquiryId, whatsappUrl: O.waUrl(s.whatsappNumber, O.bulkMessage(e)) });
});
