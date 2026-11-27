'use strict';
const { loadConfig } = require('./config');
const { createPool } = require('./db');
const { createApp } = require('./app');

const config = loadConfig();
const pool = createPool(config);
const app = createApp({ config, pool });

const server = app.listen(config.port, () => {
  console.log(`Portfolio running at ${config.origin} (port ${config.port}, ${config.nodeEnv})`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
