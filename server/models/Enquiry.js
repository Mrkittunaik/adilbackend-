const { Schema, model } = require('mongoose');
// type ORDER = checkout enquiry sent over WhatsApp; type BULK = office bulk enquiry
const EnquirySchema = new Schema({
  enquiryId: { type: String, unique: true, index: true },      // ENQ-20261005-00021
  type: { type: String, enum: ['ORDER', 'BULK'], index: true },
  visitorId: { type: String, index: true },
  customer: { name: String, phone: { type: String, index: true }, email: String, address: String, notes: String },
  company: String, city: String,
  items: [{ pid: String, name: String, sku: String, image: String, price: Number, qty: Number, _id: false }],   // product name is snapshotted so history survives archiving
  bulkItems: [{ kind: String, product: String, qty: Number, budgetMin: Number, budgetMax: Number, _id: false }],
  totalQty: Number,
  subtotal: Number, delivery: Number, installation: Number, total: Number,
  status: { type: String, enum: ['NEW', 'CONTACTED', 'QUOTED', 'NEGOTIATING', 'CONVERTED', 'CLOSED'], default: 'NEW', index: true },
  notes: [{ note: String, admin: String, at: { type: Date, default: Date.now } }]
}, { timestamps: true });
EnquirySchema.index({ createdAt: -1 });
module.exports = model('Enquiry', EnquirySchema);
