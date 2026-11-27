'use strict';
require('dotenv').config({ quiet: true });

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.startsWith('replace_with')) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }

  const sessionSecret = env.SESSION_SECRET || '';
  if (sessionSecret.length < 32 || sessionSecret.startsWith('replace_with')) {
    throw new Error('SESSION_SECRET must be a random string of at least 32 characters.');
  }

  const baseUrl = env.APP_BASE_URL || 'http://localhost:3000';
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error('APP_BASE_URL must be a valid URL, e.g. https://example.com');
  }
  if (isProd && !baseUrl.startsWith('https://')) {
    throw new Error('APP_BASE_URL must use https:// in production.');
  }

  return {
    nodeEnv,
    isProd,
    isTest: nodeEnv === 'test',
    port: Number(env.PORT) || 3000,
    databaseUrl,
    databaseSsl: env.DATABASE_SSL === 'true',
    sessionSecret,
    origin,
    trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
    sessionMaxAgeMs: 8 * 60 * 60 * 1000, // 8 hours
    maxFailedLogins: 5,
    lockMinutes: 15,
  };
}

module.exports = { loadConfig };
