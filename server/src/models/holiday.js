'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Holiday = sequelize.define(
    'Holiday',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      date: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      isWorking: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'holidays' }
  );

  return Holiday;
};
