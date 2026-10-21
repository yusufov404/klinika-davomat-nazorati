'use strict';

const { DataTypes } = require('sequelize');

/** Qo'shimcha ish vaqti (overtime) */
module.exports = (sequelize) => {
  const OvertimeRecord = sequelize.define(
    'OvertimeRecord',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      kind: {
        type: DataTypes.ENUM('regular', 'night', 'holiday', 'weekend'),
        allowNull: false,
        defaultValue: 'regular',
      },
      multiplier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
      note: { type: DataTypes.STRING(255) },
      approvedBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'overtime_records',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return OvertimeRecord;
};
