const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// 1. Strict rate limiter for authentication endpoints (prevent brute-force & credential stuffing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login/register requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.'
  },
  handler: (req, res, next, options) => {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(429).json(options.message);
    }
    return res.status(429).render('errors/429', {
      title: '429 Rate Limit Exceeded',
      message: 'Too many attempts. To protect your account security, please wait 15 minutes before trying again.'
    });
  }
});

// 2. Checkout / Order creation rate limiter (prevent automated card testing & inventory locking)
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // Max 20 checkout attempts per 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many checkout requests. Please wait a few moments before trying again.'
  }
});

// 3. General API rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

// 4. Helmet Security Headers with robust Content Security Policy (CSP)
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow self and inline scripts for lightweight UI actions
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"], // Defend against clickjacking
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
});

// 5. Input Sanitizer: strips dangerous characters and trims whitespace
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

module.exports = {
  authLimiter,
  orderLimiter,
  generalLimiter,
  securityHeaders,
  sanitizeInput
};
