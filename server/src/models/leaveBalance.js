'use strict';

const { DataTypes } = require('sequelize');

/** Ta'til balansi — xodim va ta'til turi bo'yicha */
module.exports = (sequelize) => {
  const LeaveBalance = sequelize.define(
    'LeaveBalance',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      leaveTypeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onDelete: 'CASCADE',
      },
      year: { type: DataTypes.INTEGER, allowNull: false },
      entitledDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      usedDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      carriedOver: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      note: { type: DataTypes.STRING(255) },
    },
    {
      tableName: 'leave_balances',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return LeaveBalance;
};
