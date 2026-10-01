const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const { resumePending } = require('./services/aiGrader');

mongoose.set('strictQuery', true);
// NoSQL-injection defence lives in Zod validation + mongoSanitize middleware (see middleware/security.js)

(async () => {
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.error(`\n❌ Can't reach MongoDB at ${env.MONGO_URI}\n   Is it running? On Windows (as Administrator):  net start MongoDB\n   (${e.message})\n`);
    process.exit(1);
  }
  console.log('✅ MongoDB connected');
  await require('./services/migrations').runMigrations();
  await resumePending();
  require('./services/reminders').startReminderJob();
  app.listen(env.PORT, () => console.log(`🚀 API listening on :${env.PORT}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
