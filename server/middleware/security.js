const rateLimit = require('express-rate-limit');
const mk = (windowMs, max, message) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: message } });
module.exports = {
  api: mk(60 * 1000, 300, 'Too many requests, slow down.'),
  track: mk(60 * 1000, 240, 'Too many tracking requests.'),
  forms: mk(60 * 1000, 20, 'Too many submissions. Please wait a minute.'),
  login: mk(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.')
};
