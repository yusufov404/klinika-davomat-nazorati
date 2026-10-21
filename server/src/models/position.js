'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Position = sequelize.define(
    'Position',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    },
    { tableName: 'positions' }
  );

  return Position;
};
