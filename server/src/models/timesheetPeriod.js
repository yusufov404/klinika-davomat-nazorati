'use strict';

const { DataTypes } = require('sequelize');

/**
 * Oylik davr — tasdiqlash va yopish.
 * Yopilgan davrga avtomatik qayta hisoblash tegmaydi.
 */
module.exports = (sequelize) => {
  const TimesheetPeriod = sequelize.define(
    'TimesheetPeriod',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      year: { type: DataTypes.INTEGER, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM('open', 'submitted', 'approved', 'locked'),
        allowNull: false,
        defaultValue: 'open',
      },
      lockedAt: { type: DataTypes.DATE },
      lockedBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approvedBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approvedAt: { type: DataTypes.DATE },
      note: { type: DataTypes.STRING(255) },
    },
    {
      tableName: 'timesheet_periods',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return TimesheetPeriod;
};
