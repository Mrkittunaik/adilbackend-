const { Schema, model } = require('mongoose');
const CartSchema = new Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  items: [{ pid: String, name: String, image: String, price: Number, qty: Number, sku: String, addedAt: { type: Date, default: Date.now }, _id: false }],
  total: { type: Number, default: 0 },
  status: { type: String, enum: ['EMPTY', 'ACTIVE', 'CHECKOUT', 'COMPLETED'], default: 'EMPTY', index: true },
  lastActivityAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });
module.exports = model('Cart', CartSchema);
