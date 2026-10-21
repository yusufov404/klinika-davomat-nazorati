'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ManualAdjustment = sequelize.define(
    'ManualAdjustment',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      oldValue: { type: DataTypes.JSONB },
      newValue: { type: DataTypes.JSONB },
      reason: { type: DataTypes.TEXT, allowNull: false },
      createdBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
    },
    {
      tableName: 'manual_adjustments',
      indexes: [{ fields: ['employee_id', 'date'] }],
    }
  );

  return ManualAdjustment;
};
