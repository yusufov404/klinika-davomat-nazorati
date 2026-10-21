'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TerminalSyncJob = sequelize.define(
    'TerminalSyncJob',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      terminalId: {
        type: DataTypes.INTEGER,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: {
        type: DataTypes.ENUM('add', 'update', 'delete', 'face'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'ok', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastError: { type: DataTypes.TEXT },
      nextRetryAt: { type: DataTypes.DATE },
      completedAt: { type: DataTypes.DATE },
      payload: { type: DataTypes.JSONB },
    },
    {
      tableName: 'terminal_sync_jobs',
      indexes: [{ fields: ['status'] }, { fields: ['employee_id', 'terminal_id'] }],
    }
  );

  return TerminalSyncJob;
};
