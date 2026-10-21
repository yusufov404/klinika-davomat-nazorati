'use strict';

/**
 * To'liq integratsiya testi (real Postgres - PGlite):
 *   xodim -> terminal -> smena -> grafik -> loglar -> kunlik hisob -> tabel
 */
const test = require('node:test');
const assert = require('node:assert');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');

const PORT = 55440;

process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(PORT);
process.env.DB_NAME = 'postgres';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.TERMINAL_EVENT_TOKEN = 'test_token';
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.JOBS_ENABLED = 'false';

let pglite;
let socketServer;

// Modullar faqat socket server ishga tushgandan KEYIN yuklanadi
let models;
let sequelize;
let attendanceService;
let IngestService;
let authService;
let encrypt;
let T;

let department;
let position;
let employee;
let terminal;
let shift;

const DATE = '2026-03-02'; // Dushanba

test.before(async () => {
  pglite = await PGlite.create();
  socketServer = new PGLiteSocketServer({
    db: pglite,
    port: PORT,
    host: '127.0.0.1',
    maxConnections: 20,
  });
  await socketServer.start();

  models = require('../src/models');
  sequelize = models.sequelize;
  attendanceService = require('../src/services/attendance.service');
  IngestService = require('../src/services/ingest.service');
  authService = require('../src/services/auth.service');
  encrypt = require('../src/utils/crypto').encrypt;
  T = require('../src/utils/time');

  await sequelize.authenticate();

  const { runMigrations } = require('./helpers/migrate');
  await runMigrations(sequelize);

  // Rollar (seed'deki)
  const { ROLE_NAMES } = require('../src/config/rbac');
  for (const name of ROLE_NAMES) {
    await models.Role.findOrCreate({ where: { name }, defaults: { name } });
  }

  // --- Test ma'lumotlari ---
  const { Department, Position, Employee, Terminal, Shift, EmployeeSchedule } = models;

  department = await Department.create({ name: "Terapiya bo'limi" });
  position = await Position.create({ name: 'Shifokor' });

  employee = await Employee.create({
    fullName: 'Alisher Karimov',
    employeeNo: '1042',
    terminalUserId: '1042',
    departmentId: department.id,
    positionId: position.id,
    hireDate: '2025-01-01',
    isActive: true,
  });

  terminal = await Terminal.create({
    name: 'Asosiy kirish',
    ipAddress: '192.168.50.11',
    port: 80,
    username: 'admin',
    passwordEncrypted: encrypt('terminal-pass'),
    direction: 'both',
    status: 'active',
    isActive: true,
  });

  shift = await Shift.create({
    name: 'Kunduzgi 08:00-17:00',
    startTime: '08:00',
    endTime: '17:00',
    crossesMidnight: false,
    graceLateMinutes: 10,
    graceEarlyMinutes: 10,
    breakMinutes: 60,
  });

  await EmployeeSchedule.create({
    employeeId: employee.id,
    shiftId: shift.id,
    validFrom: '2026-01-01',
    validTo: null,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
});

test.after(async () => {
  if (sequelize) await sequelize.close();
  if (socketServer) await socketServer.stop();
  if (pglite) await pglite.close();
});

// -------------------------------------------------------------------
//  Testlar
// -------------------------------------------------------------------
test('baza bilan aloqa ishlaydi', async () => {
  const count = await models.Employee.count();
  assert.strictEqual(count, 1);
});

test('push event qabul qilinadi va log yoziladi', async () => {
  const payload = {
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: '1042',
      name: 'Alisher Karimov',
      dateTime: `${DATE}T08:25:00+05:00`,
      serialNo: 'SN-1001',
      terminalSerialNo: 'SN-TERM-1',
      currentVerifyMode: 'face',
    },
  };

  const result = await IngestService.ingest({
    payload,
    sourceIp: '192.168.50.11',
    source: 'push',
  });

  assert.strictEqual(result.status, 'created');
  const log = await models.AttendanceLog.findByPk(result.logId);
  assert.strictEqual(log.employeeId, employee.id);
  assert.strictEqual(log.terminalId, terminal.id);
  assert.strictEqual(log.source, 'push');
  assert.strictEqual(log.verifyMode, 'face');
  assert.ok(log.rawPayload, 'raw_payload saqlanishi kerak');
});

test('duplicate event (serial_no) qayta yozilmaydi', async () => {
  const payload = {
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: '1042',
      dateTime: `${DATE}T08:25:00+05:00`,
      serialNo: 'SN-1001',
    },
  };

  const result = await IngestService.ingest({ payload, sourceIp: '192.168.50.11', source: 'push' });
  assert.strictEqual(result.status, 'duplicate');
  assert.strictEqual(await models.AttendanceLog.count(), 1);
});

