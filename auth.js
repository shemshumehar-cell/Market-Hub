const { logAudit } = require('../config/database');

/**
 * Authentication Middleware:
 * Ensures the request belongs to an authenticated session.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login?error=Please log in to continue.');
  }

  if (req.session.user.status === 'suspended') {
    req.session.destroy();
    return res.redirect('/auth/login?error=Your account has been suspended. Please contact platform support.');
  }

  next();
}

/**
 * Role-Based Access Control (RBAC) Middleware:
 * Enforces role authorization (e.g. 'vendor', 'admin', 'customer').
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      return res.redirect('/auth/login');
    }

    const userRole = req.session.user.role;
    if (!allowedRoles.includes(userRole)) {
      logAudit(
        req.session.user.id,
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        `User ${req.session.user.email} (Role: ${userRole}) attempted accessing route requiring [${allowedRoles.join(', ')}]: ${req.originalUrl}`,
        req.ip
      );

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
      }
      return res.status(403).render('errors/403', {
        title: '403 Forbidden',
        message: 'Access Denied: You do not possess the required security role to access this resource.'
      });
    }

    next();
  };
}

/**
 * View Context Middleware:
 * Attaches the current session user to res.locals for template rendering.
 */
function attachUser(req, res, next) {
  res.locals.currentUser = req.session?.user || null;
  res.locals.currentPath = req.path;
  res.locals.query = req.query;
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  attachUser
};
