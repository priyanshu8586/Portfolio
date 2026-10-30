# Architecture

```
Visitor / Admin (Android, tablet, desktop)
        |
        v
GitHub Pages (static files only)         <-- uploaded directly to GitHub
  index.html, css/, js/, admin/, assets/
        |
        | HTTPS fetch (publishable key only)
        v
Supabase Edge Functions (TypeScript)     <-- deployed to Supabase, NOT GitHub Pages
  contact-submit   public, validated, rate-limited, inserts a row
  admin-contacts   requires Supabase Auth JWT + admin allowlist check
  drive-oauth      starts/handles Google OAuth (admin only)
  drive-backup     cron or admin-triggered, uploads CSV to private Drive folder
        |
        v
Supabase PostgreSQL (RLS on, no anon access to contact data)
  contact_messages, admin_users, rate_limits, backup_runs, oauth tokens (Vault)
        |
        v
Google Drive: private folder "Portfolio Contact Backups"
```

## Final file structure

```
priyanshu-portfolio/
├── index.html                       GitHub
├── css/style.css                    GitHub
├── js/main.js                       GitHub
├── js/supabase-client.js            GitHub (public URL + publishable key only)
├── admin/{index.html,admin.css,admin.js}   GitHub
├── assets/images/                   GitHub
├── tests/testing-checklist.md       GitHub
├── .gitignore                       GitHub
├── README.md                        GitHub
└── supabase/                        deployed with the Supabase CLI
    ├── config.toml
    ├── migrations/create_contact_messages.sql
    └── functions/{contact-submit,admin-contacts,drive-oauth,drive-backup}/index.ts
```

Note: because `supabase/` lives in the same repository, GitHub Pages will serve it publicly.
It must never contain secrets, only code. Secrets live in Supabase (Edge Function secrets / Vault).

## Checklist

- [x] Stage 1: frontend (index.html, style.css, main.js, supabase-client.js, .gitignore)
- [ ] Stage 2: database migration and RLS
- [ ] Stage 3: contact-submit function
- [ ] Stage 4: admin dashboard and admin-contacts function
- [ ] Stage 5: Google OAuth and Drive backup
- [ ] Stage 6: cron schedule and testing checklist
- [ ] Stage 7: README
