'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Timesheet = sequelize.define(
    'Timesheet',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      year: { type: DataTypes.INTEGER, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false },
      workedDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      workedMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lateCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lateMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      absentDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      leaveDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('draft', 'approved'),
        allowNull: false,
        defaultValue: 'draft',
      },
      approvedBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
      approvedAt: { type: DataTypes.DATE },
    },
    {
      tableName: 'timesheets',
      indexes: [
        { fields: ['employee_id', 'year', 'month'], unique: true, name: 'uniq_employee_period' },
        { fields: ['year', 'month'] },
      ],
    }
  );

  return Timesheet;
};
