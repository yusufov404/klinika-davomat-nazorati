'use strict';

const { DataTypes } = require('sequelize');

/** Biometrik (va boshqa) roziliklar registri */
module.exports = (sequelize) => {
  const Consent = sequelize.define(
    'Consent',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      kind: {
        type: DataTypes.ENUM('biometric', 'photo', 'location', 'other'),
        allowNull: false,
        defaultValue: 'biometric',
      },
      documentNo: { type: DataTypes.STRING(100) },
      givenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      expiresAt: { type: DataTypes.DATE },
      revokedAt: { type: DataTypes.DATE },
      signaturePath: { type: DataTypes.STRING(255) },
      note: { type: DataTypes.STRING(500) },
      createdBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
    },
    {
      tableName: 'consents',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return Consent;
};
