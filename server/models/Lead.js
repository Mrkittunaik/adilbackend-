const { Schema, model } = require('mongoose');
// Popup / contact-form leads
const LeadSchema = new Schema({
  visitorId: { type: String, index: true },
  name: String, phone: { type: String, index: true }, email: String,
  interest: String, message: String, source: { type: String, default: 'POPUP' },
  status: { type: String, enum: ['NEW', 'CONTACTED', 'QUOTED', 'CONVERTED', 'CLOSED'], default: 'NEW', index: true },
  consent: { type: Boolean, default: true },
  notes: [{ note: String, admin: String, at: { type: Date, default: Date.now } }]
}, { timestamps: true });
LeadSchema.index({ createdAt: -1 });
module.exports = model('Lead', LeadSchema);
