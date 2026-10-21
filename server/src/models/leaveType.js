'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LeaveType = sequelize.define(
    'LeaveType',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      isPaid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'leave_types' }
  );

  return LeaveType;
};
