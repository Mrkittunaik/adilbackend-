const Category = require('../models/Category');
const Product = require('../models/Product');
const SiteSettings = require('../models/SiteSettings');
const Event = require('../models/VisitorEvent');
const cloud = require('../services/cloudinary');
const bus = require('../services/bus');
const { getSettings, bumpVersion, invalidate } = require('../services/settings');
const { categoryMaps } = require('../services/catalog');
const H = require('../utils/helpers');

/* ---------------- helpers ---------------- */
const adminProduct = (p, maps) => {
  const cat = maps.byId.get(String(p.category)); const g = cat && maps.groupOf(cat);
  return { _id: p._id, pid: p.pid, name: p.name, sku: p.sku, price: p.price, compareAtPrice: p.compareAtPrice, discount: p.discount, stock: p.stock, stockStatus: p.stockStatus,
    lowStockThreshold: p.lowStockThreshold, isActive: p.isActive, isFeatured: p.isFeatured, isNewArrival: p.isNewArrival, isPopular: p.isPopular, isDemo: p.isDemo, deletedAt: p.deletedAt,
    category: p.category, categoryName: cat ? cat.name : p.subcategory, groupName: g ? g.name : '', description: p.description, shortDescription: p.shortDescription,
    tags: p.tags, specifications: p.specifications || {}, material: p.material, color: p.color, rating: p.rating,
    images: p.images || [], videos: p.videos || [], externalImage: p.externalImage, thumb: (p.images && p.images[0] && p.images[0].thumb) || p.externalImage || '', stats: p.stats || {} };
};
const toTags = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(t => H.clean(t, 30).toLowerCase()).filter(Boolean).slice(0, 20);
async function fields(b, partial) {
  const o = {};
  const str = (k, n) => { if (b[k] !== undefined) o[k] = H.clean(b[k], n); };
  ['name'].forEach(k => str(k, 140)); str('sku', 40); str('shortDescription', 300); str('material', 60); str('color', 60); str('subcategory', 60);
  if (b.description !== undefined) o.description = String(b.description).replace(/[<>]/g, '').slice(0, 4000);
  if (b.price !== undefined) o.price = H.num(b.price, 0, 0, 1e8);
  if (b.compareAtPrice !== undefined) o.compareAtPrice = H.num(b.compareAtPrice, 0, 0, 1e8);
  if (b.discount !== undefined) o.discount = H.num(b.discount, 0, 0, 95);
  if (b.stock !== undefined) o.stock = Math.floor(H.num(b.stock, 0, 0, 1e6));
  if (b.lowStockThreshold !== undefined) o.lowStockThreshold = Math.floor(H.num(b.lowStockThreshold, 5, 0, 1e5));
  if (b.rating !== undefined) o.rating = H.num(b.rating, 4.5, 0, 5);
  ['isActive', 'isFeatured', 'isNewArrival', 'isPopular', 'isDemo'].forEach(k => { if (b[k] !== undefined) o[k] = !!b[k]; });
  if (b.tags !== undefined) o.tags = toTags(b.tags);
  if (b.specifications !== undefined && typeof b.specifications === 'object') {
    o.specifications = {}; Object.entries(b.specifications).slice(0, 30).forEach(([k, v]) => { const kk = H.clean(k, 40).replace(/[.$]/g, ''); if (kk) o.specifications[kk] = H.clean(v, 200); });
  }
  if (b.category !== undefined) {
    if (!H.isObjId(b.category)) throw Object.assign(new Error('Invalid category'), { status: 400 });
    if (!(await Category.exists({ _id: b.category }))) throw Object.assign(new Error('Category not found'), { status: 400 });
    o.category = b.category;
  }
  if (!partial) {
    if (!o.name) throw Object.assign(new Error('Product name is required'), { status: 400 });
    if (o.price === undefined) throw Object.assign(new Error('Price is required'), { status: 400 });
    if (!o.category) throw Object.assign(new Error('Select a category'), { status: 400 });
  }
  return o;
}
const stockEvent = async (p) => { bus.push({ type: 'STOCK', text: `${p.name} is now out of stock` }); await Event.create({ type: 'STOCK_OUT', productId: p.pid, productName: p.name }); };

