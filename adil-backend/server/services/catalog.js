const Category = require('../models/Category');
const Product = require('../models/Product');
const { optimize } = require('./cloudinary');

async function categoryMaps() {
  const cats = await Category.find().sort({ order: 1, name: 1 }).lean();
  const byId = new Map(cats.map(c => [String(c._id), c]));
  const groupOf = (c) => { let cur = c, g = 0; while (cur && cur.parent && g++ < 3) cur = byId.get(String(cur.parent)); return cur; };
  return { cats, byId, groupOf };
}
function publicProduct(p, maps) {
  const cat = maps.byId.get(String(p.category));
  const group = cat ? maps.groupOf(cat) : null;
  const imgs = (p.images || []).map(i => i.url);
  const hero = imgs[0] || p.externalImage || '';
  return {
    id: p.pid, name: p.name, slug: p.slug,
    category: cat ? cat.name : (p.subcategory || ''), categoryId: cat ? String(cat._id) : '',
    group: group ? group.slug : 'general',
    price: p.price, compareAtPrice: p.compareAtPrice || 0, discount: p.discount || 0,
    img: optimize(hero, 800), imgLarge: optimize(hero, 1400), imgSmall: optimize(hero, 400),
    images: imgs.map(u => optimize(u, 1400)),
    video: (p.videos && p.videos[0]) ? p.videos[0].url : '',
    rating: p.rating, material: p.material, color: p.color,
    desc: p.description || p.shortDescription, shortDesc: p.shortDescription,
    stock: p.stock, stockStatus: p.stockStatus, sku: p.sku, tags: p.tags || [],
    specs: p.specifications || {}, variants: p.variants || [],
    isFeatured: !!p.isFeatured, isNew: !!p.isNewArrival, isPopular: !!p.isPopular
  };
}
async function publicCatalog() {
  const maps = await categoryMaps();
  const activeGroup = new Set(maps.cats.filter(c => !c.parent && c.isActive).map(c => String(c._id)));
  const okCat = (c) => c && c.isActive && activeGroup.has(String(c.parent || c._id));
  const products = await Product.find({ isActive: true, deletedAt: { $exists: false }, stockStatus: { $ne: 'HIDDEN' } }).sort({ createdAt: -1 }).lean();
  const list = products.filter(p => { const c = maps.byId.get(String(p.category)); return !c || okCat(c); }).map(p => publicProduct(p, maps));
  const groups = maps.cats.filter(c => !c.parent && c.isActive).map(g => ({ id: String(g._id), slug: g.slug, name: g.name }));
  const categories = maps.cats.filter(c => c.parent && c.isActive && activeGroup.has(String(c.parent)))
    .map(c => ({ id: String(c._id), name: c.name, slug: c.slug, group: maps.byId.get(String(c.parent)).slug }));
  return { products: list, groups, categories };
}
module.exports = { categoryMaps, publicProduct, publicCatalog };
