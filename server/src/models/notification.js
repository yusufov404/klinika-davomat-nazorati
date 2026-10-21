'use strict';

const { DataTypes } = require('sequelize');

/**
 * Tizim ichki bildirishnomalari (admin panelidagi belgcha).
 */
module.exports = (sequelize) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      type: {
        type: DataTypes.ENUM('info', 'warning', 'danger', 'success', 'leave', 'terminal', 'system'),
        allowNull: false,
        defaultValue: 'info',
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT },
      link: { type: DataTypes.STRING(255) },
      userId: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      meta: { type: DataTypes.JSONB },
    },
    {
      tableName: 'notifications',
      timestamps: true,
    }
  );

  return Notification;
};
