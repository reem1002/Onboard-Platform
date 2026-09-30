const { verifyAccessToken } = require('../utils/tokens');
const { AppError } = require('../utils/errors');
const User = require('../models/User');

async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Authentication required');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'Invalid or expired token', 'TOKEN_EXPIRED');
    }

    const user = await User.findById(payload.sub).select('+passwordChangedAt');
    if (!user || !user.isActive) throw new AppError(401, 'Account unavailable');
    // iat has 1-second resolution, so compare whole seconds (a token issued in the same second as the change is valid)
    if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new AppError(401, 'Session invalidated', 'TOKEN_EXPIRED');
    }
    // Temporary password (set by an admin): only the auth endpoints work until it's replaced
    if (user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
      throw new AppError(403, 'Please choose a new password to continue', 'PASSWORD_CHANGE_REQUIRED');
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** Role-based access control (OWASP A01: Broken Access Control) */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, 'Forbidden'));
  next();
};

/**
 * Tenant scoping helper: returns a Mongo filter that restricts a query to the caller's company.
 * super_admin sees everything; everyone else is locked to their own company.
 */
// Only the platform admin works across every tenant. Instructors are platform staff too, but their
// access is scoped per course (see services/access.js), not per company.
const isPlatformUser = (user) => user.role === 'super_admin';

function tenantFilter(user, field = 'company') {
  if (isPlatformUser(user)) return {};
  return { [field]: user.company };
}

function assertSameTenant(user, companyId) {
  if (isPlatformUser(user)) return;
  if (!companyId || String(companyId) !== String(user.company)) throw new AppError(404, 'Not found');
}

module.exports = { requireAuth, requireRole, tenantFilter, assertSameTenant, isPlatformUser };
