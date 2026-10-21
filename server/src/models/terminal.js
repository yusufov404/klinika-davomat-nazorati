'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Terminal = sequelize.define(
    'Terminal',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      ipAddress: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 80 },
      username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
      passwordEncrypted: { type: DataTypes.TEXT, allowNull: false },
      direction: {
        type: DataTypes.ENUM('in', 'out', 'both'),
        allowNull: false,
        defaultValue: 'both',
      },
      status: {
        type: DataTypes.ENUM('active', 'offline'),
        allowNull: false,
        defaultValue: 'active',
      },
      lastSeenAt: { type: DataTypes.DATE },
      lastSyncAt: { type: DataTypes.DATE },
      serialNumber: {
        type: DataTypes.STRING(100),
        unique: true,
        comment: "Terminalning o'z seriali",
      },
      location: { type: DataTypes.STRING(200) },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      notes: { type: DataTypes.TEXT },
    },
    { tableName: 'terminals' }
  );

  return Terminal;
};
