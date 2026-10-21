import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * Yuk testi — 100+ terminal holatida.
 *
 * Ishga tushirish:
 *   k6 run server/tests/load/attendance.js
 *
 * Ssenariy: terminallar davomat eventlarini yuboradi (push),
 * admin panel esa hisobotlarni so'raydi.
 */
const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const TOKEN = __ENV.TOKEN || 'dev-terminal-token';

const eventsSent = new Counter('attendance_events_sent');
const eventsFailed = new Counter('attendance_events_failed');
const eventDuration = new Trend('attendance_event_duration', true);
const reportDuration = new Trend('report_duration', true);

export const options = {
  scenarios: {
    terminal_push: {
      executor: 'constant-arrival-rate',
      rate: 50, // sekundiga 50 event (100 terminal × 2 kelish/ketish)
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },
    dashboard_reads: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    attendance_event_duration: ['p(95)<500'],
    report_duration: ['p(95)<1500'],
  },
};

const employees = ['1001', '1002', '1003', '1004'];

export default function () {
  // 1) Terminal event yuborish (push)
  const employeeNo = employees[Math.floor(Math.random() * employees.length)];
  const now = new Date().toISOString();
  const payload = {
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: employeeNo,
      dateTime: now,
      serialNo: `LOAD-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      currentVerifyMode: 'face',
      terminalSerialNo: 'TERM-001',
    },
  };

  const res = http.post(`${BASE}/api/hikvision/events?token=${TOKEN}`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });

  const ok = check(res, { 'event 200': (r) => r.status === 200 });
  eventDuration.add(res.timings.duration);
  if (ok) eventsSent.add(1);
  else eventsFailed.add(1);

  // 2) Admin panel hisobotlarini o'qish
  if (Math.random() < 0.1) {
    const login = http.post(
      `${BASE}/api/auth/login`,
      JSON.stringify({ username: 'admin', password: 'Admin@12345' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    const token = login.json('data.accessToken');
    if (token) {
      const report = http.get(`${BASE}/api/reports/summary?dateFrom=2026-10-01&dateTo=2026-10-31`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      reportDuration.add(report.timings.duration);
      check(report, { 'report 200': (r) => r.status === 200 });
    }
  }

  sleep(0.1);
}
