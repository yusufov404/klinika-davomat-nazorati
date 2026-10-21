'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EmployeeSchedule = sequelize.define(
    'EmployeeSchedule',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      shiftId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
      },
      validFrom: { type: DataTypes.DATEONLY, allowNull: false },
      validTo: { type: DataTypes.DATEONLY },
      weekdays: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [1, 2, 3, 4, 5],
        comment: '1=Dushanba ... 7=Yakshanba',
      },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'employee_schedules',
      indexes: [{ fields: ['employee_id', 'valid_from'] }],
    }
  );

  return EmployeeSchedule;
};
