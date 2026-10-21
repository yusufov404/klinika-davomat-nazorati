'use strict';

/**
 * Boshlang'ich schema — klinika davomat nazorati tizimi.
 * Barcha vaqtlar TIMESTAMPTZ (UTC+5 / Asia/Tashkent).
 */
module.exports = {
  async up(context) {
    const queryInterface =
      context && typeof context.createTable === 'function' ? context : context.queryInterface;
    const { DataTypes, fn } = require('sequelize');

    // ---------------- Rolalar va foydalanuvchilar ----------------
    await queryInterface.createTable('roles', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      full_name: { type: DataTypes.STRING(200), allowNull: false },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      last_login_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('refresh_tokens', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: { type: DataTypes.STRING(128), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      revoked_at: { type: DataTypes.DATE },
      user_agent: { type: DataTypes.STRING(255) },
      ip_address: { type: DataTypes.STRING(64) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('login_attempts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: DataTypes.STRING(100), allowNull: false },
      ip_address: { type: DataTypes.STRING(64) },
      success: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      attempted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    // ---------------- Tashkiliy tuzilma ----------------
    await queryInterface.createTable('departments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      parent_id: {
        type: DataTypes.INTEGER,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      head_employee_id: { type: DataTypes.INTEGER },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('positions', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('employees', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      full_name: { type: DataTypes.STRING(200), allowNull: false },
      employee_no: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      department_id: {
        type: DataTypes.INTEGER,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      position_id: {
        type: DataTypes.INTEGER,
        references: { model: 'positions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      hire_date: { type: DataTypes.DATEONLY },
      termination_date: { type: DataTypes.DATEONLY },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      phone: { type: DataTypes.STRING(30) },
      terminal_user_id: { type: DataTypes.STRING(50), unique: true },
      face_enrolled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.addConstraint('departments', {
      fields: ['head_employee_id'],
      type: 'foreign key',
      name: 'fk_departments_head_employee',
      references: { table: 'employees', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // ---------------- Terminallar ----------------
    await queryInterface.createTable('terminals', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      ip_address: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 80 },
      username: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'admin' },
      password_encrypted: { type: DataTypes.TEXT, allowNull: false },
      direction: {
        type: DataTypes.ENUM('in', 'out', 'both'),
        allowNull: false,
        defaultValue: 'both',
      },
      status: {
        type: DataTypes.ENUM('active', 'offline'),
        allowNull: false,
        defaultValue: 'active',
      },
      last_seen_at: { type: DataTypes.DATE },
      last_sync_at: { type: DataTypes.DATE },
      serial_number: { type: DataTypes.STRING(100), unique: true },
      location: { type: DataTypes.STRING(200) },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      notes: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('terminal_sync_jobs', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      terminal_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      action: {
        type: DataTypes.ENUM('add', 'update', 'delete', 'face'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'ok', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      last_error: { type: DataTypes.TEXT },
      next_retry_at: { type: DataTypes.DATE },
      completed_at: { type: DataTypes.DATE },
      payload: { type: DataTypes.JSONB },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('terminal_sync_jobs', ['status']);
    await queryInterface.addIndex('terminal_sync_jobs', ['employee_id', 'terminal_id']);

    // ---------------- Davomat loglari ----------------
    await queryInterface.createTable('attendance_logs', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      terminal_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      log_time: { type: DataTypes.DATE, allowNull: false },
      serial_no: { type: DataTypes.STRING(100) },
      event_type: {
        type: DataTypes.ENUM('in', 'out', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown',
      },
      verify_mode: { type: DataTypes.STRING(50) },
      source: {
        type: DataTypes.ENUM('push', 'pull', 'manual'),
        allowNull: false,
        defaultValue: 'push',
      },
      raw_payload: { type: DataTypes.JSONB },
      major_event_type: { type: DataTypes.INTEGER },
      sub_event_type: { type: DataTypes.INTEGER },
      device_time: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    // UNIQUE (terminal_id, serial_no) - duplicate himoyasi
    await queryInterface.addIndex('attendance_logs', {
      fields: ['terminal_id', 'serial_no'],
      unique: true,
      name: 'uniq_terminal_serial',
    });
    await queryInterface.addIndex('attendance_logs', ['employee_id', 'log_time']);
    await queryInterface.addIndex('attendance_logs', ['log_time']);

    await queryInterface.createTable('unmatched_events', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      terminal_id: {
        type: DataTypes.INTEGER,
        references: { model: 'terminals', key: 'id' },
        onDelete: 'CASCADE',
      },
      employee_no: { type: DataTypes.STRING(50) },
      employee_name: { type: DataTypes.STRING(200) },
      log_time: { type: DataTypes.DATE, allowNull: false },
      event_type: { type: DataTypes.STRING(100) },
      verify_mode: { type: DataTypes.STRING(50) },
      serial_no: { type: DataTypes.STRING(100) },
      raw_payload: { type: DataTypes.JSONB },
      resolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      employee_id: {
        type: DataTypes.INTEGER,
        references: { model: 'employees', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('unmatched_events', {
      fields: ['terminal_id', 'serial_no'],
      unique: true,
      name: 'uniq_unmatched_terminal_serial',
    });
    await queryInterface.addIndex('unmatched_events', ['resolved']);

    // ---------------- Ish grafigi ----------------
    await queryInterface.createTable('shifts', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      start_time: { type: DataTypes.STRING(5), allowNull: false },
      end_time: { type: DataTypes.STRING(5), allowNull: false },
      crosses_midnight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      grace_late_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      grace_early_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      break_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      min_work_minutes: { type: DataTypes.INTEGER },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('employee_schedules', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      shift_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      valid_from: { type: DataTypes.DATEONLY, allowNull: false },
      valid_to: { type: DataTypes.DATEONLY },
      weekdays: { type: DataTypes.JSONB, allowNull: false, defaultValue: [1, 2, 3, 4, 5] },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('employee_schedules', ['employee_id', 'valid_from']);

    await queryInterface.createTable('holidays', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      date: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
      name: { type: DataTypes.STRING(200), allowNull: false },
      is_working: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    // ---------------- Ta'tillar ----------------
    await queryInterface.createTable('leave_types', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      is_paid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });

    await queryInterface.createTable('leaves', {
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
        onUpdate: 'CASCADE',
      },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      approved_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_at: { type: DataTypes.DATE },
      comment: { type: DataTypes.TEXT },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('leaves', ['employee_id', 'start_date']);
    await queryInterface.addIndex('leaves', ['status']);

    // ---------------- Tabel ----------------
    await queryInterface.createTable('daily_attendance', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      shift_id: {
        type: DataTypes.INTEGER,
        references: { model: 'shifts', key: 'id' },
        onDelete: 'SET NULL',
      },
      first_in: { type: DataTypes.DATE },
      last_out: { type: DataTypes.DATE },
      worked_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      late_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      early_leave_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      break_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM(
          'present',
          'late',
          'absent',
          'leave',
          'holiday',
          'day_off',
          'incomplete'
        ),
        allowNull: false,
        defaultValue: 'absent',
      },
      is_manual_adjusted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      note: { type: DataTypes.STRING(255) },
      computed_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('daily_attendance', {
      fields: ['employee_id', 'date'],
      unique: true,
      name: 'uniq_employee_date',
    });
    await queryInterface.addIndex('daily_attendance', ['date']);
    await queryInterface.addIndex('daily_attendance', ['status']);

    await queryInterface.createTable('timesheets', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      year: { type: DataTypes.INTEGER, allowNull: false },
      month: { type: DataTypes.INTEGER, allowNull: false },
      worked_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      worked_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      late_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      late_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      absent_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      leave_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('draft', 'approved'),
        allowNull: false,
        defaultValue: 'draft',
      },
      approved_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      approved_at: { type: DataTypes.DATE },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('timesheets', {
      fields: ['employee_id', 'year', 'month'],
      unique: true,
      name: 'uniq_employee_period',
    });
    await queryInterface.addIndex('timesheets', ['year', 'month']);

    // ---------------- Qo'lda tuzatish va audit ----------------
    await queryInterface.createTable('manual_adjustments', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      employee_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onDelete: 'CASCADE',
      },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      old_value: { type: DataTypes.JSONB },
      new_value: { type: DataTypes.JSONB },
      reason: { type: DataTypes.TEXT, allowNull: false },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('manual_adjustments', ['employee_id', 'date']);

    await queryInterface.createTable('audit_log', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entity: { type: DataTypes.STRING(100), allowNull: false },
      entity_id: { type: DataTypes.STRING(100) },
      before: { type: DataTypes.JSONB },
      after: { type: DataTypes.JSONB },
      ip_address: { type: DataTypes.STRING(64) },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: fn('NOW') },
    });
    await queryInterface.addIndex('audit_log', ['entity', 'entity_id']);
    await queryInterface.addIndex('audit_log', ['user_id']);
    await queryInterface.addIndex('audit_log', ['created_at']);
  },

  async down(context) {
    const queryInterface =
      context && typeof context.dropTable === 'function' ? context : context.queryInterface;
    // Avval o'zaro bog'liq constraint'ni olib tashlaymiz
    await queryInterface.removeConstraint('departments', 'fk_departments_head_employee');

    await queryInterface.dropTable('audit_log');
    await queryInterface.dropTable('manual_adjustments');
    await queryInterface.dropTable('timesheets');
    await queryInterface.dropTable('daily_attendance');
    await queryInterface.dropTable('leaves');
    await queryInterface.dropTable('leave_types');
    await queryInterface.dropTable('holidays');
    await queryInterface.dropTable('employee_schedules');
    await queryInterface.dropTable('shifts');
    await queryInterface.dropTable('unmatched_events');
    await queryInterface.dropTable('attendance_logs');
    await queryInterface.dropTable('terminal_sync_jobs');
    await queryInterface.dropTable('terminals');
    await queryInterface.dropTable('employees');
    await queryInterface.dropTable('positions');
    await queryInterface.dropTable('departments');
    await queryInterface.dropTable('login_attempts');
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('roles');
  },
};
