'use strict';

const { DataTypes } = require('sequelize');

/**
 * Xodimi topilmagan eventlar (terminal yuz tanidi, lekin bazada xodim yo'q).
 * HR qo'lda tuzatish qilishi mumkin.
 */
module.exports = (sequelize) => {
  const UnmatchedEvent = sequelize.define(
    'UnmatchedEvent',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      terminalId: {
        type: DataTypes.INTEGER,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      employeeNo: { type: DataTypes.STRING(50) },
      employeeName: { type: DataTypes.STRING(200) },
      logTime: { type: DataTypes.DATE, allowNull: false },
      eventType: { type: DataTypes.STRING(100) },
      verifyMode: { type: DataTypes.STRING(50) },
      serialNo: { type: DataTypes.STRING(100) },
      rawPayload: { type: DataTypes.JSONB },
      resolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      employeeId: {
        type: DataTypes.INTEGER,
        references: { model: 'employees', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'unmatched_events',
      indexes: [{ fields: ['resolved'] }, { fields: ['terminal_id', 'serial_no'], unique: true }],
    }
  );

  return UnmatchedEvent;
};
