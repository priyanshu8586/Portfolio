'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { rateLimit } = require('express-rate-limit');

const {
  jsonError,
  originCheck,
  requireAdminPage,
  noStore,
} = require('./middleware/security');
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');

function limiter({ windowMs, limit, code, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => jsonError(res, 429, code, message),
  });
}

/**
 * Builds the Express app. `limits` can be overridden (the tests do this).
 */
function createApp({ config, pool, limits = {} }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.use(express.json({ limit: '20kb' }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: 'sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new PgStore({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: false,
        pruneSessionInterval: config.isTest ? false : 60 * 60,
      }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        maxAge: config.sessionMaxAgeMs,
      },
    })
  );

  const loginLimiter = limiter({
    windowMs: 15 * 60 * 1000,
    limit: limits.login ?? 10,
    code: 'RATE_LIMITED',
    message: 'Too many sign-in attempts. Please wait a few minutes.',
  });
  const contactLimiter = limiter({
    windowMs: 60 * 60 * 1000,
    limit: limits.contact ?? 5,
    code: 'RATE_LIMITED',
    message: 'You have sent several messages recently. Please try again later.',
  });
  const apiLimiter = limiter({
    windowMs: 60 * 1000,
    limit: limits.api ?? 120,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down.',
  });

  // ---- API ----
  app.use('/api', apiLimiter, originCheck(config.origin));
  app.use('/api/public', publicRoutes({ pool, contactLimiter }));
  app.use('/api/auth', noStore, authRoutes({ pool, config, loginLimiter }));
  app.use('/api/admin', noStore, adminRoutes({ pool }));
  app.use('/api', (_req, res) => jsonError(res, 404, 'NOT_FOUND', 'Not found.'));

  // ---- Admin pages (HTML shell is only served to signed-in admins) ----
  app.get('/admin', noStore, (req, res) =>
    res.redirect(req.session && req.session.adminId ? '/admin/dashboard' : '/admin/login')
  );
  app.get('/admin/login', noStore, (req, res) => {
    if (req.session && req.session.adminId) return res.redirect('/admin/dashboard');
    res.sendFile(path.join(ADMIN_DIR, 'login.html'));
  });
  app.get('/admin/dashboard', noStore, requireAdminPage, (_req, res) =>
    res.sendFile(path.join(ADMIN_DIR, 'dashboard.html'))
  );

  // ---- Public site ----
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));

  app.use((_req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));

  // ---- Error handler: never leak internals ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err && err.type === 'entity.too.large') {
      return jsonError(res, 413, 'TOO_LARGE', 'Request is too large.');
    }
    if (err && err.type === 'entity.parse.failed') {
      return jsonError(res, 400, 'BAD_JSON', 'Request body is not valid JSON.');
    }
    console.error(`[error] ${req.method} ${req.path}: ${err && err.message}`);
    jsonError(res, 500, 'SERVER_ERROR', 'Something went wrong on our side.');
  });

  return app;
}

module.exports = { createApp };
