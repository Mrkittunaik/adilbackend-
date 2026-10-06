const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');
const sec = require('./middleware/security');
const warm = require('./middleware/warm');
const err = require('./middleware/error');

const ROOT = path.join(__dirname, '..');
const app = express();
app.set('trust proxy', 1);                        // Render sits behind a proxy (correct IPs for rate limiting)
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], scriptSrcAttr: ["'unsafe-inline'"],   // storefront uses inline onerror image fallbacks
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    imgSrc: ["'self'", 'data:', 'https:'], mediaSrc: ["'self'", 'https://res.cloudinary.com'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'self'"], upgradeInsecureRequests: env.prod ? [] : null } },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
const origins = [...new Set([...env.corsOrigin.split(','), 'https://adilfurnitures.com', 'https://www.adilfurnitures.com'].map(x => x.trim().replace(/\/$/, '')).filter(Boolean))];
if (!origins.length) console.warn('[config] CORS_ORIGIN is empty - the separate frontend will be blocked by browsers');
app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)), credentials: true, maxAge: 86400 }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(warm.middleware);

// DB readiness gate: the web server starts instantly (fast cold start); API answers 503 until Mongo is connected
let dbReady = false;
app.use('/api', (req, res, next) => (req.path === '/health' || dbReady ? next() : res.status(503).set('Retry-After', '3').json({ error: 'Starting up, please retry' })));
app.use('/api', sec.api);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));

app.get('/', (req, res) => res.json({ service: 'adil-furnitures-api', status: 'ok' }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(err.handler);

app.listen(env.port, () => console.log(`[server] listening on ${env.port}`));

(async () => {
  if (env.prod && !env.jwtSecret) console.error('[config] JWT_SECRET is missing - admin login disabled');
  if (!env.adminCode) console.warn('[config] ADMIN_LOGIN_CODE is not set - admin login disabled');
  for (let i = 0; !dbReady; i++) {
    try {
      await connectDB();
      const { getSettings } = require('./services/settings');
      await getSettings(true);
      if (env.seedOnEmpty && !(await require('./models/Product').estimatedDocumentCount())) {
        const n = await require('./services/seed').seedAll(); console.log(`[seed] imported ${n} demo products`);
        await require('./services/settings').bumpVersion();
      }
      dbReady = true;
    } catch (e) { console.error('[db] connect failed:', e.message); await new Promise(r => setTimeout(r, Math.min(30000, 2000 * 2 ** i))); }
  }
})();
process.on('unhandledRejection', e => console.error('[unhandled]', e));
module.exports = app;
