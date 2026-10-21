'use strict';

/**
 * Testlar uchun barcha migratsiyalarni bajarish.
 * (sequelize-cli ga bog'liq emas — umzug + o'z storage'imiz bilan)
 */
const path = require('path');
const { Umzug } = require('umzug');
const { Sequelize } = require('sequelize');

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
async function runMigrations(sequelize) {
  const srcDir = path.resolve(__dirname, '..', '..', 'src');

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
      glob: ['migrations/*.js', { cwd: srcDir }],
      resolve: ({ name, path: filepath, context }) => {
        const migration = require(filepath);
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
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });

  return umzug.up();
}

module.exports = { runMigrations };
