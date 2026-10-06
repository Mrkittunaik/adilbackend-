const SiteSettings = require('../models/SiteSettings');
const env = require('../config/env');
let cache = null, cacheAt = 0;
async function getSettings(force) {
  if (!force && cache && Date.now() - cacheAt < 15000) return cache;
  let s = await SiteSettings.findOne({ key: 'main' });
  if (!s) s = await SiteSettings.create({ key: 'main', whatsappNumber: env.whatsapp });
  cache = s; cacheAt = Date.now();
  return s;
}
async function bumpVersion() {
  const s = await SiteSettings.findOneAndUpdate({ key: 'main' }, { $inc: { catalogVersion: 1 } }, { new: true, upsert: true });
  cache = s; cacheAt = Date.now();
  return s.catalogVersion;
}
const publicSettings = (s) => ({
  siteName: s.siteName, whatsappNumber: s.whatsappNumber, businessPhone: s.businessPhone, businessEmail: s.businessEmail,
  businessAddress: s.businessAddress, currency: s.currency, freeShipThreshold: s.freeShipThreshold, deliveryCharge: s.deliveryCharge,
  installationCharge: s.installationCharge, popup: s.popup, bulk: s.bulk, home: s.home, social: s.social, footerText: s.footerText
});
module.exports = { getSettings, bumpVersion, publicSettings, invalidate: () => { cache = null; } };
