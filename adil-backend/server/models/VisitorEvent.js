const { Schema, model } = require('mongoose');
const TYPES = ['SESSION_START', 'PAGE_VIEW', 'PRODUCT_VIEW', 'CATEGORY_VIEW', 'CART_ADD', 'CART_REMOVE', 'CART_VIEW', 'CHECKOUT_START', 'CHECKOUT_FIELD_UPDATE', 'WHATSAPP_CLICK', 'ENQUIRY_SUBMITTED', 'BULK_ENQUIRY', 'POPUP_OPEN', 'POPUP_SUBMIT', 'STOCK_OUT'];
const EventSchema = new Schema({
  visitorId: { type: String, index: true },
  sessionId: String,
  type: { type: String, enum: TYPES, index: true },
  productId: { type: String, index: true },
  productName: String,
  category: String,
  page: String,
  meta: Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });
EventSchema.index({ type: 1, createdAt: -1 });
EventSchema.index({ visitorId: 1, createdAt: -1 });
const Event = model('VisitorEvent', EventSchema);
Event.TYPES = TYPES;
module.exports = Event;
