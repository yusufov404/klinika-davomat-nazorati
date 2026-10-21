'use strict';

/**
 * Professional HR oqimi uchun jadvallar:
 *  - timesheet_periods     : oylik davrni tasdiqlash va yopish
 *  - leave_balances       : ta'til balansi (har bir tur bo'yicha)
 *  - overtime_records     : qo'shimcha ish vaqti
 *  - attendance_requests  : xodimning kelish/ketishni tasdiqlash so'rovi
 *  - consents             : biometrik rozilik registri
 *  - report_templates     : saqlangan hisobot shablonlari
 *  - api_keys             : tashqi integratsiyalar uchun kalitlar
 *  - users: 2FA maydonlari
 *  - audit_log: hash zanjiri
 */
module.exports = {
  async up(queryInterface) {
    const { DataTypes } = require('sequelize');
    const now = require('sequelize').fn('NOW');

    // ---------- Oylik davr (tasdiqlash / yopish) ----------
    await queryInterface.createTable('timesheet_periods', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      year: { type: DataTypes.INTEGER, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        type: DataTypes.ENUM('open', 'submitted', 'approved', 'locked'),
        allowNull: false,
        defaultValue: 'open',
      },
      locked_at: { type: DataTypes.DATE },
      locked_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_at: { type: DataTypes.DATE },
      note: { type: DataTypes.STRING(255) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });
    await queryInterface.addIndex('timesheet_periods', {
      fields: ['year', 'month'],
      unique: true,
      name: 'uniq_timesheet_period',
    });

    // ---------- Ta'til balansi ----------
    await queryInterface.createTable('leave_balances', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      leave_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onDelete: 'CASCADE',
      },
      year: { type: DataTypes.INTEGER, allowNull: false },
      entitled_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      used_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      carried_over: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      note: { type: DataTypes.STRING(255) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });
    await queryInterface.addIndex('leave_balances', {
      fields: ['employee_id', 'leave_type_id', 'year'],
      unique: true,
      name: 'uniq_leave_balance',
    });

    // ---------- Qo'shimcha ish vaqti ----------
    await queryInterface.createTable('overtime_records', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      kind: {
        type: DataTypes.ENUM('regular', 'night', 'holiday', 'weekend'),
        allowNull: false,
        defaultValue: 'regular',
      },
      multiplier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      source: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' },
      note: { type: DataTypes.STRING(255) },
      approved_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });
    await queryInterface.addIndex('overtime_records', ['employee_id', 'date']);

    // ---------- Xodimning tasdiqlash so'rovi ----------
    await queryInterface.createTable('attendance_requests', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      requested_in: { type: DataTypes.STRING(5) },
      requested_out: { type: DataTypes.STRING(5) },
      reason: { type: DataTypes.STRING(500) },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      reviewed_at: { type: DataTypes.DATE },
      review_comment: { type: DataTypes.STRING(500) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });
    await queryInterface.addIndex('attendance_requests', ['employee_id', 'date']);

    // ---------- Biometrik rozilik registri ----------
    await queryInterface.createTable('consents', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
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
      document_no: { type: DataTypes.STRING(100) },
      given_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      expires_at: { type: DataTypes.DATE },
      revoked_at: { type: DataTypes.DATE },
      signature_path: { type: DataTypes.STRING(255) },
      note: { type: DataTypes.STRING(500) },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });
    await queryInterface.addIndex('consents', ['employee_id', 'kind']);

    // ---------- Saqlangan hisobot shablonlari ----------
    await queryInterface.createTable('report_templates', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.STRING(500) },
      type: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'daily' },
      columns: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });

    // ---------- API kalitlari ----------
    await queryInterface.createTable('api_keys', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      key_prefix: { type: DataTypes.STRING(20), allowNull: false },
      key_hash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      last_used_at: { type: DataTypes.DATE },
      expires_at: { type: DataTypes.DATE },
      revoked_at: { type: DataTypes.DATE },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: now },
    });

    // ---------- 2FA (TOTP) ----------
    await queryInterface.addColumn('users', 'two_factor_secret', { type: DataTypes.STRING(64) });
    await queryInterface.addColumn('users', 'two_factor_enabled', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('users', 'two_factor_pending', { type: DataTypes.STRING(64) });
    await queryInterface.addColumn('users', 'password_changed_at', { type: DataTypes.DATE });

    // ---------- Audit zanjiri (hash) ----------
    await queryInterface.addColumn('audit_log', 'hash', { type: DataTypes.STRING(64) });
    await queryInterface.addColumn('audit_log', 'prev_hash', { type: DataTypes.STRING(64) });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('audit_log', 'prev_hash');
    await queryInterface.removeColumn('audit_log', 'hash');
    await queryInterface.removeColumn('users', 'password_changed_at');
    await queryInterface.removeColumn('users', 'two_factor_pending');
    await queryInterface.removeColumn('users', 'two_factor_enabled');
    await queryInterface.removeColumn('users', 'two_factor_secret');
    await queryInterface.dropTable('api_keys');
    await queryInterface.dropTable('report_templates');
    await queryInterface.dropTable('consents');
    await queryInterface.dropTable('attendance_requests');
    await queryInterface.dropTable('overtime_records');
    await queryInterface.dropTable('leave_balances');
    await queryInterface.dropTable('timesheet_periods');
  },
};