test('debounce: 60 soniya ichidagi ikkinchi event rad etiladi', async () => {
  const payload = {
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: '1042',
      dateTime: `${DATE}T08:25:30+05:00`,
      serialNo: 'SN-1002',
    },
  };

  const result = await IngestService.ingest({ payload, sourceIp: '192.168.50.11', source: 'push' });
  assert.strictEqual(result.status, 'duplicate');
  assert.match(result.reason, /Debounce/);
  assert.strictEqual(await models.AttendanceLog.count(), 1);
});

test('chiqish logi qabul qilinadi', async () => {
  const payload = {
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: '1042',
      dateTime: `${DATE}T17:00:00+05:00`,
      serialNo: 'SN-1003',
    },
  };

  const result = await IngestService.ingest({ payload, sourceIp: '192.168.50.11', source: 'push' });
  assert.strictEqual(result.status, 'created');
  assert.strictEqual(await models.AttendanceLog.count(), 2);
});

test("kunlik davomat to'g'ri hisoblanadi", async () => {
  const daily = await attendanceService.calculateEmployeeDay(employee.id, DATE);

  assert.strictEqual(daily.status, 'late', '08:25 da kelgan - kechikdi');
  assert.strictEqual(daily.lateMinutes, 25, '08:25 da kelgan - 25 daqiqa kechikdi');
  assert.strictEqual(daily.earlyLeaveMinutes, 0);
  assert.strictEqual(daily.workedMinutes, 515 - 60, 'tanaffus hisobga olindi');
  assert.strictEqual(T.toMinutesInTz(daily.firstIn), 8 * 60 + 25);
  assert.strictEqual(T.toMinutesInTz(daily.lastOut), 17 * 60);
});

test("qo'lda tuzatilgan kun qayta hisoblanganda saqlanadi", async () => {
  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: DATE },
  });
  await daily.update({ status: 'leave', workedMinutes: 0, isManualAdjusted: true });

  await attendanceService.calculateEmployeeDay(employee.id, DATE);

  const after = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: DATE },
  });
  assert.strictEqual(after.status, 'leave');
  assert.strictEqual(after.isManualAdjusted, true);
});

test("ta'til kunida absent hisoblanmaydi", async () => {
  const leaveType = await models.LeaveType.create({ name: 'Kasallik', isPaid: true });
  const otherDate = '2026-03-03';

  await models.Leave.create({
    employeeId: employee.id,
    leaveTypeId: leaveType.id,
    startDate: otherDate,
    endDate: otherDate,
    status: 'approved',
  });

  const daily = await attendanceService.calculateEmployeeDay(employee.id, otherDate);
  assert.strictEqual(daily.status, 'leave');
  assert.strictEqual(daily.workedMinutes, 0);
});

test('bayram kuni holiday hisoblanadi', async () => {
  const otherDate = '2026-03-04';
  await models.Holiday.create({ date: otherDate, name: 'Test bayrami', isWorking: false });

  const daily = await attendanceService.calculateEmployeeDay(employee.id, otherDate);
  assert.strictEqual(daily.status, 'holiday');
});

test("log yo'q kunda absent", async () => {
  const otherDate = '2026-03-05'; // juma, smena bor, lekin log yo\'q
  const daily = await attendanceService.calculateEmployeeDay(employee.id, otherDate);
  assert.strictEqual(daily.status, 'absent');
  assert.strictEqual(daily.workedMinutes, 0);
});

