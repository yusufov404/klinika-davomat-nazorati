'use strict';
/** Test ma'lumotlarini yaratish (dev-server uchun) */
const base = 'http://127.0.0.1:3000';

(async () => {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
  }).then((r) => r.json());
  const h = {
    Authorization: 'Bearer ' + login.data.accessToken,
    'Content-Type': 'application/json',
  };

  const post = async (path, body) => {
    const r = await fetch(base + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.success && r.status !== 409) console.log('XATO', path, JSON.stringify(j.error));
    return j.data;
  };

  // Bo'lim va lavozimlar — mavjud bo'lsa qayta ishlatiladi (idempotent)
  const findOrPost = async (path, name) => {
    const list = await fetch(base + path + '?limit=200', { headers: h }).then((r) => r.json());
    const found = (list.data || []).find((x) => x.name === name);
    return found || post(path, { name });
  };

  const dep = await findOrPost('/api/departments', "Terapiya bo'limi");
  const dep2 = await findOrPost('/api/departments', 'Laboratoriya');
  const pos = await findOrPost('/api/positions', 'Shifokor');
  const pos2 = await findOrPost('/api/positions', 'Mediya hamshira');

  const emps = [
    {
      fullName: 'Alisher Karimov',
      employeeNo: '1001',
      departmentId: dep.id,
      positionId: pos.id,
      hireDate: '2024-03-01',
      terminalUserId: '1001',
      isActive: true,
    },
    {
      fullName: 'Nilufar Tosheva',
      employeeNo: '1002',
      departmentId: dep.id,
      positionId: pos2.id,
      hireDate: '2023-09-15',
      terminalUserId: '1002',
      isActive: true,
    },
    {
      fullName: 'Bekzod Rahimov',
      employeeNo: '1003',
      departmentId: dep2.id,
      positionId: pos2.id,
      hireDate: '2025-01-10',
      terminalUserId: '1003',
      isActive: true,
    },
    {
      fullName: 'Dilnoza Yusupova',
      employeeNo: '1004',
      departmentId: dep2.id,
      positionId: pos.id,
      hireDate: '2022-05-02',
      terminalUserId: '1004',
      isActive: true,
    },
  ];
  for (const e of emps) await post('/api/employees', e);

  // Xodim uchun "Menim panel" hisobi (self-service demo)
  // terminalUserId = login -> employeeNo
  const roles = await fetch(base + '/api/roles', { headers: h }).then((r) => r.json());
  const staffRole = (roles.data.roles || []).find((r) => r.name === 'staff');
  const existingUser = await fetch(base + '/api/users?limit=200', { headers: h }).then((r) =>
    r.json()
  );
  if (!(existingUser.data || []).some((u) => u.username === '1001')) {
    await post('/api/users', {
      username: '1001',
      password: 'Xodim@12345',
      fullName: 'Alisher Karimov',
      roleId: staffRole ? staffRole.id : undefined,
      isActive: true,
    });
  }

  const shifts = await fetch(base + '/api/shifts?limit=10', { headers: h }).then((r) => r.json());
  const shift = shifts.data[0];

  const employees = await fetch(base + '/api/employees?limit=50', { headers: h }).then((r) =>
    r.json()
  );
  const existingSchedules = await fetch(base + '/api/schedules?limit=300', { headers: h }).then(
    (r) => r.json()
  );

  for (const emp of employees.data) {
    // Takroriy grafik yaratmaslik uchun tekshiramiz
    const already = (existingSchedules.data || []).find(
      (s) => s.employeeId === emp.id && s.shiftId === shift.id
    );
    if (already) continue;
    await post('/api/schedules', {
      employeeId: emp.id,
      shiftId: shift.id,
      validFrom: '2026-01-01',
      weekdays: [1, 2, 3, 4, 5],
    });
  }

  await post('/api/holidays', { date: '2026-01-01', name: 'Yangi yil', isWorking: false });
  await post('/api/holidays', { date: '2026-03-08', name: 'Xotin-qizlar kuni', isWorking: false });

  const leaveTypes = await fetch(base + '/api/leave-types?limit=10', { headers: h }).then((r) =>
    r.json()
  );

  // Ta'til balanslari (joriy yil, 14 ish kuni)
  await post('/api/balances/seed-year', {
    year: new Date().getFullYear(),
    defaultDays: 14,
    leaveTypeIds: [(leaveTypes.data[0] || {}).id].filter(Boolean),
  });

  await post('/api/leaves', {
    employeeId: employees.data[1].id,
    leaveTypeId: leaveTypes.data[0].id,
    startDate: '2026-03-10',
    endDate: '2026-03-12',
    comment: 'Kasallik',
  });

  // Terminal (real emas - test IP)
  await post('/api/terminals', {
    name: 'Asosiy kirish',
    ipAddress: '192.168.50.11',
    port: 80,
    username: 'admin',
    password: 'Test12345',
    direction: 'both',
    location: '1-qavat registratura',
    serialNumber: 'TERM-001',
  });
  await post('/api/terminals', {
    name: 'Tungi kirish',
    ipAddress: '192.168.50.12',
    port: 80,
    username: 'admin',
    password: 'Test12345',
    direction: 'both',
    location: 'Navbatchilik xona',
    serialNumber: 'TERM-002',
  });

  // Davomat eventlari (simulyatsiya)
  const today = new Date();
  const iso = (d, h, m) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:00`;

  let counter = 1000;
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    if (dow > 5) continue;
    for (const emp of employees.data) {
      if (i === 2 && emp.employeeNo === '1003') continue; // kelmagan
      const late = emp.employeeNo === '1002' ? 18 : 3;
      const inH = 8 + (late >= 60 ? 1 : 0);
      const inM = late >= 60 ? late - 60 : late;
      await fetch(base + '/api/hikvision/events?token=dev-terminal-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          majorEventType: 5,
          subEventType: 75,
          AccessControllerEvent: {
            employeeNoString: emp.terminalUserId,
            name: emp.fullName,
            dateTime: iso(d, inH, inM),
            serialNo: `SN-${counter++}`,
            currentVerifyMode: 'face',
            terminalSerialNo: 'TERM-001',
          },
        }),
      });
      await fetch(base + '/api/hikvision/events?token=dev-terminal-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          majorEventType: 5,
          subEventType: 75,
          AccessControllerEvent: {
            employeeNoString: emp.terminalUserId,
            name: emp.fullName,
            dateTime: iso(d, 17, 2),
            serialNo: `SN-${counter++}`,
            currentVerifyMode: 'face',
            terminalSerialNo: 'TERM-001',
          },
        }),
      });
    }
  }

  const recalc = await fetch(base + '/api/attendance/recalculate', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      dateFrom: new Date(today.getTime() - 10 * 86400000).toISOString().slice(0, 10),
      dateTo: today.toISOString().slice(0, 10),
    }),
  }).then((r) => r.json());
  console.log('Qayta hisoblandi:', recalc.data.count);

  const summary = await fetch(
    base +
      '/api/reports/summary?dateFrom=' +
      new Date(today.getTime() - 10 * 86400000).toISOString().slice(0, 10) +
      '&dateTo=' +
      today.toISOString().slice(0, 10),
    { headers: h }
  ).then((r) => r.json());
  console.log('Statistika:', JSON.stringify(summary.data));
  console.log('Tayyor!');
})();
