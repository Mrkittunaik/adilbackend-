const { wrap } = require('../utils/helpers');
const { publicCatalog } = require('../services/catalog');
const { getSettings, publicSettings } = require('../services/settings');
const warm = require('../middleware/warm');

exports.health = (req, res) => res.json({ status: 'ok', timestamp: Date.now(), warmUntil: warm.state.warmUntil, lastRealUserActivity: warm.state.lastRealUserActivity });

exports.catalog = wrap(async (req, res) => {
  const [data, s] = await Promise.all([publicCatalog(), getSettings()]);
  res.set('Cache-Control', 'no-cache');
  res.json({ version: s.catalogVersion, ...data, settings: publicSettings(s) });
});
// tiny endpoint polled by the storefront; if version changed the client re-fetches the catalog
exports.version = wrap(async (req, res) => {
  const s = await getSettings(true);
  res.set('Cache-Control', 'no-store');
  res.json({ version: s.catalogVersion });
});