/* ---------------- products ---------------- */
exports.listProducts = H.wrap(async (req, res) => {
  const p = Math.max(1, parseInt(req.query.page, 10) || 1), l = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const where = {}; const st = String(req.query.status || 'active'); const q = H.clean(req.query.q, 80);
  if (st === 'active') { where.isActive = true; where.deletedAt = { $exists: false }; }
  else if (st === 'archived') where.$or = [{ isActive: false }, { deletedAt: { $exists: true } }];
  else if (st === 'out') { where.stockStatus = 'OUT_OF_STOCK'; where.deletedAt = { $exists: false }; }
  else if (st === 'low') { where.stockStatus = 'LOW_STOCK'; where.deletedAt = { $exists: false }; }
  else if (st === 'hidden') where.stockStatus = 'HIDDEN';
  else if (st === 'demo') where.isDemo = true;
  if (H.isObjId(req.query.category)) { const kids = await Category.find({ parent: req.query.category }).select('_id').lean(); where.category = { $in: [req.query.category, ...kids.map(k => k._id)] }; }
  if (q) { const rx = new RegExp(H.esc(q), 'i'); where.$and = [{ $or: [{ name: rx }, { sku: rx }, { tags: rx }, { pid: rx }] }]; }
  const [rows, total, demo, maps] = await Promise.all([Product.find(where).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(), Product.countDocuments(where), Product.countDocuments({ isDemo: true }), categoryMaps()]);
  res.json({ page: p, pages: Math.ceil(total / l), total, demoCount: demo, items: rows.map(r => adminProduct(r, maps)) });
});
exports.getProduct = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid }).lean();
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(adminProduct(p, await categoryMaps()));
});
exports.createProduct = H.wrap(async (req, res) => {
  const o = await fields(req.body, false);
  const s = await getSettings();
  const p = new Product({ ...o, pid: 'p' + Date.now().toString(36) + H.rid(2), slug: H.slugify(o.name), lowStockThreshold: o.lowStockThreshold ?? s.lowStockThreshold, stock: o.stock ?? 10, isDemo: false });
  if (!p.sku) p.sku = 'ADL-' + p.pid.slice(1, 7).toUpperCase();
  await p.save();
  await bumpVersion();
  res.status(201).json(adminProduct(p.toObject(), await categoryMaps()));
});
exports.updateProduct = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const was = p.stockStatus;
  const o = await fields(req.body, true);
  if (o.name && o.name !== p.name) o.slug = H.slugify(o.name);
  p.set(o);
  if (req.body.stockStatus === 'HIDDEN') p.stockStatus = 'HIDDEN';
  else if (p.stockStatus === 'HIDDEN' && req.body.stockStatus && req.body.stockStatus !== 'HIDDEN') { p.stockStatus = 'IN_STOCK'; p.recomputeStock(); }
  await p.save();
  if (p.stockStatus === 'OUT_OF_STOCK' && was !== 'OUT_OF_STOCK') await stockEvent(p);
  await bumpVersion();
  res.json(adminProduct(p.toObject(), await categoryMaps()));
});
// Quick stock editor: stock number drives status; admin can also force a status
exports.setStock = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const was = p.stockStatus, b = req.body;
  if (b.lowStockThreshold !== undefined) p.lowStockThreshold = Math.floor(H.num(b.lowStockThreshold, 5, 0, 1e5));
  if (b.stock !== undefined) { p.stock = Math.floor(H.num(b.stock, 0, 0, 1e6)); if (p.stockStatus === 'HIDDEN' && b.unhide) p.stockStatus = 'IN_STOCK'; p.recomputeStock(); }
  if (b.stockStatus === 'OUT_OF_STOCK') { p.stock = 0; p.stockStatus = 'OUT_OF_STOCK'; }
  if (b.stockStatus === 'IN_STOCK') { if (p.stock <= 0) p.stock = Math.max(1, p.lowStockThreshold + 1); p.stockStatus = 'IN_STOCK'; p.recomputeStock(); }
  if (b.stockStatus === 'HIDDEN') p.stockStatus = 'HIDDEN';
  await p.save();
  if (p.stockStatus === 'OUT_OF_STOCK' && was !== 'OUT_OF_STOCK') await stockEvent(p);
  await bumpVersion();
  res.json({ ok: true, stock: p.stock, stockStatus: p.stockStatus });
});
exports.archiveProduct = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  if (req.query.hard === '1') {                                   // permanent delete only allowed for already-archived products
    if (p.isActive && !p.deletedAt) return res.status(409).json({ error: 'Archive the product first' });
    for (const m of [...p.images, ...p.videos]) await cloud.destroy(m.publicId, m.resourceType);
    await p.deleteOne();
  } else { p.isActive = false; p.deletedAt = new Date(); p.deletedBy = 'admin'; await p.save(); }
  await bumpVersion();
  res.json({ ok: true });
});
exports.restoreProduct = H.wrap(async (req, res) => {
  const p = await Product.findOneAndUpdate({ pid: req.params.pid }, { isActive: true, $unset: { deletedAt: 1, deletedBy: 1 } }, { new: true });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  await bumpVersion(); res.json({ ok: true });
});
exports.duplicateProduct = H.wrap(async (req, res) => {
  const src = await Product.findOne({ pid: req.params.pid }).lean();
  if (!src) return res.status(404).json({ error: 'Product not found' });
  const pid = 'p' + Date.now().toString(36) + H.rid(2);
  // media is NOT copied (a shared Cloudinary asset would be destroyed with the original)
  const p = await Product.create({ ...src, _id: undefined, pid, name: 'Copy of ' + src.name, slug: H.slugify('copy ' + src.name), sku: (src.sku || 'ADL') + '-COPY', images: [], videos: [], cloudinaryPublicIds: [], isDemo: false, isActive: false,
    deletedAt: undefined, stats: { views: 0, cartAdds: 0, enquiries: 0, waClicks: 0 }, createdAt: undefined, updatedAt: undefined });
  await bumpVersion(); res.status(201).json({ ok: true, pid: p.pid });
});
exports.demoAction = H.wrap(async (req, res) => {
  const action = req.body.action;
  if (action === 'archive') { const r = await Product.updateMany({ isDemo: true, deletedAt: { $exists: false } }, { isActive: false, deletedAt: new Date(), deletedBy: 'admin' }); await bumpVersion(); return res.json({ ok: true, affected: r.modifiedCount }); }
  if (action === 'delete') { const r = await Product.deleteMany({ isDemo: true, isActive: false }); await bumpVersion(); return res.json({ ok: true, affected: r.deletedCount }); }  // only demo AND already archived
  if (action === 'import') { const { seedAll } = require('../services/seed'); const n = await seedAll(); await bumpVersion(); return res.json({ ok: true, affected: n }); }
  res.status(400).json({ error: 'Invalid action' });
});

