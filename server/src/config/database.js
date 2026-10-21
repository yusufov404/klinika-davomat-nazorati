'use strict';

const { Sequelize } = require('sequelize');
const config = require('./index');

const options = {
  dialect: 'postgres',
  timezone: config.timezone,
  logging: config.db.logging ? (msg) => console.log(`[sql] ${msg}`) : false,
  define: {
    underscored: true, // createdAt -> created_at (maydon), atribut nomi o'zgarmaydi
    timestamps: true,
  },
  pool: {
    max: 20,
    min: 2,
    acquire: 30000,
    idle: 10000,
  },
};

const sequelize = config.db.url
  ? new Sequelize(config.db.url, options)
  : new Sequelize(config.db.name, config.db.user, config.db.password, {
      ...options,
      host: config.db.host,
      port: config.db.port,
    });

module.exports = sequelize;
