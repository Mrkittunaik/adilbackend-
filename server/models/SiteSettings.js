const { Schema, model } = require('mongoose');
const S = new Schema({
  key: { type: String, default: 'main', unique: true },
  siteName: { type: String, default: 'Adil Furnitures' },
  whatsappNumber: { type: String, default: '919959334110' },
  businessPhone: { type: String, default: '+91 99593 34110' },
  businessEmail: { type: String, default: 'hello@adilfurnitures.com' },
  businessAddress: { type: String, default: 'Hyderabad, Telangana' },
  currency: { type: String, default: 'INR' },
  freeShipThreshold: { type: Number, default: 25000 },
  deliveryCharge: { type: Number, default: 1499 },
  installationCharge: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  popup: {
    enabled: { type: Boolean, default: true },
    delaySeconds: { type: Number, default: 5 },
    title: { type: String, default: 'Planning to Buy Furniture?' },
    description: { type: String, default: 'Get the best price for your requirement.' },
    cta: { type: String, default: 'Get Best Price' },
    interests: { type: [String], default: ['Chair', 'Table', 'Office Furniture', 'Home Furniture', 'Bulk Order'] },
    showInterest: { type: Boolean, default: true },
    frequencyHours: { type: Number, default: 72 }
  },
  bulk: {
    enabled: { type: Boolean, default: true },
    minQty: { type: Number, default: 10 },
    message: { type: String, default: "Select the furniture you need and we'll send you our best bulk quotation." },
    discountPercent: { type: Number, default: 0 },
    customMessage: { type: String, default: '' }
  },
  home: { heroTitle: { type: String, default: '' }, heroSubtitle: { type: String, default: '' } },
  social: { instagram: { type: String, default: '' }, facebook: { type: String, default: '' }, youtube: { type: String, default: '' } },
  footerText: { type: String, default: '' },
  catalogVersion: { type: Number, default: 1 }     // bumped on any catalog/settings change -> public site refreshes
}, { timestamps: true });
module.exports = model('SiteSettings', S);
