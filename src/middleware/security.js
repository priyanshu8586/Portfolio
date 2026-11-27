'use strict';
const crypto = require('node:crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function jsonError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

/** Rejects cross-site browser requests: if an Origin header is sent it must be ours. */
function originCheck(allowedOrigin) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== allowedOrigin) {
      return jsonError(res, 403, 'BAD_ORIGIN', 'Cross-site request blocked.');
    }
    next();
  };
}

/** Session-bound CSRF token, sent by our JS in the X-CSRF-Token header. */
function ensureCsrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const expected = req.session && req.session.csrf;
  const received = req.get('x-csrf-token');
  if (!expected || !received) {
    return jsonError(res, 403, 'CSRF', 'Missing security token. Refresh the page and try again.');
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return jsonError(res, 403, 'CSRF', 'Invalid security token. Refresh the page and try again.');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminId) {
    return jsonError(res, 401, 'UNAUTHENTICATED', 'Please sign in.');
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session || !req.session.adminId) return res.redirect('/admin/login');
  next();
}

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
}

module.exports = {
  jsonError,
  originCheck,
  ensureCsrfToken,
  requireCsrf,
  requireAdmin,
  requireAdminPage,
  noStore,
};
