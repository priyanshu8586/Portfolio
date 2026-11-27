'use strict';
// Creates (or resets the password of) the admin account.
// Usage: npm run create-admin -- you@example.com
// The password is prompted for without echo, or read from ADMIN_PASSWORD for automation.
require('dotenv').config();
const readline = require('node:readline');
const argon2 = require('argon2');
const { Pool } = require('pg');

const MIN_LENGTH = 12;

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (answer) => { rl.output.write('\n'); rl.close(); resolve(answer); });
  });
}

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- you@example.com');
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD || (await promptHidden(`Password (min ${MIN_LENGTH} chars): `));
  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`);
    process.exit(1);
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  });
  await pool.query(
    `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, failed_logins = 0, locked_until = NULL`,
    [email, hash]
  );
  await pool.end();
  console.log(`Admin account ready for ${email}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
