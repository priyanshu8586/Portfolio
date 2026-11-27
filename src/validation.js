'use strict';
const { z } = require('zod');

// Strip control characters (except newline/tab) and trim.
const clean = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const text = (min, max) => z.string().transform(clean).pipe(z.string().min(min).max(max));

const httpUrl = z
  .string()
  .transform(clean)
  .pipe(
    z
      .string()
      .max(300)
      .refine((v) => {
        try {
          const u = new URL(v);
          return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
          return false;
        }
      }, 'Must be a valid http(s) URL')
  );
const optionalUrl = z.union([httpUrl, z.literal(''), z.null()]).optional().transform((v) => v || null);

const email = z
  .string()
  .transform((s) => clean(s).toLowerCase())
  .pipe(z.string().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address'));

const contactSchema = z.object({
  name: text(1, 100),
  email,
  subject: z.string().optional().default('').transform(clean).pipe(z.string().max(150)),
  message: text(10, 5000),
  website: z.string().optional().default(''), // honeypot: real users leave this empty
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
});

const tags = z
  .array(text(1, 30))
  .max(10)
  .optional()
  .default([]);

const projectSchema = z.object({
  title: text(1, 100),
  summary: text(1, 500),
  tags,
  live_url: optionalUrl,
  repo_url: optionalUrl,
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  is_published: z.boolean().optional().default(true),
});

const messageStatusSchema = z.object({
  status: z.enum(['unread', 'read', 'archived']),
});

const settingsSchema = z.object({
  name: text(1, 80),
  headline: text(0, 120),
  bio: text(0, 1000),
  github: optionalUrl,
  linkedin: optionalUrl,
});

const idParam = z.string().regex(/^\d{1,18}$/);

/** Returns { ok, data } or { ok:false, fields } where fields maps field -> message. */
function parse(schema, input) {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return { ok: false, fields };
}

module.exports = {
  contactSchema,
  loginSchema,
  changePasswordSchema,
  projectSchema,
  messageStatusSchema,
  settingsSchema,
  idParam,
  parse,
};