/* ---- media (Cloudinary) ---- */
exports.uploadMedia = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'No files received' });
  const out = [];
  for (const f of files) {
    const isVideo = f.mimetype.startsWith('video/');
    if (!isVideo && f.size > 8 * 1024 * 1024) return res.status(400).json({ error: `${f.originalname}: images must be under 8 MB` });
    const m = await cloud.upload(f.buffer, { resourceType: isVideo ? 'video' : 'image' });
    (isVideo ? p.videos : p.images).push(m); p.cloudinaryPublicIds.push(m.publicId); out.push(m);
  }
  if (p.isDemo) p.isDemo = false;      // a demo product with real media is now real content
  await p.save(); await bumpVersion();
  res.json({ ok: true, added: out, images: p.images, videos: p.videos });
});
exports.deleteMedia = H.wrap(async (req, res) => {
  const publicId = String(req.query.publicId || '');
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const m = [...p.images, ...p.videos].find(x => x.publicId === publicId);
  if (!m) return res.status(404).json({ error: 'Media not found' });
  await cloud.destroy(publicId, m.resourceType);
  p.images = p.images.filter(x => x.publicId !== publicId); p.videos = p.videos.filter(x => x.publicId !== publicId);
  p.cloudinaryPublicIds = p.cloudinaryPublicIds.filter(x => x !== publicId);
  await p.save(); await bumpVersion();
  res.json({ ok: true, images: p.images, videos: p.videos });
});
exports.reorderMedia = H.wrap(async (req, res) => {
  const p = await Product.findOne({ pid: req.params.pid });
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const order = Array.isArray(req.body.order) ? req.body.order.map(String) : [];
  const idx = (m) => { const i = order.indexOf(m.publicId); return i === -1 ? 999 : i; };
  p.images = [...p.images].sort((a, b) => idx(a) - idx(b));   // first image = main image
  await p.save(); await bumpVersion();
  res.json({ ok: true, images: p.images });
});

