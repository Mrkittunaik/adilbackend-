const Visitor = require('../models/Visitor');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Event = require('../models/VisitorEvent');
const WAEvent = require('../models/WhatsAppEvent');
const Lead = require('../models/Lead');
const Enquiry = require('../models/Enquiry');
const bus = require('../services/bus');
const { level } = require('../services/scoring');
const toCSV = require('../utils/csv');
const H = require('../utils/helpers');

const TZ = 'Asia/Kolkata', IST = 330 * 60000, DAY = 86400000;
const startOfDay = (t = Date.now()) => new Date(Math.floor((t + IST) / DAY) * DAY - IST);
const ACTIVE_MIN = 30;
const page = (req) => { const p = Math.max(1, parseInt(req.query.page, 10) || 1), l = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20)); return { p, l, skip: (p - 1) * l }; };
const rangeSince = (r) => r === 'today' ? startOfDay() : r === '7d' ? new Date(Date.now() - 7 * DAY) : r === '30d' ? new Date(Date.now() - 30 * DAY) : new Date(0);

async function distinctVisitors(since, until) {
  const m = { type: 'SESSION_START', createdAt: { $gte: since } }; if (until) m.createdAt.$lt = until;
  const r = await Event.aggregate([{ $match: m }, { $group: { _id: '$visitorId' } }, { $count: 'n' }]);
  return r[0] ? r[0].n : 0;
}
const sessions = (since, until) => { const m = { type: 'SESSION_START', createdAt: { $gte: since } }; if (until) m.createdAt.$lt = until; return Event.countDocuments(m); };
const cartCut = () => new Date(Date.now() - ACTIVE_MIN * 60000);

async function counts() {
  const today = startOfDay(), yday = new Date(today - DAY);
  const [totalVisits, unique, returning, todayV, todayU, ydayV, d7, d30, leads, waClicks, bulk, enq, products, out, low, activeCarts, abandoned, online] = await Promise.all([
    Event.countDocuments({ type: 'SESSION_START' }), Visitor.countDocuments(), Visitor.countDocuments({ visitCount: { $gt: 1 } }),
    sessions(today), distinctVisitors(today), sessions(yday, today), sessions(new Date(Date.now() - 7 * DAY)), sessions(new Date(Date.now() - 30 * DAY)),
    Visitor.countDocuments({ phone: { $ne: '' } }), WAEvent.countDocuments(), Enquiry.countDocuments({ type: 'BULK' }), Enquiry.countDocuments(),
    Product.countDocuments({ isActive: true, deletedAt: { $exists: false } }),
    Product.countDocuments({ isActive: true, deletedAt: { $exists: false }, stockStatus: 'OUT_OF_STOCK' }),
    Product.countDocuments({ isActive: true, deletedAt: { $exists: false }, stockStatus: 'LOW_STOCK' }),
    Cart.countDocuments({ status: { $in: ['ACTIVE', 'CHECKOUT'] }, total: { $gt: 0 }, lastActivityAt: { $gte: cartCut() } }),
    Cart.countDocuments({ status: { $in: ['ACTIVE', 'CHECKOUT'] }, total: { $gt: 0 }, lastActivityAt: { $lt: cartCut() } }),
    Visitor.countDocuments({ lastActivityAt: { $gte: new Date(Date.now() - 5 * 60000) } })
  ]);
  return { totalVisits, unique, returning, today: todayV, todayUnique: todayU, yesterday: ydayV, last7: d7, last30: d30, leads, waClicks, bulk, enquiries: enq, products, outOfStock: out, lowStock: low, activeCarts, abandonedCarts: abandoned, online };
}

