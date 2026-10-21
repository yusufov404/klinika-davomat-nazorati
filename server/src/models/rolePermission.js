'use strict';

const { DataTypes } = require('sequelize');

/**
 * Rol huquqlarining bazadagi sozlamalari.
 * enabled = true  → huquqni yoqish
 * enabled = false → huquqni o'chirish (dasturiy standartdan)
 * Rolga qatorlar bo'lmasa — dasturiy standartlar (config/rbac.js) qo'llaniladi.
 */
module.exports = (sequelize) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onDelete: 'CASCADE',
      },
      permission: { type: DataTypes.STRING(100), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'role_permissions',
      indexes: [{ fields: ['role_id', 'permission'], unique: true, name: 'uniq_role_permission' }],
    }
  );

  return RolePermission;
};
