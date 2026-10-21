'use strict';

/**
 * Tizim sozlamalari, xato kuzatuvi va "parolni o'zgartirish majburiy" belgisi.
 */
module.exports = {
  async up(queryInterface) {
    const { DataTypes } = require('sequelize');

    // --- Tizim sozlamalari (kalit -> qiymat) ---
    await queryInterface.createTable('settings', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      value: { type: DataTypes.TEXT },
      type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'string' },
      description: { type: DataTypes.STRING(255) },
      is_secret: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      updated_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
    });

    // --- Xato kuzatuvi ---
    await queryInterface.createTable('error_logs', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      level: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'error' },
      message: { type: DataTypes.TEXT, allowNull: false },
      stack: { type: DataTypes.TEXT },
      code: { type: DataTypes.STRING(100) },
      path: { type: DataTypes.STRING(255) },
      method: { type: DataTypes.STRING(10) },
      user_id: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      ip_address: { type: DataTypes.STRING(64) },
      context: { type: DataTypes.JSONB },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
    });
    await queryInterface.addIndex('error_logs', ['level']);
    await queryInterface.addIndex('error_logs', ['created_at']);

    // --- Parolni o'zgartirish majburiy ---
    await queryInterface.addColumn('users', 'must_change_password', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('users', 'last_login_ip', {
      type: DataTypes.STRING(64),
    });

    // --- Tizim ichki bildirishnomalari (paneldagi belgcha) ---
    await queryInterface.createTable('notifications', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      type: {
        type: DataTypes.ENUM('info', 'warning', 'danger', 'success', 'leave', 'terminal', 'system'),
        allowNull: false,
        defaultValue: 'info',
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT },
      link: { type: DataTypes.STRING(255) },
      user_id: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      meta: { type: DataTypes.JSONB },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
    });
    await queryInterface.addIndex('notifications', ['is_read']);
    await queryInterface.addIndex('notifications', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.removeColumn('users', 'last_login_ip');
    await queryInterface.removeColumn('users', 'must_change_password');
    await queryInterface.dropTable('error_logs');
    await queryInterface.dropTable('settings');
  },
};
