'use strict';

/**
 * Smoke test: ilova moduli yuklanishi va marshrutlar ishlashi.
 * (Bazaga ulanish talab qilinmaydi)
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_at_least_32_chars_long';
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.TERMINAL_EVENT_TOKEN = 'test_token';

const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => {
    server.once('listening', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  if (server) server.close();
});

test('app moduli yuklanadi', () => {
  assert.ok(app);
  assert.strictEqual(typeof app.listen, 'function');
});

test('asosiy marshrutlar mavjud (404 bermasligi kerak)', async () => {
  const checks = [
    { method: 'GET', path: '/api/health', expect: [200, 503] },
    { method: 'POST', path: '/api/auth/login', body: {}, expect: [400] },
    { method: 'GET', path: '/api/employees', expect: [401] },
    { method: 'GET', path: '/api/terminals', expect: [401] },
    { method: 'GET', path: '/api/attendance/logs', expect: [401] },
    { method: 'GET', path: '/api/attendance/daily', expect: [401] },
    { method: 'GET', path: '/api/leaves', expect: [401] },
    { method: 'GET', path: '/api/reports/summary', expect: [401] },
    { method: 'GET', path: '/api/departments', expect: [401] },
    { method: 'GET', path: '/api/shifts', expect: [401] },
    { method: 'GET', path: '/api/schedules', expect: [401] },
    { method: 'GET', path: '/api/holidays', expect: [401] },
    { method: 'GET', path: '/api/leave-types', expect: [401] },
    { method: 'GET', path: '/api/users', expect: [401] },
    { method: 'GET', path: '/api/audit', expect: [401] },
    { method: 'POST', path: '/api/hikvision/events', body: {}, expect: [200, 403] },
  ];

  for (const c of checks) {
    const res = await fetch(`${baseUrl}${c.path}`, {
      method: c.method,
      headers: { 'Content-Type': 'application/json' },
      body: c.body ? JSON.stringify(c.body) : undefined,
    });
    assert.ok(
      c.expect.includes(res.status),
      `${c.method} ${c.path} -> ${res.status} ( kutilgan: ${c.expect.join('/')})`
    );
  }
});

test("noma'lum marshrut 404 beradi", async () => {
  const res = await fetch(`${baseUrl}/api/yoq-bunday-endpoint`);
  assert.strictEqual(res.status, 404);
});

test("terminal event endpoint token'siz rad etiladi", async () => {
  const res = await fetch(`${baseUrl}/api/hikvision/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorEventType: 5, subEventType: 75 }),
  });
  assert.strictEqual(res.status, 403);
});

test("terminal event endpoint to'g'ri token bilan qabul qilinadi", async () => {
  const res = await fetch(`${baseUrl}/api/hikvision/events?token=test_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ majorEventType: 5, subEventType: 75, employeeNoString: '1' }),
  });
  // Token o'tdi, event bazaga yoziladi (baza yo'q bo'lsa 500 bo'lishi mumkin)
  assert.ok([200, 500].includes(res.status));
  if (res.status === 200) {
    const body = await res.json();
    assert.strictEqual(body.success, true);
  }
});

test('RBAC: rol huquqlari', () => {
  const { can, ROLE_NAMES, PERMISSIONS } = require('../src/config/rbac');
  assert.deepStrictEqual(ROLE_NAMES.sort(), [
    'accountant',
    'adminka',
    'director',
    'glavniy_vrach',
    'hr_head',
    'staff',
    'superadmin',
  ]);

  const p = (role) => PERMISSIONS[role];

  assert.strictEqual(can(p('superadmin'), 'anything:here'), true);
  assert.strictEqual(can(p('adminka'), 'anything:here'), true);

  // Xodim — faqat o'z paneli
  assert.strictEqual(can(p('staff'), 'employees:read'), false);
  assert.strictEqual(can(p('staff'), 'attendance:read'), false);
  assert.strictEqual(can(p('staff'), 'reports:read'), false);
  assert.strictEqual(can(p('staff'), 'users:read'), false);

  // Glavniy vrach — ko'rish + tasdiqlash
  assert.strictEqual(can(p('glavniy_vrach'), 'reports:read'), true);
  assert.strictEqual(can(p('glavniy_vrach'), 'leaves:approve'), true);
  assert.strictEqual(can(p('glavniy_vrach'), 'timesheets:approve'), true);
  assert.strictEqual(can(p('glavniy_vrach'), 'attendance:read'), true);
  assert.strictEqual(can(p('glavniy_vrach'), 'attendance:adjust'), false);
  assert.strictEqual(can(p('glavniy_vrach'), 'employees:write'), false);
  assert.strictEqual(can(p('glavniy_vrach'), 'terminals:write'), false);
  assert.strictEqual(can(p('glavniy_vrach'), 'users:write'), false);

  // HR — xodimlar, terminallar, grafik boshqaruvi
  assert.strictEqual(can(p('hr_head'), 'employees:write'), true);
  assert.strictEqual(can(p('hr_head'), 'terminals:write'), true);
  assert.strictEqual(can(p('hr_head'), 'terminals:sync'), true);
  assert.strictEqual(can(p('hr_head'), 'schedules:write'), true);
  assert.strictEqual(can(p('hr_head'), 'shifts:write'), true);
  assert.strictEqual(can(p('hr_head'), 'attendance:write'), true);
  assert.strictEqual(can(p('hr_head'), 'users:write'), false);

  // Hisobchi — faqat ko'rish
  assert.strictEqual(can(p('accountant'), 'attendance:read'), true);
  assert.strictEqual(can(p('accountant'), 'attendance:adjust'), false);
  assert.strictEqual(can(p('accountant'), 'employees:write'), false);
});

test("RBAC: bazadagi sozlamalar dasturiy standartni o'zgartiradi", () => {
  const { resolvePermissions } = require('../src/config/rbac');

  // qator yo'q -> dasturiy standart
  assert.deepStrictEqual(
    resolvePermissions('glavniy_vrach', []),
    resolvePermissions('glavniy_vrach')
  );

  // yoqish
  const added = resolvePermissions('glavniy_vrach', [
    { permission: 'attendance:adjust', enabled: true },
  ]);
  assert.ok(added.includes('attendance:adjust'));

  // o'chirish
  const removed = resolvePermissions('glavniy_vrach', [
    { permission: 'leaves:approve', enabled: false },
  ]);
  assert.ok(!removed.includes('leaves:approve'));
  assert.ok(removed.includes('reports:read'));
});

test('shifrlash: terminal parolini gizlash va ochish', () => {
  const { encrypt, decrypt } = require('../src/utils/crypto');
  const enc = encrypt('SuperSecret123');
  assert.notStrictEqual(enc, 'SuperSecret123');
  assert.strictEqual(decrypt(enc), 'SuperSecret123');
  assert.strictEqual(decrypt('buzilgan:qiymat'), null);
});

test('login validatsiyasi', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '', password: '' }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.error.code, 'validation_error');
});
