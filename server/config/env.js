require('dotenv').config();
const prod = process.env.NODE_ENV === 'production';
module.exports = {
  prod,
  port: +process.env.PORT || 10000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || (prod ? '' : 'dev-secret-change-me'),
  adminCode: process.env.ADMIN_LOGIN_CODE || '',
  whatsapp: (process.env.WHATSAPP_NUMBER || '919959334110').replace(/\D/g, ''),
  seedOnEmpty: process.env.SEED_ON_EMPTY !== 'false',
  corsOrigin: process.env.CORS_ORIGIN || '',
  frontendUrl: (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || '').split(',')[0] || '').trim().replace(/\/$/, ''),
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
    api_key: process.env.CLOUDINARY_API_KEY || '',
    api_secret: process.env.CLOUDINARY_API_SECRET || ''
  },
  warmMs: 3 * 60 * 60 * 1000
};
