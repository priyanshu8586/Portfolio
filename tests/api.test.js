'use strict';
// Integration tests: run against a real PostgreSQL database named by TEST_DATABASE_URL.
// WARNING: these tests delete rows from admins, messages and user_sessions. Use a throwaway DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const argon2 = require('argon2');

const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL) {
  test('integration tests skipped', { skip: 'set TEST_DATABASE_URL to run' }, () => {});
  return;
}

const { loadConfig } = require('../src/config');
const { createPool } = require('../src/db');
const { createApp } = require('../src/app');

const ORIGIN = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'correct-horse-battery';

let pool, server, base;

/** Minimal cookie-keeping client */
function client() {
  let cookie = '';
  let csrf = null;
  async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() || [];
    for (const c of set) cookie = c.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, headers: res.headers, text };
  }
  return {
    call,
    setCsrf: (t) => { csrf = t; },
    async init() { const r = await call('GET', '/api/auth/me'); csrf = r.json.csrfToken; return r; },
    async login(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
      await this.init();
      const r = await call('POST', '/api/auth/login', { email, password }, { origin: ORIGIN });
      if (r.json?.csrfToken) csrf = r.json.csrfToken;
      return r;
    },
  };
}

test.before(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: DB_URL,
    SESSION_SECRET: 'x'.repeat(48),
    APP_BASE_URL: ORIGIN,
  });
  pool = createPool(config);
  await pool.query('DELETE FROM user_sessions');
  await pool.query('DELETE FROM messages');
  await pool.query('DELETE FROM admins');
  const hash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
  await pool.query('INSERT INTO admins (email, password_hash) VALUES ($1,$2)', [ADMIN_EMAIL, hash]);

  const app = createApp({ config, pool, limits: { login: 1000, contact: 1000, api: 100000 } });
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});

// ---------- Public ----------
test('public site endpoint returns profile and only published projects', async () => {
  await pool.query("INSERT INTO projects (title, summary, is_published) VALUES ('hidden-draft','x',false)");
  const r = await client().call('GET', '/api/public/site');
  assert.equal(r.status, 200);
  assert.ok(r.json.profile.name);
  assert.ok(Array.isArray(r.json.projects));
  assert.ok(!r.json.projects.some((p) => p.title === 'hidden-draft'));
  await pool.query("DELETE FROM projects WHERE title='hidden-draft'");
});

test('contact form stores a valid message', async () => {
  const c = client();
  const r = await c.call('POST', '/api/public/contact', {
    name: 'Ada', email: 'ADA@Example.com', subject: 'Hi', message: 'Hello there, nice portfolio!',
  }, { origin: ORIGIN });
  assert.equal(r.status, 201);
  const { rows } = await pool.query("SELECT email, status FROM messages WHERE name='Ada'");
  assert.equal(rows[0].email, 'ada@example.com');
  assert.equal(rows[0].status, 'unread');
});

