'use strict';
const express = require('express');
const { jsonError, requireAdmin, requireCsrf } = require('../middleware/security');
const {
  projectSchema,
  messageStatusSchema,
  settingsSchema,
  idParam,
  parse,
} = require('../validation');

function validationFailure(res, fields) {
  return res.status(400).json({
    error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields },
  });
}

module.exports = function adminRoutes({ pool }) {
  const router = express.Router();

  // Every route below requires a signed-in admin and, for writes, a valid CSRF token.
  router.use(requireAdmin, requireCsrf);

  const idOr404 = (req, res) => {
    const p = idParam.safeParse(req.params.id);
    if (!p.success) {
      jsonError(res, 404, 'NOT_FOUND', 'Not found.');
      return null;
    }
    return p.data;
  };

  // ---- Overview ----
  router.get('/stats', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*) FROM messages WHERE status = 'unread')   AS unread,
         (SELECT count(*) FROM messages WHERE status <> 'archived') AS inbox,
         (SELECT count(*) FROM messages)                           AS total_messages,
         (SELECT count(*) FROM projects WHERE is_published)        AS published_projects,
         (SELECT count(*) FROM projects)                           AS total_projects`
    );
    const r = rows[0];
    res.json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])));
  });

  // ---- Messages ----
  router.get('/messages', async (req, res) => {
    const status = ['unread', 'read', 'archived'].includes(req.query.status) ? req.query.status : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const where = status ? 'WHERE status = $1' : "WHERE status <> 'archived'";
    const params = status ? [status] : [];
    const [list, count] = await Promise.all([
      pool.query(
        `SELECT id, name, email, subject, body, status, created_at
           FROM messages ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      pool.query(`SELECT count(*) FROM messages ${where}`, params),
    ]);
    res.json({ items: list.rows, total: Number(count.rows[0].count), page, limit });
  });

  router.patch('/messages/:id', async (req, res) => {
    const id = idOr404(req, res);
    if (!id) return;
    const parsed = parse(messageStatusSchema, req.body || {});
    if (!parsed.ok) return validationFailure(res, parsed.fields);
    const { rows } = await pool.query(
      'UPDATE messages SET status = $2 WHERE id = $1 RETURNING id, status',
      [id, parsed.data.status]
    );
    if (!rows[0]) return jsonError(res, 404, 'NOT_FOUND', 'Message not found.');
    res.json(rows[0]);
  });

  router.delete('/messages/:id', async (req, res) => {
    const id = idOr404(req, res);
    if (!id) return;
    const { rowCount } = await pool.query('DELETE FROM messages WHERE id = $1', [id]);
    if (!rowCount) return jsonError(res, 404, 'NOT_FOUND', 'Message not found.');
    res.status(204).end();
  });

  // ---- Projects ----
  router.get('/projects', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, title, summary, tags, live_url, repo_url, sort_order, is_published
         FROM projects ORDER BY sort_order, id`
    );
    res.json({ items: rows });
  });

  router.post('/projects', async (req, res) => {
    const parsed = parse(projectSchema, req.body || {});
    if (!parsed.ok) return validationFailure(res, parsed.fields);
    const p = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO projects (title, summary, tags, live_url, repo_url, sort_order, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, title, summary, tags, live_url, repo_url, sort_order, is_published`,
      [p.title, p.summary, p.tags, p.live_url, p.repo_url, p.sort_order, p.is_published]
    );
    res.status(201).json(rows[0]);
  });

  router.put('/projects/:id', async (req, res) => {
    const id = idOr404(req, res);
    if (!id) return;
    const parsed = parse(projectSchema, req.body || {});
    if (!parsed.ok) return validationFailure(res, parsed.fields);
    const p = parsed.data;
    const { rows } = await pool.query(
      `UPDATE projects
          SET title=$2, summary=$3, tags=$4, live_url=$5, repo_url=$6,
              sort_order=$7, is_published=$8, updated_at=now()
        WHERE id=$1
        RETURNING id, title, summary, tags, live_url, repo_url, sort_order, is_published`,
      [id, p.title, p.summary, p.tags, p.live_url, p.repo_url, p.sort_order, p.is_published]
    );
    if (!rows[0]) return jsonError(res, 404, 'NOT_FOUND', 'Project not found.');
    res.json(rows[0]);
  });

  router.delete('/projects/:id', async (req, res) => {
    const id = idOr404(req, res);
    if (!id) return;
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    if (!rowCount) return jsonError(res, 404, 'NOT_FOUND', 'Project not found.');
    res.status(204).end();
  });

  // ---- Profile settings ----
  router.get('/settings', async (_req, res) => {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  });

  router.put('/settings', async (req, res) => {
    const parsed = parse(settingsSchema, req.body || {});
    if (!parsed.ok) return validationFailure(res, parsed.fields);
    const entries = Object.entries(parsed.data).map(([k, v]) => [k, v ?? '']);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO settings (key, value) VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, value]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json(Object.fromEntries(entries));
  });

  router.use((_req, res) => jsonError(res, 404, 'NOT_FOUND', 'Not found.'));
  return router;
};