exports.stats = H.wrap(async (req, res) => {
  const range = ['today', '7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '7d';
  const since = rangeSince(range);
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 30;
  const chartSince = range === 'all' ? new Date(Date.now() - 30 * DAY) : since;
  const hourly = range === 'today';
  const TYPES = ['SESSION_START', 'WHATSAPP_CLICK', 'PRODUCT_VIEW', 'CART_ADD', 'ENQUIRY_SUBMITTED', 'BULK_ENQUIRY', 'CATEGORY_VIEW', 'CART_REMOVE', 'CHECKOUT_START', 'POPUP_SUBMIT'];
  const [c, rangeCounts, series, topViewed, topCart, topWA, topEnq, topCats, lowList, outList] = await Promise.all([
    counts(),
    Event.aggregate([{ $match: { createdAt: { $gte: since }, type: { $in: TYPES } } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Event.aggregate([{ $match: { createdAt: { $gte: chartSince }, type: { $in: TYPES.slice(0, 6) } } },
      { $group: { _id: { d: { $dateToString: { format: hourly ? '%H:00' : '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, t: '$type' }, n: { $sum: 1 } } }]),
    Product.find({ 'stats.views': { $gt: 0 } }).sort({ 'stats.views': -1 }).limit(5).select('pid name stats').lean(),
    Product.find({ 'stats.cartAdds': { $gt: 0 } }).sort({ 'stats.cartAdds': -1 }).limit(5).select('pid name stats').lean(),
    Product.find({ 'stats.waClicks': { $gt: 0 } }).sort({ 'stats.waClicks': -1 }).limit(5).select('pid name stats').lean(),
    Product.find({ 'stats.enquiries': { $gt: 0 } }).sort({ 'stats.enquiries': -1 }).limit(5).select('pid name stats').lean(),
    Event.aggregate([{ $match: { createdAt: { $gte: since }, type: { $in: ['PRODUCT_VIEW', 'CATEGORY_VIEW'] }, category: { $exists: true, $ne: '' } } }, { $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]),
    Product.find({ isActive: true, deletedAt: { $exists: false }, stockStatus: 'LOW_STOCK' }).limit(8).select('pid name stock').lean(),
    Product.find({ isActive: true, deletedAt: { $exists: false }, stockStatus: 'OUT_OF_STOCK' }).limit(8).select('pid name').lean()
  ]);
  // build continuous labels
  const labels = [];
  if (hourly) for (let h = 0; h < 24; h++) labels.push(String(h).padStart(2, '0') + ':00');
  else for (let i = days - 1; i >= 0; i--) labels.push(new Date(Date.now() + IST - i * DAY).toISOString().slice(0, 10));
  const map = {}; series.forEach(r => { (map[r._id.t] = map[r._id.t] || {})[r._id.d] = r.n; });
  const line = (t) => labels.map(l => (map[t] && map[t][l]) || 0);
  res.json({ range, counts: c, range_counts: Object.fromEntries(rangeCounts.map(r => [r._id, r.n])),
    chart: { labels, visits: line('SESSION_START'), whatsapp: line('WHATSAPP_CLICK'), productViews: line('PRODUCT_VIEW'), cartAdds: line('CART_ADD'), enquiries: line('ENQUIRY_SUBMITTED').map((n, i) => n + line('BULK_ENQUIRY')[i]) },
    top: { viewed: topViewed, cart: topCart, whatsapp: topWA, enquired: topEnq, categories: topCats.map(x => ({ name: x._id, n: x.n })) }, lowStock: lowList, outOfStock: outList });
});

const label = (e, name) => ({
  SESSION_START: 'New visit', PAGE_VIEW: 'Page viewed', PRODUCT_VIEW: `Viewed ${e.productName || 'a product'}`, CATEGORY_VIEW: `Browsed ${e.category || 'a category'}`,
  CART_ADD: `Added ${e.productName || 'item'} to cart`, CART_REMOVE: `Removed ${e.productName || 'item'} from cart`, CART_VIEW: 'Opened cart', CHECKOUT_START: 'Started checkout',
  CHECKOUT_FIELD_UPDATE: 'Submitted phone number', WHATSAPP_CLICK: `Clicked WhatsApp${e.productName ? ' on ' + e.productName : ''}`, ENQUIRY_SUBMITTED: `Submitted enquiry ${(e.meta && e.meta.enquiryId) || ''}`,
  BULK_ENQUIRY: `Bulk enquiry ${(e.meta && e.meta.enquiryId) || ''} (${(e.meta && e.meta.qty) || '?'} pcs)`, POPUP_OPEN: 'Saw enquiry popup', POPUP_SUBMIT: 'Submitted popup form', STOCK_OUT: `${e.productName || 'Product'} is now out of stock`
}[e.type] || e.type);

exports.live = H.wrap(async (req, res) => {
  const c = await counts();
  const evs = await Event.find({ type: { $nin: ['PAGE_VIEW', 'CART_VIEW', 'CATEGORY_VIEW', 'POPUP_OPEN', 'CHECKOUT_FIELD_UPDATE'] } }).sort({ createdAt: -1 }).limit(25).lean();
  const vs = await Visitor.find({ visitorId: { $in: [...new Set(evs.map(e => e.visitorId).filter(Boolean))] } }).select('visitorId name code').lean();
  const vm = new Map(vs.map(v => [v.visitorId, v]));
  res.set('Cache-Control', 'no-store');
  res.json({ counts: c, activity: evs.map(e => { const v = vm.get(e.visitorId); return { at: e.createdAt, type: e.type, who: v ? (v.name || v.code) : 'System', text: label(e) }; }) });
});

/* ---------------- Visitors ---------------- */
exports.visitors = H.wrap(async (req, res) => {
  const { p, l, skip } = page(req);
  const q = H.clean(req.query.q, 80), f = String(req.query.filter || 'all');
  const cond = [];
  if (q) {
    const rx = new RegExp(H.esc(q), 'i');
    const prods = await Product.find({ $or: [{ name: rx }, { sku: rx }] }).select('pid').limit(50).lean();
    const pids = prods.map(x => x.pid);
    const cartV = pids.length ? (await Cart.find({ 'items.pid': { $in: pids } }).select('visitorId').limit(200).lean()).map(c => c.visitorId) : [];
    cond.push({ $or: [{ name: rx }, { phone: rx }, { email: rx }, { code: rx }, { visitorId: rx }, ...(pids.length ? [{ productsViewed: { $in: pids } }, { visitorId: { $in: cartV } }] : [])] });
  }
  const cartIds = async (st, old) => (await Cart.find({ status: { $in: st }, total: { $gt: 0 }, lastActivityAt: old ? { $lt: cartCut() } : { $gte: cartCut() } }).select('visitorId').limit(500).lean()).map(c => c.visitorId);
  if (f === 'new') cond.push({ visitCount: { $lte: 1 } });
  if (f === 'returning') cond.push({ visitCount: { $gt: 1 } });
  if (f === 'cart_active') cond.push({ visitorId: { $in: await cartIds(['ACTIVE', 'CHECKOUT'], false) } });
  if (f === 'cart_abandoned') cond.push({ visitorId: { $in: await cartIds(['ACTIVE', 'CHECKOUT'], true) } });
  if (f === 'whatsapp') cond.push({ waClicks: { $gt: 0 } });
  if (f === 'enquiry') cond.push({ enquiries: { $gt: 0 } });
  if (f === 'bulk') cond.push({ bulkEnquiries: { $gt: 0 } });
  if (f === 'hot') cond.push({ score: { $gte: 16 } });
  if (f === 'warm') cond.push({ score: { $gte: 6, $lt: 16 } });
  if (f === 'cold') cond.push({ score: { $lt: 6 } });
  if (f === 'leads') cond.push({ phone: { $ne: '' } });
  const where = cond.length ? { $and: cond } : {};
  const [rows, total] = await Promise.all([Visitor.find(where).sort({ lastActivityAt: -1 }).skip(skip).limit(l).lean(), Visitor.countDocuments(where)]);
  const carts = await Cart.find({ visitorId: { $in: rows.map(r => r.visitorId) } }).select('visitorId total items status lastActivityAt').lean();
  const cm = new Map(carts.map(c => [c.visitorId, c]));
  res.json({ page: p, pages: Math.ceil(total / l), total, items: rows.map(v => { const c = cm.get(v.visitorId); const open = c && ['ACTIVE', 'CHECKOUT'].includes(c.status) && c.total > 0;
    return { ...v, adminNotes: undefined, level: level(v.score), productsViewedCount: (v.productsViewed || []).length, cartItems: open ? c.items.reduce((a, i) => a + i.qty, 0) : 0, cartValue: open ? c.total : 0,
      cartState: !open ? (c && c.status === 'COMPLETED' ? 'COMPLETED' : 'NONE') : (c.lastActivityAt < cartCut() ? 'ABANDONED' : c.status === 'CHECKOUT' ? 'CHECKOUT' : 'ACTIVE') }; }) });
});
exports.visitor = H.wrap(async (req, res) => {
  const v = await Visitor.findOne({ visitorId: req.params.id }).lean();
  if (!v) return res.status(404).json({ error: 'Visitor not found' });
  const [cart, events, enquiries] = await Promise.all([
    Cart.findOne({ visitorId: v.visitorId }).lean(),
    Event.find({ visitorId: v.visitorId }).sort({ createdAt: -1 }).limit(100).lean(),
    Enquiry.find({ visitorId: v.visitorId }).sort({ createdAt: -1 }).limit(20).lean()
  ]);
  const state = !cart || !cart.items.length ? 'EMPTY' : cart.status === 'COMPLETED' ? 'COMPLETED' : cart.lastActivityAt < cartCut() ? 'ABANDONED' : cart.status;
  res.json({ visitor: { ...v, level: level(v.score) }, cart: cart && { ...cart, state }, timeline: events.map(e => ({ at: e.createdAt, type: e.type, text: label(e), page: e.page })), enquiries });
});
exports.addNote = (Model, idField = '_id') => H.wrap(async (req, res) => {
  const note = H.clean(req.body.note, 800);
  if (!note) return res.status(400).json({ error: 'Note is empty' });
  const key = Model === Visitor ? { visitorId: req.params.id } : Model === Enquiry ? { enquiryId: req.params.id } : { _id: req.params.id };
  const doc = await Model.findOneAndUpdate(key, { $push: { [Model === Visitor ? 'adminNotes' : 'notes']: { note, admin: 'admin', at: new Date() } } }, { new: true });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, notes: doc.notes || doc.adminNotes });
});

/* ---------------- Enquiries & leads ---------------- */
exports.enquiries = H.wrap(async (req, res) => {
  const { p, l, skip } = page(req);
  const where = {};
  if (['ORDER', 'BULK'].includes(req.query.type)) where.type = req.query.type;
  if (req.query.status) where.status = String(req.query.status);
  const q = H.clean(req.query.q, 80);
  if (q) { const rx = new RegExp(H.esc(q), 'i'); where.$or = [{ enquiryId: rx }, { 'customer.name': rx }, { 'customer.phone': rx }, { 'customer.email': rx }, { company: rx }, { city: rx }, { 'items.name': rx }]; }
  const [items, total] = await Promise.all([Enquiry.find(where).sort({ createdAt: -1 }).skip(skip).limit(l).lean(), Enquiry.countDocuments(where)]);
  res.json({ page: p, pages: Math.ceil(total / l), total, items });
});
exports.setEnquiryStatus = H.wrap(async (req, res) => {
  const st = String(req.body.status || '');
  if (!['NEW', 'CONTACTED', 'QUOTED', 'NEGOTIATING', 'CONVERTED', 'CLOSED'].includes(st)) return res.status(400).json({ error: 'Invalid status' });
  const e = await Enquiry.findOneAndUpdate({ enquiryId: req.params.id }, { status: st }, { new: true });
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: e.status });
});
exports.leads = H.wrap(async (req, res) => {
  const { p, l, skip } = page(req);
  const where = {}; const q = H.clean(req.query.q, 80);
  if (req.query.status) where.status = String(req.query.status);
  if (q) { const rx = new RegExp(H.esc(q), 'i'); where.$or = [{ name: rx }, { phone: rx }, { interest: rx }]; }
  const [items, total] = await Promise.all([Lead.find(where).sort({ createdAt: -1 }).skip(skip).limit(l).lean(), Lead.countDocuments(where)]);
  res.json({ page: p, pages: Math.ceil(total / l), total, items });
});
exports.setLeadStatus = H.wrap(async (req, res) => {
  const st = String(req.body.status || '');
  if (!['NEW', 'CONTACTED', 'QUOTED', 'CONVERTED', 'CLOSED'].includes(st)) return res.status(400).json({ error: 'Invalid status' });
  const d = await Lead.findByIdAndUpdate(req.params.id, { status: st }, { new: true });
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
exports.whatsappList = H.wrap(async (req, res) => {
  const { p, l, skip } = page(req);
  const [items, total] = await Promise.all([WAEvent.find().sort({ createdAt: -1 }).skip(skip).limit(l).lean(), WAEvent.countDocuments()]);
  const vs = await Visitor.find({ visitorId: { $in: items.map(i => i.visitorId) } }).select('visitorId name phone code').lean();
  const vm = new Map(vs.map(v => [v.visitorId, v]));
  res.json({ page: p, pages: Math.ceil(total / l), total, items: items.map(i => { const v = vm.get(i.visitorId) || {}; return { ...i, customer: v.name || v.code || 'Visitor', phone: i.phone || v.phone || '' }; }) });
});
exports.carts = H.wrap(async (req, res) => {
  const { p, l, skip } = page(req);
  const abandoned = req.query.state === 'abandoned';
  const where = { status: { $in: ['ACTIVE', 'CHECKOUT'] }, total: { $gt: 0 }, lastActivityAt: abandoned ? { $lt: cartCut() } : { $gte: cartCut() } };
  const [items, total] = await Promise.all([Cart.find(where).sort({ lastActivityAt: -1 }).skip(skip).limit(l).lean(), Cart.countDocuments(where)]);
  const vs = await Visitor.find({ visitorId: { $in: items.map(i => i.visitorId) } }).select('visitorId name phone code').lean();
  const vm = new Map(vs.map(v => [v.visitorId, v]));
  res.json({ page: p, pages: Math.ceil(total / l), total, items: items.map(c => ({ ...c, visitor: vm.get(c.visitorId) || {} })) });
});

/* ---------------- CSV export ---------------- */
exports.exportCSV = H.wrap(async (req, res) => {
  const t = req.params.type, d = (x) => x ? new Date(x).toISOString() : '';
  let rows, cols;
  if (t === 'leads') { rows = await Lead.find().sort({ createdAt: -1 }).limit(5000).lean(); cols = [{ label: 'Date', get: r => d(r.createdAt) }, { label: 'Name', key: 'name' }, { label: 'Phone', key: 'phone' }, { label: 'Interest', key: 'interest' }, { label: 'Status', key: 'status' }, { label: 'Source', key: 'source' }]; }
  else if (t === 'customers') { rows = await Visitor.find({ phone: { $ne: '' } }).sort({ lastActivityAt: -1 }).limit(5000).lean(); cols = [{ label: 'ID', key: 'code' }, { label: 'Name', key: 'name' }, { label: 'Phone', key: 'phone' }, { label: 'Email', key: 'email' }, { label: 'Visits', key: 'visitCount' }, { label: 'WhatsApp clicks', key: 'waClicks' }, { label: 'Score', key: 'score' }, { label: 'Level', get: r => level(r.score) }, { label: 'First visit', get: r => d(r.firstVisitAt) }, { label: 'Last active', get: r => d(r.lastActivityAt) }]; }
  else if (['enquiries', 'bulk', 'orders'].includes(t)) {
    rows = await Enquiry.find(t === 'enquiries' ? {} : { type: t === 'bulk' ? 'BULK' : 'ORDER' }).sort({ createdAt: -1 }).limit(5000).lean();
    cols = [{ label: 'Enquiry ID', key: 'enquiryId' }, { label: 'Type', key: 'type' }, { label: 'Date', get: r => d(r.createdAt) }, { label: 'Status', key: 'status' }, { label: 'Name', get: r => r.customer.name }, { label: 'Phone', get: r => r.customer.phone }, { label: 'Email', get: r => r.customer.email }, { label: 'Company', key: 'company' }, { label: 'City', key: 'city' },
      { label: 'Items', get: r => r.type === 'BULK' ? r.bulkItems.map(b => `${b.kind}: ${b.product} x${b.qty}`).join('; ') : r.items.map(i => `${i.name} x${i.qty}`).join('; ') }, { label: 'Total qty', key: 'totalQty' }, { label: 'Total (INR)', key: 'total' }];
  } else return res.status(404).json({ error: 'Unknown export' });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${t}-${new Date().toISOString().slice(0, 10)}.csv"` }).send('\ufeff' + toCSV(rows, cols));
});
