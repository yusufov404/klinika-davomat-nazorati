'use strict';

/**
 * Excel integratsiyasi testi:
 *   shablon eksporti -> faylni tahrirlash -> import -> bazadagi o'zgarish
 */
const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('node:stream');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const ExcelJS = require('exceljs');

const PORT = 55441;

process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = String(PORT);
process.env.DB_NAME = 'postgres';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';

let pglite;
let socketServer;
let models;
let sequelize;
let ExcelService;

let employee;
let department;
let shift;

const YEAR = 2026;
const MONTH = 3;
const DATE = '2026-03-02';

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
  ExcelService = require('../src/services/excel.service');

  await sequelize.authenticate();
  const { runMigrations } = require('./helpers/migrate');
  await runMigrations(sequelize);

  department = await models.Department.create({ name: 'Terapiya' });
  employee = await models.Employee.create({
    fullName: 'Alisher Karimov',
    employeeNo: '1001',
    terminalUserId: '1001',
    departmentId: department.id,
    isActive: true,
  });
  shift = await models.Shift.create({
    name: 'Kunduzgi 08:00-17:00',
    startTime: '08:00',
    endTime: '17:00',
    crossesMidnight: false,
    graceLateMinutes: 10,
    graceEarlyMinutes: 10,
    breakMinutes: 60,
  });
  await models.EmployeeSchedule.create({
    employeeId: employee.id,
    shiftId: shift.id,
    validFrom: '2026-01-01',
    validTo: null,
    weekdays: [1, 2, 3, 4, 5, 6, 7],
  });
  await models.DailyAttendance.create({
    employeeId: employee.id,
    date: DATE,
    shiftId: shift.id,
    firstIn: new Date('2026-03-02T08:00:00+05:00'),
    lastOut: new Date('2026-03-02T17:00:00+05:00'),
    workedMinutes: 480,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    status: 'present',
  });
});

test.after(async () => {
  if (sequelize) await sequelize.close();
  if (socketServer) await socketServer.stop();
  if (pglite) await pglite.close();
});

/** Shablonni bufferga yozish */
async function exportTemplate() {
  const stream = new PassThrough();
  const chunks = [];
  stream.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => {
    stream.on('end', resolve);
  });
  await ExcelService.exportTabelMatrix(stream, { year: YEAR, month: MONTH });
  await done;
  return Buffer.concat(chunks);
}

// -------------------------------------------------------------------
test('shablon eksporti: "Tabel" va "Qo\'llanma" varaqlari', async () => {
  const buffer = await exportTemplate();
  assert.ok(buffer.length > 3000, "Fayl bo'sh bo'lmasligi kerak");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const names = wb.worksheets.map((w) => w.name);
  assert.ok(names.includes('Tabel'), `Varaqlar: ${names.join(', ')}`);
  assert.ok(
    names.some((n) => n.includes("Qo'llanma")),
    `Varaqlar: ${names.join(', ')}`
  );
});

test('shablon: sarlavha, xodim qatori va kun ustunlari', async () => {
  const buffer = await exportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Tabel');

  const matrix = ExcelService.detectMatrix(sheet);
  assert.ok(matrix, 'Matritsa aniqlanmadi');
  assert.strictEqual(matrix.year, YEAR);
  assert.strictEqual(matrix.month, MONTH);
  assert.strictEqual(matrix.dayColumns.length, 31, 'Martda 31 kun');
  assert.strictEqual(matrix.dayColumns[0].day, 1);
  assert.strictEqual(matrix.dayColumns[30].day, 31);

  const rows = ExcelService.parseMatrixRows(sheet, matrix);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].employeeName, 'Alisher Karimov');
  assert.strictEqual(rows[0].employeeNo, '1001');
  assert.strictEqual(rows[0].cells[2].code, 'I', '2-kun "Ishda" bo\'lishi kerak');
});

test('shablon: kun katagida dropdown (data validation) bor', async () => {
  const buffer = await exportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Tabel');
  const matrix = ExcelService.detectMatrix(sheet);
  const cell = sheet.getRow(matrix.headerRow + 1).getCell(matrix.dayColumns[0].col);
  assert.ok(cell.dataValidation, 'data validation topilmadi');
  assert.strictEqual(cell.dataValidation.type, 'list');
  assert.ok(cell.dataValidation.formulae[0].includes('I,K,T,B,D,X'));
});

test("import: o'zgartirilgan katak bazaga qo'llanadi", async () => {
  // 1) Shablonni yuklab olamiz
  const buffer = await exportTemplate();

  // 2) 2-kunni "Kelmagan" (X) qilib o'zgartiramiz
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Tabel');
  const matrix = ExcelService.detectMatrix(sheet);
  const col = matrix.dayColumns.find((d) => d.day === 2).col;
  sheet.getRow(matrix.headerRow + 1).getCell(col).value = 'X';
  const out = await wb.xlsx.writeBuffer();

  // 3) Import
  const parsed = await ExcelService.parseWorkbook(Buffer.from(out));
  assert.strictEqual(parsed.format, 'matrix');

  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Test import',
    userId: null,
  });

  assert.strictEqual(report.applied, 1, "bitta kun qo'llanishi kerak");
  assert.strictEqual(report.errors.length, 0);

  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: DATE },
  });
  assert.strictEqual(daily.status, 'absent');
  assert.strictEqual(daily.workedMinutes, 0);
  assert.strictEqual(daily.isManualAdjusted, true);
});

