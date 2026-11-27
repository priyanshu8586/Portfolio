# Personal Portfolio — full-stack

A premium, responsive portfolio with a contact form and a private admin dashboard.

- **Frontend:** plain HTML, CSS and JavaScript (no framework, no build step), dark/light theme
- **Backend:** Node.js + Express 5
- **Database:** PostgreSQL (versioned SQL migrations)
- **Auth:** server-side sessions stored in PostgreSQL, Argon2id password hashing

> **Important:** this project has a server and a database, so it **cannot be hosted on GitHub Pages**
> (Pages only serves static files). GitHub is still the right place for your *code*; see
> [Deploy](#deploy) for hosts that run Node + PostgreSQL.

---

## 1. Architecture

```
Browser ──HTTPS──> Express app ──SQL (parameterised)──> PostgreSQL
  public/  (portfolio, JS modules)     src/routes/public.js   projects, settings, messages
  admin/   (HTML shell, login+dashboard)  src/routes/auth.js    admins, user_sessions
                                          src/routes/admin.js   (all behind requireAdmin + CSRF)
```

| Area | Path | Purpose |
|---|---|---|
| Public site | `public/` | Homepage, projects, contact form. Content is loaded from `/api/public/site`. |
| Admin pages | `admin/` | `login.html`, `dashboard.html`. Dashboard HTML is only served to signed-in admins. |
| Static assets | `public/assets/` | CSS design tokens, shared JS. |
| API | `src/routes/` | `public.js`, `auth.js`, `admin.js` |
| Security middleware | `src/middleware/security.js` | Origin check, CSRF, admin guard |
| Validation | `src/validation.js` | Zod schemas, the single source of truth for input rules |
| Database | `db/migrations/` | Schema + sample content |
| Scripts | `scripts/` | `migrate.js`, `create-admin.js` |
| Tests | `tests/api.test.js` | 23 integration tests against a real PostgreSQL |

### Database schema

| Table | Purpose |
|---|---|
| `admins` | Admin accounts: email, Argon2id hash, failed-login counter, lockout time |
| `user_sessions` | Session store (cookie holds only a signed random id) |
| `messages` | Contact-form submissions: `unread` / `read` / `archived` |
| `projects` | Portfolio projects: title, summary, tags, links, sort order, published flag |
| `settings` | Editable profile text (name, headline, bio, GitHub, LinkedIn) |
| `schema_migrations` | Which migrations have been applied |

There is **no public sign-up**. The only way to create an admin is the `create-admin` script run on the server.

### Security measures

- Passwords hashed with **Argon2id**; never stored or logged in plain text
- Login: generic error message, constant-ish timing for unknown emails, **lockout after 5 failures for 15 minutes**, plus an IP rate limit
- Session cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, 8-hour sliding expiry; **session id regenerated on login** (anti-fixation); changing the password signs out all other sessions
- **CSRF**: per-session token in the `X-CSRF-Token` header on every state-changing request, plus an `Origin` check
- Every admin API route requires a session **on the server**; the dashboard HTML itself is also protected
- All SQL is **parameterised**; all input validated server-side (length, type, URL scheme `http/https` only)
- Output is rendered with `textContent` (no `innerHTML`), plus a strict **Content-Security-Policy** (`script-src 'self'`) and other Helmet headers
- Contact form: rate limit (5/hour/IP), hidden honeypot field, 20 KB body limit
- Errors never leak stack traces; secrets live only in environment variables

---

## 2. Setup (local)

You need **Node.js 20+** and **PostgreSQL 14+**.

```bash
# 1. Install dependencies
npm install

# 2. Create a database and user (in psql, as a superuser)
#    CREATE USER portfolio WITH PASSWORD 'choose-a-password';
#    CREATE DATABASE portfolio OWNER portfolio;

# 3. Configure environment
cp .env.example .env
#    Edit .env:
#      DATABASE_URL=postgresql://portfolio:choose-a-password@localhost:5432/portfolio
#      SESSION_SECRET=<output of the command below>
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Create the tables and sample content
npm run migrate

# 5. Create your admin account (password is typed hidden, min 12 characters)
npm run create-admin -- you@example.com

# 6. Start
npm start
```

Open <http://localhost:3000> for the site and <http://localhost:3000/admin> for the dashboard.

Then, in the dashboard: **Profile** → put in your real name, headline, bio and links; **Projects** → replace the two sample projects.

### Commands

| Command | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart on file changes |
| `npm run migrate` | Apply new migrations (safe to re-run) |
| `npm run create-admin -- email` | Create the admin, or reset its password |
| `npm test` | Run the tests (needs `TEST_DATABASE_URL`, see below) |

### Running the tests

The tests **delete rows from `admins`, `messages` and `user_sessions`, and overwrite the profile settings**, so use a separate throwaway database, never your real one:

```bash
# create a second DB, point DATABASE_URL at it, run migrate, then:
TEST_DATABASE_URL=postgresql://portfolio:choose-a-password@localhost:5432/portfolio_test npm test
```

Without `TEST_DATABASE_URL` they are skipped.

---

## 3. Environment variables

| Name | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `DATABASE_SSL` | no | `true` for hosted databases that require TLS |
| `SESSION_SECRET` | yes | Random string, ≥ 32 chars. Changing it signs everyone out |
| `APP_BASE_URL` | yes | Public URL, e.g. `https://yourname.com`. Must be `https://` in production |
| `NODE_ENV` | no | Set to `production` when deployed |
| `PORT` | no | Defaults to 3000 (most hosts set it for you) |
| `TRUST_PROXY` | no | Set `1` behind a reverse proxy / PaaS so rate limits see real client IPs |

---

## 4. Deploy

Any host that runs a Node web service and PostgreSQL works (for example Render, Railway or Fly.io, with a managed PostgreSQL such as the host's own, Neon or Supabase). Free tiers and their limits change, so check the provider's current terms.

1. Push this repo to GitHub (`.env` is git-ignored; never commit it).
2. Create a PostgreSQL database at your provider and copy its connection string.
3. Create a web service from the repo: build `npm install`, start `npm start`.
4. Set the environment variables above (`NODE_ENV=production`, `TRUST_PROXY=1`, `DATABASE_SSL=true` if required, `APP_BASE_URL` = your final https URL).
5. Run `npm run migrate` and `npm run create-admin -- you@example.com` against the production database (most hosts have a shell/“run command” feature; or run them locally with `DATABASE_URL` temporarily pointing at the production DB).
6. Visit `/admin` and sign in.

### Pre-launch checklist

- [ ] `NODE_ENV=production`, HTTPS enabled, `APP_BASE_URL` is the https URL
- [ ] Strong, unique `SESSION_SECRET` and admin password
- [ ] Database backups enabled at your provider; restore procedure known
- [ ] Sample projects/bio replaced from the dashboard
- [ ] Sent a test message through the contact form and saw it in the dashboard
- [ ] Checked the site on a real phone
- [ ] Added a short privacy note if you collect messages from visitors (they store name, email and message text until you delete them)

---

## 5. Limitations and next steps

- **No email notifications.** Messages appear in the dashboard only. Adding one (e.g. via an email API) is a natural next step.
- **Single admin role.** Fine for a personal site; multi-user roles are not implemented.
- **No password-reset email.** Reset by running `npm run create-admin -- you@example.com` on the server.
- **No automated browser/accessibility audit.** Keyboard navigation, focus states, labels, reduced-motion and contrast were designed in, but run a tool such as Lighthouse before launch.
- Rate-limit counters are in memory per server process (fine for one instance; use a shared store if you scale out).
