'use strict';

/**
 * Lokal ishlab chiqish serveri (Docker'siz).
 * PGlite (in-process Postgres) + Express + statik admin panel.
 *
 * Ishga tushirish:  npm run dev:local
 * Panel:            http://127.0.0.1:8080
 *
 * Ma'lumotlar ./server/.pgdata papkasida saqlanadi.
 */
const path = require('path');
const fs = require('fs');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const PORT = 55432;
const APP_PORT = 3000;
const DATA_DIR = path.resolve(__dirname, '..', '.pgdata');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.TZ = process.env.TZ || 'Asia/Tashkent';
process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(PORT);
process.env.DB_NAME = 'postgres';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'dev_access_secret_at_least_32_characters_long';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_at_least_32_characters_long';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
process.env.TERMINAL_EVENT_TOKEN = process.env.TERMINAL_EVENT_TOKEN || 'dev-terminal-token';
process.env.PORT = String(APP_PORT);
process.env.JOBS_ENABLED = process.env.JOBS_ENABLED || 'false';

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('[1/4] PGlite bazasi ochilmoqda...');
  const db = await PGlite.create({ dataDir: DATA_DIR });
  const socketServer = new PGLiteSocketServer({
    db,
    port: PORT,
    host: '127.0.0.1',
    maxConnections: 20,
  });
  await socketServer.start();
  console.log(`      Postgres protokoli: 127.0.0.1:${PORT}`);

  const models = require('../src/models');
  const { sequelize } = models;

  console.log('[2/4] Migratsiyalar bajarilmoqda...');
  await sequelize.authenticate();
  const { Umzug } = require('umzug');

  // Sodda migratsiya saqlash (bajarilgan migratsiyalar ro'yxati)
  const ensureMetaTable = () =>
    sequelize.query(
      'CREATE TABLE IF NOT EXISTS sequelize_migrations (name VARCHAR(255) PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT NOW())'
    );

  const storage = {
    async logMigration({ name }) {
      await ensureMetaTable();
      const safe = String(name).replace(/'/g, "''");
      await sequelize.query(`INSERT INTO sequelize_migrations (name) VALUES ('${safe}')`);
    },
    async unlogMigration({ name }) {
      const safe = String(name).replace(/'/g, "''");
      await sequelize.query(`DELETE FROM sequelize_migrations WHERE name = '${safe}'`);
    },
    async executed() {
      await ensureMetaTable();
      const [rows] = await sequelize.query('SELECT name FROM sequelize_migrations');
      return rows.map((r) => r.name);
    },
  };

  const umzug = new Umzug({
    migrations: {
      glob: ['migrations/*.js', { cwd: path.resolve(__dirname, '..', 'src') }],
      resolve: ({ name, path: filepath, context }) => {
        const migration = require(filepath);
        const Sequelize = require('sequelize');
        // sequelize-cli bilan bir xil chaqiruv shakli
        return {
          ...migration,
          name,
          up: () => migration.up(context, Sequelize),
          down: () => migration.down(context, Sequelize),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage,
    logger: console,
  });
  await umzug.up();

  console.log("[3/4] Boshlang'ich ma'lumotlar...");
  await require('./seed.js')({ closeConnection: false });

  console.log('[4/4] Server ishga tushmoqda...');
  const app = require('../src/app');
  app.listen(APP_PORT, '127.0.0.1', () => {
    console.log(`\n✅ Admin panel:  http://127.0.0.1:${APP_PORT}`);
    console.log(`   API:          http://127.0.0.1:${APP_PORT}/api/health`);
    console.log(`   Login:        admin / Admin@12345\n`);
  });

  const shutdown = async () => {
    await sequelize.close().catch(() => {});
    await socketServer.stop().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Xato:', err);
  process.exit(1);
});
