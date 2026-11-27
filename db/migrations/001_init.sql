-- 001_init.sql — initial schema

CREATE TABLE IF NOT EXISTS admins (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  failed_logins   INTEGER     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admins_email_lower CHECK (email = lower(email))
);

-- Session store used by connect-pg-simple
CREATE TABLE IF NOT EXISTS user_sessions (
  sid     VARCHAR     NOT NULL PRIMARY KEY,
  sess    JSON        NOT NULL,
  expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);

CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email       TEXT        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  subject     TEXT        NOT NULL DEFAULT '' CHECK (char_length(subject) <= 150),
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  status      TEXT        NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','archived')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_status_created ON messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id           BIGSERIAL PRIMARY KEY,
  title        TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  summary      TEXT        NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  live_url     TEXT,
  repo_url     TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  is_published BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_published_order ON projects (is_published, sort_order, id);

-- Single-row key/value settings for editable profile text
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sample content (editable from the admin dashboard)
INSERT INTO settings (key, value) VALUES
  ('name',     'Priyanshu Kumar'),
  ('headline', 'Web developer in the making'),
  ('bio',      'I am a student learning web development, with a growing interest in technology and AI. I enjoy turning ideas into clean, responsive websites. Edit this text from the admin dashboard.'),
  ('github',   ''),
  ('linkedin', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO projects (title, summary, tags, sort_order)
SELECT * FROM (VALUES
  ('Sample project one', 'Replace this sample project from the admin dashboard with something you have built.', ARRAY['HTML','CSS','JavaScript'], 1),
  ('Sample project two', 'Add a live demo link and a GitHub repository link to each project.', ARRAY['Node.js','PostgreSQL'], 2)
) AS v(title, summary, tags, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM projects);
