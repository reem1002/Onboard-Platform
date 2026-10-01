const rateLimit = require('express-rate-limit');

/** Recursively drop keys starting with "$" or containing "." – blocks NoSQL operator injection. */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) delete obj[key];
    else sanitize(obj[key]);
  }
  return obj;
}

function mongoSanitize(req, _res, next) {
  sanitize(req.body);
  sanitize(req.params);
  // req.query is a getter in Express 5; sanitize its values in place
  if (req.query) sanitize(req.query);
  next();
}

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';
const { ipKeyGenerator } = rateLimit;
const ipKey = (req) => (ipKeyGenerator ? ipKeyGenerator(req.ip) : req.ip);

/**
 * General API limiter. Signed-in requests are counted per user (a verified token), so a whole office
 * behind one IP — or one person switching between test accounts — doesn't lock everybody out.
 * Anonymous requests are counted per IP. Always answers with JSON the UI can show.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 100000 : isProd ? 1500 : 20000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      try {
        const { verifyAccessToken } = require('../utils/tokens');
        return `u:${verifyAccessToken(h.slice(7)).sub}`;
      } catch { /* invalid/expired → fall back to IP */ }
    }
    return `ip:${ipKey(req)}`;
  },
  message: { error: 'Too many requests — please wait a minute and try again.', code: 'RATE_LIMITED' },
});

// Login: only FAILED attempts count (switching accounts is fine), per IP + email (OWASP A07: brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10000 : 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKey(req)}|${String(req.body?.email || '').toLowerCase().slice(0, 254)}`,
  message: { error: 'Too many failed sign-in attempts, please try again in 15 minutes.', code: 'RATE_LIMITED' },
});

// Session refresh happens on every page load / new tab — generous, per IP
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKey(req),
  message: { error: 'Too many requests — please wait a minute and try again.', code: 'RATE_LIMITED' },
});

// Stricter limiter for other credential endpoints (forgot/reset/change password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKey(req),
  message: { error: 'Too many attempts, please try again later.', code: 'RATE_LIMITED' },
});

module.exports = { mongoSanitize, apiLimiter, authLimiter, loginLimiter, refreshLimiter };
