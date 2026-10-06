const Product = require('../models/Product');
const Counter = require('../models/Counter');
const { inr } = require('../utils/helpers');
const { optimize } = require('./cloudinary');

// Server-side pricing: never trust prices/totals from the browser
async function priceItems(rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 50)
    .map(i => ({ pid: String(i.id || i.pid || '').slice(0, 40), qty: Math.min(1000, Math.max(1, parseInt(i.qty, 10) || 1)) })).filter(i => i.pid);
  const prods = await Product.find({ pid: { $in: items.map(i => i.pid) } }).lean();
  const map = new Map(prods.map(p => [p.pid, p]));
  const lines = [], problems = [];
  for (const i of items) {
    const p = map.get(i.pid);
    if (!p || !p.isActive || p.deletedAt) { problems.push(`${i.pid} is no longer available`); continue; }
    if (p.stockStatus === 'OUT_OF_STOCK' || p.stock <= 0) { problems.push(`${p.name} is out of stock`); continue; }
    lines.push({ pid: p.pid, name: p.name, sku: p.sku, image: optimize((p.images && p.images[0] && p.images[0].url) || p.externalImage, 300), price: p.price, qty: i.qty });
  }
  return { lines, problems };
}
function totals(lines, s) {
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0);
  const delivery = subtotal === 0 || subtotal >= s.freeShipThreshold ? 0 : s.deliveryCharge;
  const installation = subtotal === 0 ? 0 : (s.installationCharge || 0);
  return { subtotal, delivery, installation, total: subtotal + delivery + installation };
}
async function nextEnquiryId() {
  const d = new Date(), ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const n = await Counter.next('enq-' + ymd);
  return `ENQ-${ymd}-${String(n).padStart(5, '0')}`;
}
function orderMessage(e, s, base) {
  const c = e.customer;
  let m = `Hello ${s.siteName}, I placed enquiry *${e.enquiryId}*:\n\n`;
  m += e.items.map((it, i) => `${i + 1}. *${it.name}*\nPrice: ${inr(it.price)}\nQuantity: ${it.qty}\nAmount: ${inr(it.price * it.qty)}` + (base ? `\nLink: ${base}#/product/${it.pid}` : '')).join('\n\n');
  m += `\n\nSubtotal: ${inr(e.subtotal)}\nDelivery: ${e.delivery ? inr(e.delivery) : 'Free'}`;
  if (e.installation) m += `\nInstallation: ${inr(e.installation)}`;
  m += `\n*Total: ${inr(e.total)}*\n\n*Customer details*\nName: ${c.name}\nPhone: ${c.phone}`;
  if (c.email) m += `\nEmail: ${c.email}`;
  m += `\nAddress: ${c.address}`;
  if (c.notes) m += `\nNotes: ${c.notes}`;
  return m + `\n\nEnquiry ID: ${e.enquiryId}`;
}
function bulkMessage(e) {
  let m = `*OFFICE BULK ENQUIRY*\n\nCompany: ${e.company || '-'}\nContact: ${e.customer.name}\nPhone: ${e.customer.phone}`;
  if (e.customer.email) m += `\nEmail: ${e.customer.email}`;
  m += '\n';
  for (const b of e.bulkItems) {
    m += `\n*${b.kind}*\nProduct: ${b.product || '-'}\nQuantity: ${b.qty}\nBudget: ${b.budgetMin || b.budgetMax ? `${inr(b.budgetMin)} - ${inr(b.budgetMax)} each` : 'Open'}\n`;
  }
  m += `\nDelivery Location: ${e.city || '-'}`;
  if (e.customer.notes) m += `\n\nNotes: ${e.customer.notes}`;
  return m + `\n\nEnquiry ID: ${e.enquiryId}`;
}
const waUrl = (num, text) => `https://wa.me/${String(num).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
module.exports = { priceItems, totals, nextEnquiryId, orderMessage, bulkMessage, waUrl };
