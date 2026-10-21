'use strict';

const { DataTypes } = require('sequelize');

/** Tashqi integratsiyalar uchun API kalitlari (faqat hash saqlanadi) */
module.exports = (sequelize) => {
  const ApiKey = sequelize.define(
    'ApiKey',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      keyPrefix: { type: DataTypes.STRING(20), allowNull: false },
      keyHash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      lastUsedAt: { type: DataTypes.DATE },
      expiresAt: { type: DataTypes.DATE },
      revokedAt: { type: DataTypes.DATE },
      createdBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'api_keys',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ApiKey;
};
