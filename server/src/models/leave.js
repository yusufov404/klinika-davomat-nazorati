'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Leave = sequelize.define(
    'Leave',
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
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approvedBy: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
      approvedAt: { type: DataTypes.DATE },
      comment: { type: DataTypes.TEXT },
    },
    {
      tableName: 'leaves',
      indexes: [{ fields: ['employee_id', 'start_date'] }, { fields: ['status'] }],
    }
  );

  return Leave;
};
