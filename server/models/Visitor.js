const { Schema, model } = require('mongoose');
const VisitorSchema = new Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  code: { type: String, index: true },                       // VST-10293
  firstVisitAt: { type: Date, default: Date.now },
  lastVisitAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now, index: true },
  lastSessionId: String,
  visitCount: { type: Number, default: 0 },
  pagesViewed: { type: Number, default: 0 },
  productsViewed: [String],                                   // distinct product pids (capped)
  categoriesViewed: [String],
  cartAdds: { type: Number, default: 0 },
  checkoutStarted: { type: Boolean, default: false },
  waClicks: { type: Number, default: 0 },
  enquiries: { type: Number, default: 0 },
  bulkEnquiries: { type: Number, default: 0 },
  name: { type: String, default: '' },
  phone: { type: String, default: '', index: true },
  email: { type: String, default: '', index: true },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
  consent: { type: Boolean, default: false },
  source: String,
  device: String, browser: String, os: String,
  score: { type: Number, default: 0, index: true },
  adminNotes: [{ note: String, admin: String, at: { type: Date, default: Date.now } }],
  popupShown: { type: Boolean, default: false }
}, { timestamps: true });
VisitorSchema.index({ name: 'text', phone: 'text', email: 'text', code: 'text' });
VisitorSchema.index({ createdAt: -1 });
module.exports = model('Visitor', VisitorSchema);
