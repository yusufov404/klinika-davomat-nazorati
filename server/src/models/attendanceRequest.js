'use strict';

const { DataTypes } = require('sequelize');

/** Xodimning kelish/ketishni tasdiqlashga so'rovi */
module.exports = (sequelize) => {
  const AttendanceRequest = sequelize.define(
    'AttendanceRequest',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      requestedIn: { type: DataTypes.STRING(5) },
      requestedOut: { type: DataTypes.STRING(5) },
      reason: { type: DataTypes.STRING(500) },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewedBy: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      reviewedAt: { type: DataTypes.DATE },
      reviewComment: { type: DataTypes.STRING(500) },
    },
    {
      tableName: 'attendance_requests',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return AttendanceRequest;
};
