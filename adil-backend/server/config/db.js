const mongoose = require('mongoose');
const env = require('./env');
mongoose.set('strictQuery', true);
async function connectDB() {
  if (!env.mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000, maxPoolSize: 10 });
  console.log('[db] connected');
}
module.exports = connectDB;