test('import: manual_adjustments va audit_log yoziladi', async () => {
  const adj = await models.ManualAdjustment.findOne({
    where: { employeeId: employee.id, date: DATE },
  });
  assert.ok(adj, 'manual_adjustments yozuvi topilmadi');
  assert.strictEqual(adj.reason, 'Test import');
  assert.ok(adj.oldValue, 'eski qiymat saqlanishi kerak');
  assert.strictEqual(adj.oldValue.status, 'present');
  assert.strictEqual(adj.newValue.status, 'absent');

  const auditRows = await models.AuditLog.findAll({
    where: { action: 'attendance.import_excel_day' },
  });
  assert.ok(auditRows.length >= 1, 'audit_log yozuvi topilmadi');
});

test("import: o'zgarmagan fayl hech narsani o'zgartirmaydi (idempotent)", async () => {
  const buffer = await exportTemplate();
  const parsed = await ExcelService.parseWorkbook(buffer);
  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Test import',
    userId: null,
  });

  assert.strictEqual(report.applied, 0, "o'zgarish bo'lmasligi kerak");
  assert.strictEqual(report.unchanged, 1);

  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: DATE },
  });
  assert.strictEqual(daily.status, 'absent', 'avvalgi qiymat saqlanishi kerak');
});

test("import: o'zgarmagan fayl vaqtlarni buzmaydi (faqat holat)", async () => {
  // 2026-03-04: haqiqiy kelish/ketish vaqti bilan "Ishda" qatori
  await models.DailyAttendance.create({
    employeeId: employee.id,
    date: '2026-03-04',
    shiftId: shift.id,
    firstIn: new Date('2026-03-04T08:07:00+05:00'),
    lastOut: new Date('2026-03-04T17:12:00+05:00'),
    workedMinutes: 425,
    lateMinutes: 7,
    earlyLeaveMinutes: 0,
    status: 'present',
  });

  const buffer = await exportTemplate();
  const parsed = await ExcelService.parseWorkbook(buffer);
  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Test import',
    userId: null,
  });

  assert.strictEqual(report.applied, 0, "hech narsa o'zgarmasligi kerak");

  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: '2026-03-04' },
  });
  assert.strictEqual(daily.status, 'present');
  assert.strictEqual(daily.workedMinutes, 425, 'ish vaqti saqlanishi kerak');
  assert.strictEqual(daily.lateMinutes, 7, 'kechikish saqlanishi kerak');
  assert.strictEqual(
    new Date(daily.firstIn).toISOString(),
    new Date('2026-03-04T08:07:00+05:00').toISOString(),
    'kelish vaqti saqlanishi kerak'
  );
  assert.strictEqual(
    new Date(daily.lastOut).toISOString(),
    new Date('2026-03-04T17:12:00+05:00').toISOString(),
    'ketish vaqti saqlanishi kerak'
  );
});

test("import: faqat o'zgartirilgan katak qo'llanadi", async () => {
  const buffer = await exportTemplate();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Tabel');
  const matrix = ExcelService.detectMatrix(sheet);
  const col = matrix.dayColumns.find((d) => d.day === 4).col;
  sheet.getRow(matrix.headerRow + 1).getCell(col).value = 'T'; // ta'til
  const out = await wb.xlsx.writeBuffer();

  const parsed = await ExcelService.parseWorkbook(Buffer.from(out));
  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Test import',
    userId: null,
  });

  assert.strictEqual(report.applied, 1, "faqat bitta kun o'zgarmishi kerak");

  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: '2026-03-04' },
  });
  assert.strictEqual(daily.status, 'leave');
  assert.strictEqual(daily.workedMinutes, 0);
  assert.strictEqual(daily.isManualAdjusted, true);
});

test('import: kunlik format (Sana/Xodim) ham qabul qilinadi', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Tabel');
  sheet.addRow([
    '№',
    'Sana',
    'Xodim',
    'Tabel №',
    'Kelish',
    'Ketish',
    'Ish vaqti (soat)',
    'Kechikish (daq)',
    'Holat',
  ]);
  sheet.addRow(['1', '2026-03-03', 'Alisher Karimov', '1001', '08:00', '17:00', 8, 0, 'Ishda']);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const parsed = await ExcelService.parseWorkbook(buffer);
  assert.strictEqual(parsed.format, 'daily');
  assert.strictEqual(parsed.rows.length, 1);
  assert.strictEqual(parsed.rows[0].date, '2026-03-03');
  assert.strictEqual(parsed.rows[0].firstIn, '08:00');
  assert.strictEqual(parsed.rows[0].lastOut, '17:00');
  assert.strictEqual(parsed.rows[0].workedMinutes, 480);
  assert.strictEqual(parsed.rows[0].status, 'I');

  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Kunlik import',
    userId: null,
  });
  assert.strictEqual(report.applied, 1);

  const daily = await models.DailyAttendance.findOne({
    where: { employeeId: employee.id, date: '2026-03-03' },
  });
  assert.strictEqual(daily.status, 'present');
  assert.strictEqual(daily.workedMinutes, 480);
});

test("import: noma'lum fayl formati xato qaytaradi", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow(['bu', 'junk', "ma'lumot"]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const parsed = await ExcelService.parseWorkbook(buffer);
  assert.strictEqual(parsed.format, null);
  assert.ok(parsed.errors.length > 0);
});

test("import: noma'lum xodim xato sifatida qaytariladi", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Tabel');
  sheet.addRow(['№', 'Xodim', 'Tabel №', "Bo'lim", '01', '02']);
  sheet.addRow([1, "Noma'lum Xodim", '9999', 'Test', 'I', 'X']);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const parsed = await ExcelService.parseWorkbook(buffer);
  const report = await ExcelService.applyImport(parsed.rows, {
    year: YEAR,
    month: MONTH,
    reason: 'Test',
    userId: null,
  });

  assert.strictEqual(report.applied, 0);
  assert.ok(report.errors.length > 0);
  assert.match(report.errors[0].message, /Xodim topilmadi/);
});
