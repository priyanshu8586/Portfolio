'use strict';
const express = require('express');
const { jsonError } = require('../middleware/security');
const { contactSchema, parse } = require('../validation');

module.exports = function publicRoutes({ pool, contactLimiter }) {
  const router = express.Router();

  // Content for the public portfolio page
  router.get('/site', async (_req, res) => {
    const [settings, projects] = await Promise.all([
      pool.query('SELECT key, value FROM settings'),
      pool.query(
        `SELECT id, title, summary, tags, live_url, repo_url
           FROM projects WHERE is_published = true
          ORDER BY sort_order, id`
      ),
    ]);
    const profile = Object.fromEntries(settings.rows.map((r) => [r.key, r.value]));
    // Revalidate every time (Express adds an ETag), so dashboard edits show up immediately.
    res.set('Cache-Control', 'no-cache');
    res.json({ profile, projects: projects.rows });
  });

  // Contact form
  router.post('/contact', contactLimiter, async (req, res) => {
    const parsed = parse(contactSchema, req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields: parsed.fields },
      });
    }
    const { name, email, subject, message, website } = parsed.data;

    // Honeypot: bots fill the hidden field. Pretend success, store nothing.
    if (website) return res.status(201).json({ ok: true });

    await pool.query(
      'INSERT INTO messages (name, email, subject, body) VALUES ($1, $2, $3, $4)',
      [name, email, subject, message]
    );
    res.status(201).json({ ok: true });
  });

  router.use((_req, res) => jsonError(res, 404, 'NOT_FOUND', 'Not found.'));
  return router;
};
