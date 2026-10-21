'use strict';

/**
 * Rol huquqlarini boshqarish jadvali.
 * Admin panel orqali huquqlarni yoqish/o'chirish uchun.
 */
module.exports = {
  async up(queryInterface) {
    const { DataTypes } = require('sequelize');

    await queryInterface.createTable('role_permissions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      permission: { type: DataTypes.STRING(100), allowNull: false },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: require('sequelize').fn('NOW'),
      },
    });

    await queryInterface.addIndex('role_permissions', {
      fields: ['role_id', 'permission'],
      unique: true,
      name: 'uniq_role_permission',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('role_permissions');
  },
};
