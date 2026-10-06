const { Schema, model } = require('mongoose');
const Media = new Schema({ url: String, publicId: String, resourceType: { type: String, default: 'image' }, thumb: String }, { _id: false });

const ProductSchema = new Schema({
  pid: { type: String, required: true, unique: true, index: true },   // public id used in #/product/<pid> and carts (keeps old "p01" links alive)
  name: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, index: true },
  description: { type: String, default: '', maxlength: 4000 },
  shortDescription: { type: String, default: '', maxlength: 300 },
  category: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
  subcategory: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 95 },
  images: [Media],
  videos: [Media],
  externalImage: { type: String, default: '' },     // legacy demo image (unsplash) until a real image is uploaded
  cloudinaryPublicIds: [String],
  sku: { type: String, index: true, default: '' },
  stock: { type: Number, default: 10, min: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  stockStatus: { type: String, enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'HIDDEN'], default: 'IN_STOCK', index: true },
  isActive: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },
  isPopular: { type: Boolean, default: false },
  tags: [String],
  specifications: { type: Schema.Types.Mixed, default: {} },
  variants: [{ name: String, options: [String] }],
  rating: { type: Number, default: 4.5 },
  material: { type: String, default: '' },
  color: { type: String, default: '' },
  isDemo: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: String,
  stats: { views: { type: Number, default: 0 }, cartAdds: { type: Number, default: 0 }, enquiries: { type: Number, default: 0 }, waClicks: { type: Number, default: 0 } }
}, { timestamps: true });

ProductSchema.index({ name: 'text', sku: 'text', tags: 'text' });
ProductSchema.index({ createdAt: -1 });

// Stock rules: 0 => OUT_OF_STOCK, <= threshold => LOW_STOCK. HIDDEN is a manual state and is kept.
ProductSchema.methods.recomputeStock = function () {
  if (this.stockStatus === 'HIDDEN') return;
  if (this.stock <= 0) this.stockStatus = 'OUT_OF_STOCK';
  else if (this.stock <= this.lowStockThreshold) this.stockStatus = 'LOW_STOCK';
  else this.stockStatus = 'IN_STOCK';
};
ProductSchema.pre('save', function (next) {
  if (this.compareAtPrice > this.price && !this.discount) this.discount = Math.round((1 - this.price / this.compareAtPrice) * 100);
  if (this.isModified('stock') || this.isModified('lowStockThreshold') || this.isNew) {
    if (this.stockStatus === 'HIDDEN' && !this.isModified('stockStatus')) { /* keep */ } else this.recomputeStock();
  }
  next();
});
module.exports = model('Product', ProductSchema);
