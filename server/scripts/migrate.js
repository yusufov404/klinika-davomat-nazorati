'use strict';

/**
 * Migratsiyalarni bajarish (sequelize-cli ga bog'liq emas).
 *
 * Ishga tushirish:
 *   node scripts/migrate.js up      — yangi migratsiyalarni bajarish
 *   node scripts/migrate.js down    — oxirgi migratsiyani bekor qilish
 *   node scripts/migrate.js status  — holati
 */
require('dotenv').config();

const path = require('path');
const { Umzug } = require('umzug');
const { Sequelize } = require('sequelize');
const logger = require('../src/config/logger');

const { sequelize } = require('../src/models');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'src', 'migrations');

async function makeStorage() {
  const ensureMetaTable = () =>
    sequelize.query(
      'CREATE TABLE IF NOT EXISTS sequelize_migrations (name VARCHAR(255) PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT NOW())'
    );

  return {
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
}

async function main() {
  const command = process.argv[2] || 'up';

  await sequelize.authenticate();

  const umzug = new Umzug({
    migrations: {
      glob: ['*.js', { cwd: MIGRATIONS_DIR }],
      resolve: ({ name, path: filepath, context }) => {
        const migration = require(filepath);
        // sequelize-cli bilan bir xil chaqiruv shakli: up(queryInterface, Sequelize)
        return {
          ...migration,
          name,
          up: () => migration.up(context, Sequelize),
          down: () => migration.down(context, Sequelize),
        };
      },
    },
    context: sequelize.getQueryInterface(),
    storage: await makeStorage(),
    logger: {
      info: (msg) => logger.info(msg),
      warn: (msg) => logger.warn(msg),
      error: (msg) => logger.error(msg),
      debug: () => {},
    },
  });

  if (command === 'up') {
    const applied = await umzug.up();
    logger.info(`Bajarilgan migratsiyalar: ${applied.length}`);
  } else if (command === 'down') {
    const reverted = await umzug.down();
    logger.info(`Bekor qilingan migratsiyalar: ${reverted.length}`);
  } else if (command === 'status') {
    const executed = await umzug.executed();
    const pending = await umzug.pending();
    const nameOf = (m) => (typeof m === 'string' ? m : (m && m.name) || "noma'lum");
    logger.info(`Bajarilgan: ${executed.length ? executed.map(nameOf).join(', ') : "yo'q"}`);
    logger.info(`Kutilmoqda: ${pending.length ? pending.map(nameOf).join(', ') : "yo'q"}`);
  } else {
    logger.error(`Noma'lum buyruq: ${command}. Foydalanish: up | down | status`);
    process.exitCode = 1;
  }

  await sequelize.close();
}

main().catch((err) => {
  logger.error('Migratsiya xatosi:', err);
  process.exit(1);
});
