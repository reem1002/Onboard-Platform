const mongoose = require('mongoose');
const env = require('./config/env');
const app = require('./app');
const { resumePending } = require('./services/aiGrader');

mongoose.set('strictQuery', true);
// NoSQL-injection defence lives in Zod validation + mongoSanitize middleware (see middleware/security.js)

(async () => {
  await mongoose.connect(env.MONGO_URI);
  console.log('✅ MongoDB connected');
  await require('./services/migrations').runMigrations();
  await resumePending();
  app.listen(env.PORT, () => console.log(`🚀 API listening on :${env.PORT}`));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
