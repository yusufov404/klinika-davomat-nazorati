/* eslint-disable */
require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'attendance',
  password: process.env.DB_PASSWORD || 'attendance',
  database: process.env.DB_NAME || 'attendance',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  timezone: process.env.DB_TIMEZONE || '+05:00',
  define: {
    underscored: true,
    timestamps: true,
  },
  migration: {
    tableName: 'sequelize_migrations',
  },
  seederStorage: 'sequelize',
  seederStorageTableName: 'sequelize_seeds',
};

module.exports = {
  development: {
    ...base,
    url: process.env.DATABASE_URL,
  },
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || 'attendance_test',
    logging: false,
  },
  production: {
    ...base,
    url: process.env.DATABASE_URL,
    logging: false,
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
  },
};
