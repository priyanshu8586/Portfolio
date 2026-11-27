'use strict';
const express = require('express');
const argon2 = require('argon2');
const {
  jsonError,
  ensureCsrfToken,
  requireCsrf,
  requireAdmin,
} = require('../middleware/security');
const { loginSchema, changePasswordSchema, parse } = require('../validation');

module.exports = function authRoutes({ pool, config, loginLimiter }) {
  const router = express.Router();

  // Used on every dummy verify so unknown emails take about as long as real ones.
  let dummyHashPromise;
  const dummyHash = () => (dummyHashPromise ||= argon2.hash('not-a-real-password', { type: argon2.argon2id }));

  const regenerate = (req) =>
    new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
  const save = (req) =>
    new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
  const destroy = (req) =>
    new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve())));

  // Who am I? Also hands out the CSRF token for the current session.
  router.get('/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const csrfToken = ensureCsrfToken(req);
    // Persist before replying: express-session may flush the cookie header before the
    // store write finishes, and the very next request (login) needs this session to exist.
    await save(req);
    if (!req.session.adminId) return res.json({ authenticated: false, csrfToken });
    const { rows } = await pool.query('SELECT email FROM admins WHERE id = $1', [req.session.adminId]);
    if (!rows[0]) {
      await destroy(req);
      return res.json({ authenticated: false, csrfToken: null });
    }
    res.json({ authenticated: true, email: rows[0].email, csrfToken });
  });

  router.post('/login', loginLimiter, requireCsrf, async (req, res) => {
    const parsed = parse(loginSchema, req.body || {});
    const invalid = () => jsonError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    if (!parsed.ok) return invalid();
    const { email, password } = parsed.data;

    const { rows } = await pool.query(
      'SELECT id, password_hash, failed_logins, locked_until FROM admins WHERE email = $1',
      [email]
    );
    const admin = rows[0];

    if (admin && admin.locked_until && new Date(admin.locked_until) > new Date()) {
      await argon2.verify(await dummyHash(), password).catch(() => false);
      return jsonError(res, 429, 'LOCKED', 'Too many failed attempts. Try again later.');
    }

    let ok = false;
    if (admin) {
      ok = await argon2.verify(admin.password_hash, password).catch(() => false);
    } else {
      // Burn comparable time so response timing does not reveal which emails exist.
      await argon2.verify(await dummyHash(), password).catch(() => false);
    }

    if (!ok) {
      if (admin) {
        const failed = admin.failed_logins + 1;
        const lock = failed >= config.maxFailedLogins;
        await pool.query(
          `UPDATE admins SET failed_logins = $2,
                  locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END
            WHERE id = $1`,
          [admin.id, lock ? 0 : failed, lock, String(config.lockMinutes)]
        );
      }
      return invalid();
    }

    await pool.query(
      'UPDATE admins SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
      [admin.id]
    );

    // New session id on privilege change (prevents session fixation)
    await regenerate(req);
    req.session.adminId = admin.id;
    const csrfToken = ensureCsrfToken(req);
    await save(req);
    res.json({ ok: true, csrfToken });
  });

  router.post('/logout', requireCsrf, async (req, res) => {
    await destroy(req);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  router.post('/change-password', requireAdmin, requireCsrf, async (req, res) => {
    const parsed = parse(changePasswordSchema, req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields: parsed.fields },
      });
    }
    const { currentPassword, newPassword } = parsed.data;
    const { rows } = await pool.query('SELECT password_hash FROM admins WHERE id = $1', [req.session.adminId]);
    const valid = rows[0] && (await argon2.verify(rows[0].password_hash, currentPassword).catch(() => false));
    if (!valid) return jsonError(res, 400, 'WRONG_PASSWORD', 'Current password is incorrect.');

    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await pool.query('UPDATE admins SET password_hash = $2 WHERE id = $1', [req.session.adminId, hash]);

    // Sign out every other session of this admin
    await pool.query(
      `DELETE FROM user_sessions WHERE (sess->>'adminId') = $1 AND sid <> $2`,
      [String(req.session.adminId), req.sessionID]
    );
    res.json({ ok: true });
  });

  return router;
};
