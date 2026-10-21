'use strict';

const { DataTypes } = require('sequelize');

/**
 * Tizim sozlamalari (kalit-qiymat).
 * Masalan: telegram.bot_token, telegram.chat_id, notify.daily_summary
 */
module.exports = (sequelize) => {
  const Setting = sequelize.define(
    'Setting',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      value: { type: DataTypes.TEXT },
      type: {
        type: DataTypes.ENUM('string', 'number', 'boolean', 'json'),
        allowNull: false,
        defaultValue: 'string',
      },
      description: { type: DataTypes.STRING(255) },
      isSecret: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      updatedBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'settings',
      timestamps: true,
    }
  );

  return Setting;
};
