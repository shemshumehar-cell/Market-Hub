require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('node:path');
const { initDatabase, logAudit } = require('./config/database');
const { attachUser } = require('./middleware/auth');
const { securityHeaders, generalLimiter } = require('./middleware/security');

// Initialize database schema and initial seed data
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Set trust proxy when deployed behind reverse proxies (Render, Railway, Heroku)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// 1. Security HTTP Headers (Helmet & CSP)
app.use(securityHeaders);

// 2. Body parsers with payload size limits (prevents payload-based DoS)
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// 3. Static assets
app.use(express.static(path.join(__dirname, 'public')));

// 4. View engine setup (EJS with auto-escaping)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 5. Session management with strict cookie security controls
app.use(
  session({
    name: 'markethub.sid',
    secret: process.env.SESSION_SECRET || 'dev-fallback-session-secret-change-in-production-vbit',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // Prevents client-side scripts from reading session cookie (XSS defense)
      secure: process.env.NODE_ENV === 'production', // Transmit cookie over HTTPS only in production
      sameSite: 'lax', // Defends against Cross-Site Request Forgery (CSRF)
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// 6. User context attachment for views
app.use(attachUser);

// 7. General rate limiting across public traffic
app.use(generalLimiter);

// 8. Application Routes
app.use('/', require('./routes/healthRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/products', require('./routes/productRoutes'));
app.use('/cart', require('./routes/cartRoutes'));
app.use('/orders', require('./routes/orderRoutes'));
app.use('/vendor', require('./routes/vendorRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/', require('./routes/productRoutes'));

// 9. 404 Handler
app.use((req, res) => {
  res.status(404).render('errors/404', {
    title: '404 Not Found',
    message: 'The requested page or endpoint could not be found.'
  });
});

// 10. Global Error Handler (Prevents stack trace leakage in HTTP responses)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  logAudit(req.session?.user?.id || null, 'SERVER_ERROR', err.message, req.ip);

  if (res.headersSent) {
    return next(err);
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({ error: 'Internal server error.' });
  }

  res.status(500).render('errors/500', {
    title: '500 Server Error',
    message: 'An unexpected internal error occurred. Our security monitoring team has logged this incident.'
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🛡️  MarketHub Marketplace running at http://localhost:${PORT}`);
    console.log(`📊 Health Check Endpoint: http://localhost:${PORT}/health`);
    console.log(`🔒 Security Profiles: Helmet, RBAC, Rate-Limiting Active`);
    console.log(`====================================================`);
  });
}

module.exports = app;
