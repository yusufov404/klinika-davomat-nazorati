'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DailyAttendance = sequelize.define(
    'DailyAttendance',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      shiftId: { type: DataTypes.INTEGER, references: { model: 'shifts', key: 'id' } },
      firstIn: { type: DataTypes.DATE },
      lastOut: { type: DataTypes.DATE },
      workedMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lateMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      earlyLeaveMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      breakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM(
          'present',
          'late',
          'absent',
          'leave',
          'holiday',
          'day_off',
          'incomplete'
        ),
        allowNull: false,
        defaultValue: 'absent',
      },
      isManualAdjusted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      note: { type: DataTypes.STRING(255) },
      computedAt: { type: DataTypes.DATE },
    },
    {
      tableName: 'daily_attendance',
      indexes: [
        { fields: ['employee_id', 'date'], unique: true, name: 'uniq_employee_date' },
        { fields: ['date'] },
        { fields: ['status'] },
      ],
    }
  );

  return DailyAttendance;
};
