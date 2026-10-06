const env = require('../config/env');
module.exports = {
  notFound: (req, res, next) => (req.path.startsWith('/api/') ? res.status(404).json({ error: 'Not found' }) : next()),
  handler: (err, req, res, _next) => {
    const status = err.status || (err.name === 'ValidationError' ? 400 : err.code === 11000 ? 409 : 500);
    if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
    res.status(status).json({ error: status >= 500 && env.prod ? 'Server error' : err.message || 'Error' });
  }
};
