const { Schema, model } = require('mongoose');
const S = new Schema({
  jti: { type: String, unique: true, index: true },
  ip: String, userAgent: String,
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: { expires: 0 } }   // TTL: Mongo removes expired sessions
});
module.exports = model('AdminSession', S);
