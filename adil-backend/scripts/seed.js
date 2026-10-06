// npm run seed          -> import legacy catalogue (js/data/products.js) as DEMO products (skips existing)
// npm run seed -- --reset -> re-create demo products
const mongoose = require('mongoose');
const connectDB = require('../server/config/db');
const { seedAll } = require('../server/services/seed');
const { bumpVersion } = require('../server/services/settings');
(async () => {
  await connectDB();
  const n = await seedAll({ reset: process.argv.includes('--reset') });
  await bumpVersion();
  console.log(`Seeded ${n} demo products (flagged isDemo - archive/delete them from Admin > Products).`);
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