/* ---------------- categories ---------------- */
exports.listCategories = H.wrap(async (req, res) => {
  const cats = await Category.find().sort({ order: 1, name: 1 }).lean();
  const counts = await Product.aggregate([{ $match: { deletedAt: { $exists: false } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map(c => [String(c._id), c.n]));
  res.json({ items: cats.map(c => ({ ...c, productCount: cm.get(String(c._id)) || 0 })) });
});
async function uniqueSlug(name, exceptId) {
  const base = H.slugify(name); let s = base, i = 2;
  while (await Category.exists({ slug: s, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })) s = base + '-' + i++;
  return s;
}
exports.createCategory = H.wrap(async (req, res) => {
  const name = H.clean(req.body.name, 60);
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  let parent = null;
  if (req.body.parent) { if (!H.isObjId(req.body.parent) || !(parent = await Category.findOne({ _id: req.body.parent, parent: null }))) return res.status(400).json({ error: 'Parent must be a top-level category' }); }
  const last = await Category.findOne().sort({ order: -1 }).lean();
  const c = await Category.create({ name, slug: await uniqueSlug(name), parent: parent ? parent._id : null, order: (last ? last.order : 0) + 1, isActive: req.body.isActive !== false });
  await bumpVersion(); res.status(201).json(c);
});
exports.updateCategory = H.wrap(async (req, res) => {
  const c = await Category.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Category not found' });
  if (req.body.name !== undefined) { const n = H.clean(req.body.name, 60); if (!n) return res.status(400).json({ error: 'Name required' }); c.name = n; }   // slug is kept: products & URLs stay linked
  if (req.body.isActive !== undefined) c.isActive = !!req.body.isActive;
  await c.save(); await bumpVersion(); res.json(c);
});
exports.deleteCategory = H.wrap(async (req, res) => {
  const c = await Category.findById(req.params.id);
  if (!c) return res.status(404).json({ error: 'Category not found' });
  const kids = await Category.find({ parent: c._id }).select('_id').lean();
  const ids = [c._id, ...kids.map(k => k._id)];
  const n = await Product.countDocuments({ category: { $in: ids } });
  if (n && !H.isObjId(req.query.reassignTo)) return res.status(409).json({ error: `${n} product(s) use this category. Choose another category to move them to.`, productCount: n });
  if (n) { if (ids.some(i => String(i) === req.query.reassignTo)) return res.status(400).json({ error: 'Pick a different category' }); await Product.updateMany({ category: { $in: ids } }, { category: req.query.reassignTo }); }
  await Category.deleteMany({ _id: { $in: ids } });
  await bumpVersion(); res.json({ ok: true });
});
exports.reorderCategories = H.wrap(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(H.isObjId);
  await Promise.all(ids.map((id, i) => Category.updateOne({ _id: id }, { order: i })));
  await bumpVersion(); res.json({ ok: true });
});

/* ---------------- settings ---------------- */
const ROOTS = { siteName: 's', whatsappNumber: 'wa', businessPhone: 's', businessEmail: 's', businessAddress: 's', currency: 's', freeShipThreshold: 'n', deliveryCharge: 'n', installationCharge: 'n', lowStockThreshold: 'n', footerText: 's' };
const NESTED = { popup: { enabled: 'b', delaySeconds: 'n', title: 's', description: 's', cta: 's', showInterest: 'b', frequencyHours: 'n', interests: 'a' }, bulk: { enabled: 'b', minQty: 'n', message: 's', discountPercent: 'n', customMessage: 's' },
  home: { heroTitle: 's', heroSubtitle: 's' }, social: { instagram: 's', facebook: 's', youtube: 's' } };
const cast = (t, v) => t === 'n' ? H.num(v, 0, 0, 1e8) : t === 'b' ? !!v : t === 'a' ? (Array.isArray(v) ? v : String(v).split(',')).map(x => H.clean(x, 40)).filter(Boolean).slice(0, 12) : t === 'wa' ? String(v).replace(/\D/g, '').slice(0, 15) : H.clean(v, 400);
exports.getSettings = H.wrap(async (req, res) => res.json(await getSettings(true)));
exports.saveSettings = H.wrap(async (req, res) => {
  const set = {}, b = req.body || {};
  for (const [k, t] of Object.entries(ROOTS)) if (b[k] !== undefined) set[k] = cast(t, b[k]);
  for (const [root, keys] of Object.entries(NESTED)) if (b[root] && typeof b[root] === 'object') for (const [k, t] of Object.entries(keys)) if (b[root][k] !== undefined) set[`${root}.${k}`] = cast(t, b[root][k]);
  if (set.whatsappNumber !== undefined && set.whatsappNumber.length < 10) return res.status(400).json({ error: 'Enter a valid WhatsApp number with country code' });
  const s = await SiteSettings.findOneAndUpdate({ key: 'main' }, { $set: set, $inc: { catalogVersion: 1 } }, { new: true, upsert: true });
  invalidate(); res.json(s);
});