test("oqlik tabel yig'iladi", async () => {
  const rows = await models.DailyAttendance.findAll({ where: { employeeId: employee.id } });
  const workedMinutes = rows.reduce((s, r) => s + r.workedMinutes, 0);

  const [sheet] = await models.Timesheet.upsert(
    {
      employeeId: employee.id,
      year: 2026,
      month: 3,
      workedDays: rows.filter((r) => ['present', 'late'].includes(r.status)).length,
      workedMinutes,
      lateCount: rows.filter((r) => r.lateMinutes > 0).length,
      lateMinutes: rows.reduce((s, r) => s + r.lateMinutes, 0),
      absentDays: rows.filter((r) => r.status === 'absent').length,
      leaveDays: rows.filter((r) => r.status === 'leave').length,
      status: 'draft',
    },
    { where: { employeeId: employee.id, year: 2026, month: 3 } }
  );

  assert.ok(sheet.id);
  assert.strictEqual(sheet.absentDays, 1);
  assert.ok(sheet.leaveDays >= 1, "ta'til kunlari hisobda");
});

test('login va JWT tokenlar ishlaydi', async () => {
  const [role] = await models.Role.findOrCreate({
    where: { name: 'superadmin' },
    defaults: { name: 'superadmin', description: 'test' },
  });
  await models.User.create({
    username: 'admin',
    fullName: 'Admin',
    roleId: role.id,
    isActive: true,
    passwordHash: require('bcryptjs').hashSync('Admin@12345', 10),
  });

  const result = await authService.login({
    username: 'admin',
    password: 'Admin@12345',
    ipAddress: '127.0.0.1',
  });

  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.strictEqual(result.user.role, 'superadmin');

  // noto'g'ri parol
  await assert.rejects(
    () => authService.login({ username: 'admin', password: 'wrong', ipAddress: '127.0.0.1' }),
    /noto'g'ri/i
  );
});

test('modellarning barcha ustunlari bazada mavjud (nom mosligi)', async () => {
  // Model atributlari va bazadagi ustun nomlari mos kelishi shart
  const models = require('../src/models');
  const problems = [];

  for (const [name, model] of Object.entries(models)) {
    if (!model || !model.rawAttributes) continue;
    const table = model.getTableName();
    const [rows] = await sequelize.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = :schema AND table_name = :table',
      { replacements: { schema: 'public', table } }
    );
    const columns = rows.map((r) => r.column_name);

    for (const [attr, def] of Object.entries(model.rawAttributes)) {
      const column = def.field || attr;
      if (!columns.includes(column)) {
        problems.push(`${name} (${table}): "${column}" ustuni bazada yo'q`);
      }
    }
  }

  assert.deepStrictEqual(problems, [], problems.join('\n'));
});

test('terminal paroli bazada shifrlangan', async () => {
  const t = await models.Terminal.findByPk(terminal.id);
  assert.notStrictEqual(t.passwordEncrypted, 'terminal-pass');
  assert.ok(t.passwordEncrypted.includes(':'));
});

test("rollar ro'yxati va huquqlar (admin)", async () => {
  const role = await models.Role.findOne({ where: { name: 'superadmin' } });
  await models.User.create({
    username: 'admin2',
    fullName: 'Admin 2',
    roleId: role.id,
    isActive: true,
    passwordHash: require('bcryptjs').hashSync('Admin@12345', 10),
  });

  const login = await authService.login({
    username: 'admin2',
    password: 'Admin@12345',
    ipAddress: '127.0.0.1',
  });
  assert.ok(login.user.permissions.includes('*'));

  // Rolni o'zgartirish
  const { RolePermission } = models;
  const vrach = await models.Role.findOne({ where: { name: 'glavniy_vrach' } });
  assert.ok(vrach, 'glavniy_vrach roli yaratilmagan');

  await RolePermission.create({
    roleId: vrach.id,
    permission: 'attendance:adjust',
    enabled: true,
  });

  const { resolvePermissions } = require('../src/config/rbac');
  const rows = await RolePermission.findAll({ where: { roleId: vrach.id } });
  const effective = resolvePermissions('glavniy_vrach', rows);
  assert.ok(effective.includes('attendance:adjust'), 'huquq yoqilishi kerak');
  assert.ok(effective.includes('reports:read'), 'standart huquqlar saqlanishi kerak');

  // O'chirish
  await RolePermission.update(
    { enabled: false },
    { where: { roleId: vrach.id, permission: 'attendance:adjust' } }
  );
  const rows2 = await RolePermission.findAll({ where: { roleId: vrach.id } });
  const effective2 = resolvePermissions('glavniy_vrach', rows2);
  assert.ok(!effective2.includes('attendance:adjust'), "huquq o'chirilishi kerak");
});

