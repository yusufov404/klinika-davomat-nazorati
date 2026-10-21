'use strict';

/**
 * Migratsiya testi:
 *  1) Sequelize haqiqiy SQL generatsiyasini yig'adi (DB ulanishsiz)
 *  2) O'sha SQL haqiqiy Postgres (PGlite) da bajariladi
 *  3) Jadvallar, indekslar, constraint'lar va tiplar tekshiriladi
 */
const test = require('node:test');
const assert = require('node:assert');
const { PGlite } = require('@electric-sql/pglite');
const { Sequelize } = require('sequelize');

process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const TABLES = [
  'roles',
  'users',
  'refresh_tokens',
  'login_attempts',
  'departments',
  'positions',
  'employees',
  'terminals',
  'terminal_sync_jobs',
  'attendance_logs',
  'unmatched_events',
  'shifts',
  'employee_schedules',
  'holidays',
  'leave_types',
  'leaves',
  'daily_attendance',
  'timesheets',
  'manual_adjustments',
  'audit_log',
];

let db;
let sequelize;
let statements;

test.before(async () => {
  db = await PGlite.create();

  // 1) SQL yig'ish
  sequelize = new Sequelize('postgres://postgres@127.0.0.1:5432/postgres', {
    dialect: 'postgres',
    logging: false,
  });

  const captured = [];
  sequelize.query = async (sql) => {
    if (typeof sql === 'string') {
      captured.push(sql);
      // Enum tiplarini tekshirish (pgListEnums) - mavjud emas deb javob beramiz,
      // shunda Sequelize CREATE TYPE ni o'zi chiqaradi (DO $$ ... $$;)
      if (/pg_enum/i.test(sql)) return undefined;
      // Dynamic OID'lar ro'yxatini yangilash
      if (/typtype/i.test(sql)) return { rows: [] };
    }
    return [[], {}];
  };

  const migration = require('../src/migrations/20260101000001-init-schema');
  await migration.up(sequelize.getQueryInterface(), Sequelize);

  // 2) SQL bajarish (enum tiplari avval yaratiladi)
  const typeStatements = captured.filter((s) => /CREATE\s+TYPE/i.test(s));
  const otherStatements = captured.filter((s) => !/CREATE\s+TYPE/i.test(s));

  for (const sql of [...typeStatements, ...otherStatements]) {
    await db.exec(sql);
  }
  statements = captured;
});

test.after(async () => {
  if (db) await db.close();
});

test("SQL generatsiyasi bo'sh emas", () => {
  assert.ok(statements.length > TABLES.length, `Faqat ${statements.length} ta SQL`);
});

test('barcha jadvallar yaratilgan', async () => {
  const res = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const list = res.rows.map((r) => r.table_name);
  for (const t of TABLES) {
    assert.ok(list.includes(t), `Jadval topilmadi: ${t}`);
  }
});

test('attendance_logs da UNIQUE (terminal_id, serial_no)', async () => {
  const res = await db.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'attendance_logs'`
  );
  const names = res.rows.map((r) => r.indexname);
  assert.ok(names.includes('uniq_terminal_serial'), `Indekslar: ${names.join(', ')}`);
});

test('daily_attendance da UNIQUE (employee_id, date)', async () => {
  const res = await db.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'daily_attendance'`
  );
  assert.ok(res.rows.map((r) => r.indexname).includes('uniq_employee_date'));
});

test('timesheets da UNIQUE (employee_id, year, month)', async () => {
  const res = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'timesheets'`);
  assert.ok(res.rows.map((r) => r.indexname).includes('uniq_employee_period'));
});

test('vaqt ustunlari timestamptz turida', async () => {
  const res = await db.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_name IN ('attendance_logs', 'daily_attendance', 'terminals')
      AND column_name IN ('log_time', 'first_in', 'last_out', 'last_seen_at', 'created_at')
  `);
  assert.ok(res.rows.length > 0);
  for (const r of res.rows) {
    assert.strictEqual(
      r.data_type,
      'timestamp with time zone',
      `${r.table_name}.${r.column_name} -> ${r.data_type}`
    );
  }
});

test('enum tiplari yaratilgan', async () => {
  const res = await db.query(
    `SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid`
  );
  const labels = res.rows.map((r) => r.enumlabel);
  for (const v of [
    'push',
    'pull',
    'manual',
    'incomplete',
    'day_off',
    'approved',
    'rejected',
    'both',
  ]) {
    assert.ok(labels.includes(v), `Enum qiymati topilmadi: ${v}`);
  }
});

test('UNIQUE constraint ishlaydi (duplicate rad etiladi)', async () => {
  await db.exec(`
    INSERT INTO terminals (name, ip_address, password_encrypted, created_at, updated_at)
    VALUES ('T1', '192.168.50.11', 'x', NOW(), NOW());
    INSERT INTO employees (full_name, employee_no, created_at, updated_at)
    VALUES ('Test', '1', NOW(), NOW());
    INSERT INTO attendance_logs (employee_id, terminal_id, log_time, serial_no, created_at, updated_at)
    VALUES (1, 1, NOW(), 'SN-1', NOW(), NOW());
  `);

  let error = null;
  try {
    await db.exec(`
      INSERT INTO attendance_logs (employee_id, terminal_id, log_time, serial_no, created_at, updated_at)
      VALUES (1, 1, NOW(), 'SN-1', NOW(), NOW());
    `);
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'Duplicate qator qabul qilindi (xato!)');
  assert.match(error.message, /unique|duplicate/i);
});

test('foreign key constraint ishlaydi', async () => {
  let error = null;
  try {
    await db.exec(`
      INSERT INTO attendance_logs (employee_id, terminal_id, log_time, created_at, updated_at)
      VALUES (9999, 9999, NOW(), NOW(), NOW());
    `);
  } catch (e) {
    error = e;
  }
  assert.ok(error, 'FK buzildi (xato!)');
  assert.match(error.message, /foreign key|violates/i);
});

test('migratsiya down() ishlaydi', async () => {
  // down() uchun SQL ni ham shu usulda yig'amiz
  const captured = [];
  sequelize.query = async (sql) => {
    if (typeof sql === 'string') captured.push(sql);
    return [[], {}];
  };

  const migration = require('../src/migrations/20260101000001-init-schema');
  await migration.down(sequelize.getQueryInterface());
  for (const sql of captured) {
    await db.exec(sql);
  }

  const res = await db.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const list = res.rows.map((r) => r.table_name);
  for (const t of TABLES) {
    assert.ok(!list.includes(t), `Jadval o'chmagan: ${t}`);
  }
});
