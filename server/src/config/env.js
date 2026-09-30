require('dotenv').config();
const { z } = require('zod');

// Fail fast on misconfiguration (OWASP A05: Security Misconfiguration)
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30), // "remember me" duration
  // Outgoing email (password resets, invites). Leave SMTP_HOST empty in development: links are printed to the server console.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Onboard LMS <no-reply@localhost>'),
  APP_URL: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(15),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Local AI (Ollama). Only the platform admin's server talks to it; kept in .env (not the UI) on purpose.
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
  // Branding used on generated reports
  ORG_NAME: z.string().default('InfoSec4TC'),
  REPORT_ACCENT: z.string().regex(/^[0-9a-fA-F]{6}$/).default('B31F2E'),
  AI_GRADING_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
