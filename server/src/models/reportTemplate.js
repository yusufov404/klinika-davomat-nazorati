'use strict';

const { DataTypes } = require('sequelize');

/** Saqlangan hisobot shablonlari */
module.exports = (sequelize) => {
  const ReportTemplate = sequelize.define(
    'ReportTemplate',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.STRING(500) },
      type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'daily' },
      columns: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'report_templates',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ReportTemplate;
};
