'use strict';

const { DataTypes } = require('sequelize');

/**
 * Xatolar jadvali (error tracking) — 500 xatolar shu yerda to'planadi.
 */
module.exports = (sequelize) => {
  const ErrorLog = sequelize.define(
    'ErrorLog',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      level: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'error' },
      message: { type: DataTypes.TEXT, allowNull: false },
      stack: { type: DataTypes.TEXT },
      code: { type: DataTypes.STRING(100) },
      path: { type: DataTypes.STRING(255) },
      method: { type: DataTypes.STRING(10) },
      userId: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      ipAddress: { type: DataTypes.STRING(64) },
      context: { type: DataTypes.JSONB },
    },
    {
      tableName: 'error_logs',
      updatedAt: false,
    }
  );

  return ErrorLog;
};
