'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Department = sequelize.define(
    'Department',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      parentId: { type: DataTypes.INTEGER, references: { model: 'departments', key: 'id' } },
      headEmployeeId: { type: DataTypes.INTEGER, references: { model: 'employees', key: 'id' } },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'departments' }
  );

  return Department;
};
