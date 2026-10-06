// Seeds the DB from server/data/catalog.json (flagged isDemo so admin can archive/delete it).
const Category = require('../models/Category');
const Product = require('../models/Product');
const { slugify } = require('../utils/helpers');

function loadLegacy() {
  return require('../data/catalog.json');   // snapshot of the original storefront catalogue (demo data)
}
async function seedCategories(L) {
  if (await Category.countDocuments()) return;
  let order = 0;
  const groupDocs = {};
  for (const [slug, name] of Object.entries(L.BASE_CATEGORY_LABELS)) groupDocs[slug] = await Category.create({ name, slug, order: order++, legacyId: slug });
  for (const c of L.BASE_CATEGORIES) await Category.create({ name: c.name, slug: c.id, parent: groupDocs[c.group]._id, order: order++, legacyId: c.id });
}
async function seedProducts(L, { reset = false } = {}) {
  const cats = await Category.find().lean();
  let added = 0;
  for (const p of L.PRODUCTS) {
    if (!reset && await Product.exists({ pid: p.id })) continue;
    const group = cats.find(c => !c.parent && c.slug === p.group);
    const sub = cats.find(c => c.parent && group && String(c.parent) === String(group._id) && c.name === p.category);
    await Product.create({
      pid: p.id, name: p.name, slug: slugify(p.name), description: p.desc, shortDescription: (p.desc || '').slice(0, 140),
      category: (sub || group || {})._id, subcategory: p.category, price: p.price, externalImage: p.img, rating: p.rating,
      material: p.material, color: p.color, sku: 'ADL-' + p.id.toUpperCase(), stock: 15, isDemo: true, tags: [p.category, p.group, p.material, p.color].filter(Boolean).map(s => s.toLowerCase()),
      specifications: { Material: p.material, Colour: p.color }
    });
    added++;
  }
  return added;
}
async function seedAll(opts) { const L = loadLegacy(); await seedCategories(L); return seedProducts(L, opts); }
module.exports = { seedAll, loadLegacy };