test("glavniy vrach hisobi: ko'rish + tasdiqlash, tahrir yo'q", async () => {
  const role = await models.Role.findOne({ where: { name: 'glavniy_vrach' } });
  await models.User.create({
    username: 'vrach',
    fullName: 'Glavniy vrach',
    roleId: role.id,
    isActive: true,
    passwordHash: require('bcryptjs').hashSync('Vrach@12345', 10),
  });

  const login = await authService.login({
    username: 'vrach',
    password: 'Vrach@12345',
    ipAddress: '127.0.0.1',
  });

  const perms = login.user.permissions;
  assert.ok(perms.includes('reports:read'));
  assert.ok(perms.includes('leaves:approve'));
  assert.ok(perms.includes('timesheets:approve'));
  assert.ok(!perms.includes('employees:write'));
  assert.ok(!perms.includes('terminals:write'));
  assert.ok(!perms.includes('users:write'));
  assert.ok(!perms.includes('attendance:adjust'));
});

test('adminka hisobi admin bilan bir xil huquqli', async () => {
  const role = await models.Role.findOne({ where: { name: 'adminka' } });
  assert.ok(role, 'adminka roli yaratilmagan');

  await models.User.create({
    username: 'adminka',
    fullName: 'Administrator',
    roleId: role.id,
    isActive: true,
    passwordHash: require('bcryptjs').hashSync('Adminka@12345', 10),
  });

  const login = await authService.login({
    username: 'adminka',
    password: 'Adminka@12345',
    ipAddress: '127.0.0.1',
  });

  assert.ok(login.user.permissions.includes('*'), "adminka — to'liq huquqli");
});

test("hisobchi rollari rollar API'ga kirishmaydi (403)", async () => {
  const role = await models.Role.findOne({ where: { name: 'accountant' } });
  await models.User.create({
    username: 'bugar',
    fullName: 'Hisobchi',
    roleId: role.id,
    isActive: true,
    passwordHash: require('bcryptjs').hashSync('Hisobchi@12345', 10),
  });

  const login = await authService.login({
    username: 'bugar',
    password: 'Hisobchi@12345',
    ipAddress: '127.0.0.1',
  });

  const { requirePermission } = require('../src/middlewares/auth');
  assert.throws(
    () => {
      const req = { user: { permissions: login.user.permissions } };
      requirePermission('users:read')(req, {}, (err) => {
        if (err) throw err;
      });
    },
    (err) => err && err.statusCode === 403
  );
});

test('grace ichida kelganda kechikish 0 hisoblanadi', async () => {
  const otherDate = '2026-03-06';
  await models.AttendanceLog.destroy({ where: { employeeId: employee.id } });
  await models.DailyAttendance.destroy({ where: { employeeId: employee.id } });

  for (const [time, serial] of [
    ['08:05:00', 'SN-2001'],
    ['17:00:00', 'SN-2002'],
  ]) {
    await IngestService.ingest({
      payload: {
        majorEventType: 5,
        subEventType: 75,
        AccessControllerEvent: {
          employeeNoString: '1042',
          dateTime: `${otherDate}T${time}+05:00`,
          serialNo: serial,
        },
      },
      sourceIp: '192.168.50.11',
      source: 'push',
    });
  }

  const daily = await attendanceService.calculateEmployeeDay(employee.id, otherDate);
  assert.strictEqual(daily.lateMinutes, 0);
  assert.strictEqual(daily.status, 'present');
});
