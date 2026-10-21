'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false },
      fullName: { type: DataTypes.STRING(200), allowNull: false },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lastLoginAt: { type: DataTypes.DATE },
      lastLoginIp: { type: DataTypes.STRING(64) },
      mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      twoFactorSecret: { type: DataTypes.STRING(64) },
      twoFactorEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      twoFactorPending: { type: DataTypes.STRING(64) },
      passwordChangedAt: { type: DataTypes.DATE },
    },
    { tableName: 'users' }
  );

  return User;
};
