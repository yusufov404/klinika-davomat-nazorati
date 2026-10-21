'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Shift = sequelize.define(
    'Shift',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      startTime: { type: DataTypes.STRING(5), allowNull: false, comment: 'HH:mm' },
      endTime: { type: DataTypes.STRING(5), allowNull: false, comment: 'HH:mm' },
      crossesMidnight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      graceLateMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      graceEarlyMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      breakMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      minWorkMinutes: { type: DataTypes.INTEGER },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'shifts' }
  );

  return Shift;
};
