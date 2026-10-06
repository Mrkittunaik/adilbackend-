const crypto = require('crypto');
const clean = (v, n = 200) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const num = (v, d = 0, min = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const isPhone = (v) => /^\+?\d[\d\s-]{7,14}$/.test(String(v || '').trim());
const normPhone = (v) => String(v || '').replace(/[^\d+]/g, '').slice(0, 15);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
const isUUID = (v) => /^[0-9a-f-]{16,64}$/i.test(String(v || ''));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
const rid = (n = 6) => crypto.randomBytes(n).toString('hex').slice(0, n);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const isObjId = (v) => /^[a-f\d]{24}$/i.test(String(v || ''));
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function parseUA(ua = '') {
  const device = /tablet|ipad/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox|fxios/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device, browser, os };
}
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
module.exports = { clean, num, isPhone, normPhone, isEmail, isUUID, slugify, rid, safeEq, isObjId, esc, wrap, parseUA, inr };
