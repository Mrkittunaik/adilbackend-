const { Schema, model } = require('mongoose');
// Dedicated record per WhatsApp click (the click is also mirrored in VisitorEvent for the timeline)
const WASchema = new Schema({
  visitorId: { type: String, index: true },
  page: String,
  productId: String, productName: String,
  kind: String,                       // product | cart | bulk | custom | general | checkout
  cart: [{ pid: String, name: String, qty: Number, price: Number, _id: false }],
  cartTotal: Number,
  phone: String, name: String,
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
module.exports = model('WhatsAppEvent', WASchema);
