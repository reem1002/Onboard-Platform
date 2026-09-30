const env = require('../config/env');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  }
  if (err.code === 11000) {
    status = 409;
    message = 'Resource already exists';
  }
  if (err.name === 'MulterError') {
    status = 400;
  }

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    // Never leak stack traces / internals in production (OWASP A05)
    if (env.NODE_ENV === 'production') message = 'Internal server error';
  }

  res.status(status).json({ error: message, code: err.code && typeof err.code === 'string' ? err.code : undefined, details: err.details });
};