test('contact form rejects invalid input with field errors', async () => {
  const r = await client().call('POST', '/api/public/contact', { name: '', email: 'nope', message: 'short' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'VALIDATION_ERROR');
  assert.ok(r.json.error.fields.name);
  assert.ok(r.json.error.fields.email);
  assert.ok(r.json.error.fields.message);
});

test('contact honeypot returns success but stores nothing', async () => {
  const r = await client().call('POST', '/api/public/contact', {
    name: 'Bot', email: 'bot@example.com', message: 'buy cheap stuff now', website: 'http://spam.example',
  });
  assert.equal(r.status, 201);
  const { rows } = await pool.query("SELECT 1 FROM messages WHERE name='Bot'");
  assert.equal(rows.length, 0);
});

test('contact form blocks cross-site Origin', async () => {
  const r = await client().call('POST', '/api/public/contact', {
    name: 'X', email: 'x@example.com', message: 'cross site attempt',
  }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('SQL metacharacters are stored as plain text, not executed', async () => {
  const evil = "Robert'); DROP TABLE messages;--";
  const r = await client().call('POST', '/api/public/contact', {
    name: evil, email: 'bobby@example.com', message: 'Little Bobby Tables says hi',
  });
  assert.equal(r.status, 201);
  const { rows } = await pool.query('SELECT name FROM messages WHERE email=$1', ['bobby@example.com']);
  assert.equal(rows[0].name, evil);
});

// ---------- Auth ----------
test('admin API is closed to anonymous users', async () => {
  for (const [m, p] of [['GET', '/api/admin/messages'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/projects'],
                        ['GET', '/api/admin/settings'], ['DELETE', '/api/admin/messages/1']]) {
    const r = await client().call(m, p);
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test('dashboard page redirects anonymous users to login', async () => {
  const r = await client().call('GET', '/admin/dashboard');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/admin/login');
});

test('login fails without CSRF token', async () => {
  const r = await client().call('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(r.status, 403);
});

test('login rejects wrong password and unknown email with the same message', async () => {
  const a = client(); const b = client();
  const r1 = await a.login(ADMIN_EMAIL, 'wrong-password-123');
  const r2 = await b.login('nobody@example.test', 'whatever-123456');
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.deepEqual(r1.json, r2.json);
});

test('successful login sets an HttpOnly, SameSite cookie and opens the dashboard', async () => {
  const c = client();
  await c.init();
  const raw = await fetch(base + '/api/auth/me');
  const cookieHeader = raw.headers.getSetCookie().join(';');
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);

  const r = await c.login();
  assert.equal(r.status, 200);
  const page = await c.call('GET', '/admin/dashboard');
  assert.equal(page.status, 200);
  const me = await c.call('GET', '/api/auth/me');
  assert.equal(me.json.authenticated, true);
  assert.equal(me.json.email, ADMIN_EMAIL);
});

test('session id changes after login (fixation protection)', async () => {
  const c = client();
  const first = await fetch(base + '/api/auth/me');
  const before = first.headers.getSetCookie()[0].split(';')[0];
  const c2 = client();
  // reuse the pre-login cookie
  const init = await fetch(base + '/api/auth/me', { headers: { cookie: before } });
  const token = (await init.json()).csrfToken;
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: before, 'x-csrf-token': token, origin: ORIGIN },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const after = login.headers.getSetCookie()[0].split(';')[0];
  assert.notEqual(after, before);
  void c; void c2;
});

test('account locks after repeated failed logins', async () => {
  await pool.query("UPDATE admins SET failed_logins = 0, locked_until = NULL WHERE email=$1", [ADMIN_EMAIL]);
  for (let i = 0; i < 5; i++) {
    const r = await client().login(ADMIN_EMAIL, 'bad-password-' + i);
    assert.equal(r.status, 401);
  }
  const locked = await client().login(ADMIN_EMAIL, ADMIN_PASSWORD); // correct password, still locked
  assert.equal(locked.status, 429);
  assert.equal(locked.json.error.code, 'LOCKED');
  await pool.query("UPDATE admins SET failed_logins = 0, locked_until = NULL WHERE email=$1", [ADMIN_EMAIL]);
});

test('logout ends the session', async () => {
  const c = client();
  await c.login();
  const out = await c.call('POST', '/api/auth/logout', {});
  assert.equal(out.status, 200);
  const r = await c.call('GET', '/api/admin/stats');
  assert.equal(r.status, 401);
});

// ---------- Admin ----------
test('admin writes require a CSRF token', async () => {
  const c = client();
  await c.login();
  c.setCsrf(null);
  const r = await c.call('POST', '/api/admin/projects', { title: 'T', summary: 'S' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'CSRF');
});

test('admin can manage messages', async () => {
  const c = client();
  await c.login();
  await pool.query("INSERT INTO messages (name,email,body) VALUES ('Zed','zed@example.com','message for admin test')");
  const { rows } = await pool.query("SELECT id FROM messages WHERE name='Zed'");
  const id = rows[0].id;

  const list = await c.call('GET', '/api/admin/messages?status=unread');
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((m) => m.id === id));

  const patch = await c.call('PATCH', `/api/admin/messages/${id}`, { status: 'read' });
  assert.equal(patch.status, 200);
  assert.equal(patch.json.status, 'read');

  const bad = await c.call('PATCH', `/api/admin/messages/${id}`, { status: 'hacked' });
  assert.equal(bad.status, 400);

  const del = await c.call('DELETE', `/api/admin/messages/${id}`);
  assert.equal(del.status, 204);
  const gone = await c.call('DELETE', `/api/admin/messages/${id}`);
  assert.equal(gone.status, 404);
});

test('admin can create, update, hide and delete a project; URL scheme is validated', async () => {
  const c = client();
  await c.login();
  const create = await c.call('POST', '/api/admin/projects', {
    title: 'My App', summary: 'Does things', tags: ['JS', 'PG'], live_url: 'https://example.com', repo_url: '',
  });
  assert.equal(create.status, 201);
  const id = create.json.id;

  const badUrl = await c.call('POST', '/api/admin/projects', {
    title: 'Bad', summary: 'x', live_url: 'javascript:alert(1)',
  });
  assert.equal(badUrl.status, 400);
  assert.ok(badUrl.json.error.fields.live_url);

  const upd = await c.call('PUT', `/api/admin/projects/${id}`, {
    title: 'My App v2', summary: 'Does more', tags: ['JS'], is_published: false,
  });
  assert.equal(upd.status, 200);
  assert.equal(upd.json.is_published, false);

  const pub = await client().call('GET', '/api/public/site');
  assert.ok(!pub.json.projects.some((p) => p.id === id), 'unpublished project must not be public');

  const del = await c.call('DELETE', `/api/admin/projects/${id}`);
  assert.equal(del.status, 204);
});

test('non-numeric ids are rejected as not found', async () => {
  const c = client();
  await c.login();
  const r = await c.call('DELETE', '/api/admin/messages/1;DROP');
  assert.equal(r.status, 404);
});

test('admin can update profile settings', async () => {
  const c = client();
  await c.login();
  const r = await c.call('PUT', '/api/admin/settings', {
    name: 'Test Person', headline: 'Builder', bio: 'Short bio', github: 'https://github.com/example', linkedin: '',
  });
  assert.equal(r.status, 200);
  const pub = await client().call('GET', '/api/public/site');
  assert.equal(pub.json.profile.name, 'Test Person');
});

test('password change requires the current password and revokes other sessions', async () => {
  const a = client(); const b = client();
  await a.login(); await b.login();
  const wrong = await a.call('POST', '/api/auth/change-password', { currentPassword: 'nope-nope-nope', newPassword: 'another-long-password' });
  assert.equal(wrong.status, 400);
  const short = await a.call('POST', '/api/auth/change-password', { currentPassword: ADMIN_PASSWORD, newPassword: 'short' });
  assert.equal(short.status, 400);

  const ok = await a.call('POST', '/api/auth/change-password', { currentPassword: ADMIN_PASSWORD, newPassword: 'another-long-password' });
  assert.equal(ok.status, 200);
  assert.equal((await a.call('GET', '/api/admin/stats')).status, 200, 'current session stays signed in');
  assert.equal((await b.call('GET', '/api/admin/stats')).status, 401, 'other session is signed out');

  // restore original password for later tests
  const restore = await a.call('POST', '/api/auth/change-password', { currentPassword: 'another-long-password', newPassword: ADMIN_PASSWORD });
  assert.equal(restore.status, 200);
});

// ---------- Hardening ----------
test('security headers are present and no stack trace leaks', async () => {
  const r = await client().call('GET', '/');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);

  const bad = await fetch(base + '/api/public/contact', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
  });
  assert.equal(bad.status, 400);
  const body = await bad.text();
  assert.ok(!/at .*\.js/.test(body), 'no stack trace in response');
});

test('oversized request bodies are rejected', async () => {
  const r = await client().call('POST', '/api/public/contact', { name: 'a', email: 'a@b.co', message: 'x'.repeat(30000) });
  assert.equal(r.status, 413);
});

test('contact endpoint is rate limited', async () => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: DB_URL, SESSION_SECRET: 'y'.repeat(48), APP_BASE_URL: ORIGIN });
  const limited = createApp({ config, pool, limits: { contact: 2, login: 1000, api: 100000 } });
  const srv = await new Promise((r) => { const s = limited.listen(0, '127.0.0.1', () => r(s)); });
  const url = `http://127.0.0.1:${srv.address().port}/api/public/contact`;
  const send = () => fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'RL', email: 'rl@example.com', message: 'rate limit probe message' }),
  });
  const codes = [(await send()).status, (await send()).status, (await send()).status];
  await new Promise((r) => srv.close(r));
  assert.deepEqual(codes, [201, 201, 429]);
  await pool.query("DELETE FROM messages WHERE name='RL'");
});
