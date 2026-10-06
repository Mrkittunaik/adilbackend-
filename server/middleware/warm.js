// Application-level "warm window": every genuine user request pushes warmUntil to now + 3h.
// NOTE: this does NOT stop Render Free from spinning the service down - see README.
const env = require('../config/env');
const state = { lastRealUserActivity: null, warmUntil: null };
function touch() { const now = Date.now(); state.lastRealUserActivity = now; state.warmUntil = now + env.warmMs; }
function middleware(req, _res, next) {
  const p = req.path;
  const real = req.method !== 'OPTIONS' && p.startsWith('/api/') && !p.startsWith('/api/health') && !p.startsWith('/api/admin');
  if (real) touch();
  next();
}
module.exports = { state, middleware, touch };
