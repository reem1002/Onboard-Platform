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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stricter limiter for credential endpoints (OWASP A07: brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 10000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

module.exports = { mongoSanitize, apiLimiter, authLimiter };
