'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AttendanceLog = sequelize.define(
    'AttendanceLog',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      terminalId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      logTime: { type: DataTypes.DATE, allowNull: false, comment: 'timestamptz' },
      serialNo: { type: DataTypes.STRING(100), comment: 'Terminal event seriali' },
      eventType: {
        type: DataTypes.ENUM('in', 'out', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown',
      },
      verifyMode: { type: DataTypes.STRING(50) },
      source: {
        type: DataTypes.ENUM('push', 'pull', 'manual'),
        allowNull: false,
        defaultValue: 'push',
      },
      rawPayload: { type: DataTypes.JSONB },
      majorEventType: { type: DataTypes.INTEGER },
      subEventType: { type: DataTypes.INTEGER },
      deviceTime: { type: DataTypes.DATE },
    },
    {
      tableName: 'attendance_logs',
      indexes: [
        { fields: ['terminal_id', 'serial_no'], unique: true, name: 'uniq_terminal_serial' },
        { fields: ['employee_id', 'log_time'] },
        { fields: ['log_time'] },
      ],
    }
  );

  return AttendanceLog;
};
