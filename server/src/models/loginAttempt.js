'use strict';

const { DataTypes } = require('sequelize');

/** Login urinishlari (bloklash uchun) */
module.exports = (sequelize) => {
  const LoginAttempt = sequelize.define(
    'LoginAttempt',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(100), allowNull: false },
      ipAddress: { type: DataTypes.STRING(64) },
      success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      attemptedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'login_attempts' }
  );

  return LoginAttempt;
};
