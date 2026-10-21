'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      userId: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entity: { type: DataTypes.STRING(100), allowNull: false },
      entityId: { type: DataTypes.STRING(100) },
      before: { type: DataTypes.JSONB },
      after: { type: DataTypes.JSONB },
      ipAddress: { type: DataTypes.STRING(64) },
      hash: { type: DataTypes.STRING(64), comment: "Zanjir hash'i (o'zgartirilmaslik)" },
      prevHash: { type: DataTypes.STRING(64) },
    },
    {
      tableName: 'audit_log',
      updatedAt: false,
      indexes: [
        { fields: ['entity', 'entity_id'] },
        { fields: ['user_id'] },
        { fields: ['created_at'] },
      ],
    }
  );

  return AuditLog;
};
