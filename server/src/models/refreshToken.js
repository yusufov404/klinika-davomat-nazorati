'use strict';

const { DataTypes } = require('sequelize');

/**
 * Refresh tokenlar (rotatsiya + bekor qilish uchun).
 * Spec'da ko'rsatilmagan, lekin JWT refresh token qayta ishlatilmasligi
 * uchun DBda saqlanishi xavfsizlik talabi.
 */
module.exports = (sequelize) => {
  const RefreshToken = sequelize.define(
    'RefreshToken',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      tokenHash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE },
      userAgent: { type: DataTypes.STRING(255) },
      ipAddress: { type: DataTypes.STRING(64) },
    },
    { tableName: 'refresh_tokens' }
  );

  return RefreshToken;
};
