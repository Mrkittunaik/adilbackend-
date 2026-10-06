const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const AdminSession = require('../models/AdminSession');
const { COOKIE } = require('../middleware/auth');
const { safeEq, wrap } = require('../utils/helpers');

const TTL = 12 * 60 * 60 * 1000;
const fails = new Map();   // ip -> {n, until}  (brute-force lockout on top of the rate limiter)
const cookieOpts = () => ({ httpOnly: true, sameSite: 'strict', secure: env.prod, path: '/', maxAge: TTL });

exports.login = wrap(async (req, res) => {
  if (!env.adminCode || !env.jwtSecret) return res.status(503).json({ error: 'Admin login is not configured on the server' });
  const ip = req.ip, f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  const code = String((req.body && req.body.code) || '');
  if (!code || !safeEq(code, env.adminCode)) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 15 * 60 * 1000; f.n = 0; }
    fails.set(ip, f);
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'Invalid admin code' });
  }
  fails.delete(ip);
  const jti = crypto.randomBytes(16).toString('hex');
  await AdminSession.create({ jti, ip, userAgent: (req.get('user-agent') || '').slice(0, 200), expiresAt: new Date(Date.now() + TTL) });
  const token = jwt.sign({ jti, role: 'admin' }, env.jwtSecret, { expiresIn: TTL / 1000 });
  res.json({ ok: true, token, expiresIn: TTL / 1000, frontendUrl: env.frontendUrl });
});
exports.logout = wrap(async (req, res) => {
  if (req.admin) await AdminSession.deleteOne({ jti: req.admin.jti });
  res.json({ ok: true });
});
exports.me = (req, res) => res.json({ ok: true, admin: true, frontendUrl: env.frontendUrl });
