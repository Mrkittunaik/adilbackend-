const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AdminSession = require('../models/AdminSession');
const COOKIE = 'adil_admin';
async function requireAdmin(req, res, next) {
  try {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;   // admin lives on a separate host, so a bearer token is used instead of a cookie
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const p = jwt.verify(token, env.jwtSecret);
    const s = await AdminSession.findOne({ jti: p.jti });
    if (!s) return res.status(401).json({ error: 'Session expired' });
    req.admin = { id: 'admin', jti: p.jti };
    next();
  } catch (e) { res.status(401).json({ error: 'Unauthorized' }); }
}
module.exports = { requireAdmin, COOKIE };
