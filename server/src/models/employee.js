'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Employee = sequelize.define(
    'Employee',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      fullName: { type: DataTypes.STRING(200), allowNull: false },
      employeeNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Tabel raqami',
      },
      departmentId: { type: DataTypes.INTEGER, references: { model: 'departments', key: 'id' } },
      positionId: { type: DataTypes.INTEGER, references: { model: 'positions', key: 'id' } },
      hireDate: { type: DataTypes.DATEONLY },
      terminationDate: { type: DataTypes.DATEONLY },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      phone: { type: DataTypes.STRING(30) },
      terminalUserId: {
        type: DataTypes.STRING(50),
        unique: true,
        comment: 'Terminaldagi employeeNo',
      },
      faceEnrolled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.TEXT },
    },
    {
      tableName: 'employees',
      indexes: [{ fields: ['department_id'] }, { fields: ['is_active'] }],
    }
  );

  return Employee;
};
