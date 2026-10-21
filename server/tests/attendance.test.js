'use strict';

/**
 * Davomat hisoblash algoritmining unit testlari (sof funksiyalar).
 * Ishga tushirish: npm test
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.TZ = 'Asia/Tashkent';

const {
  shiftWindow,
  attendanceWindows,
  computeShiftSegment,
  assignLogsToShifts,
} = require('../src/services/attendance.service');
const T = require('../src/utils/time');

const shift = (over = {}) => ({
  id: 1,
  name: 'Kunduzgi',
  startTime: '08:00',
  endTime: '17:00',
  crossesMidnight: false,
  graceLateMinutes: 10,
  graceEarlyMinutes: 10,
  breakMinutes: 0,
  ...over,
});

const log = (time, direction = 'both') => ({
  id: Math.random(),
  logTime: new Date(time),
  direction,
  Terminal: { direction },
});

const at = (date, h, m) =>
  new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:00`);

test('shiftWindow: kunduzgi smena 08:00-17:00', () => {
  const w = shiftWindow(shift(), '2026-01-05');
  assert.strictEqual(T.dateKey(w.start), '2026-01-05');
  assert.strictEqual(T.dateKey(w.end), '2026-01-05');
  assert.strictEqual(T.toMinutesInTz(w.start), 8 * 60);
  assert.strictEqual(T.toMinutesInTz(w.end), 17 * 60);
});

test("shiftWindow: tungi smena kesib o'tadi (20:00 -> 08:00 keyingi kun)", () => {
  const w = shiftWindow(
    shift({ startTime: '20:00', endTime: '08:00', crossesMidnight: true }),
    '2026-01-05'
  );
  assert.strictEqual(T.dateKey(w.start), '2026-01-05');
  assert.strictEqual(T.dateKey(w.end), '2026-01-06');
  assert.strictEqual(T.toMinutesInTz(w.start), 20 * 60);
  assert.strictEqual(T.toMinutesInTz(w.end), 8 * 60);
});

test('attendanceWindows: oyna smena boshidan 3 soat oldin, oxiridan 3 soat keyin', () => {
  const w = attendanceWindows(shift(), '2026-01-05');
  assert.strictEqual(T.toMinutesInTz(w.windowStart), 5 * 60);
  assert.strictEqual(T.toMinutesInTz(w.windowEnd), 20 * 60);
});

test("computeShiftSegment: o'z vaqtida kelgan - kechikish yo'q", () => {
  const s = shift();
  const seg = computeShiftSegment({
    shift: s,
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0)), log(at('2026-01-05', 17, 0))],
  });
  assert.strictEqual(seg.lateMinutes, 0);
  assert.strictEqual(seg.earlyLeaveMinutes, 0);
  assert.strictEqual(seg.workedMinutes, 9 * 60);
  assert.strictEqual(seg.hasIn, true);
  assert.strictEqual(seg.hasOut, true);
});

test('computeShiftSegment: grace ichida kelgan - kechikish 0', () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 5)), log(at('2026-01-05', 17, 0))],
  });
  assert.strictEqual(seg.lateMinutes, 0);
});

test("computeShiftSegment: grace oshgan - kechikish hisoblanadi (to'liq)", () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 25)), log(at('2026-01-05', 17, 0))],
  });
  // 08:00 dan 25 daqiqa kechikdi
  assert.strictEqual(seg.lateMinutes, 25);
});

test('computeShiftSegment: erta ketish', () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0)), log(at('2026-01-05', 16, 0))],
  });
  // 17:00 - 10 daqiqa grace = 16:50, 16:00 da ketgan => 50 daqiqa
  assert.strictEqual(seg.earlyLeaveMinutes, 50);
});

test('computeShiftSegment: tanaffus hisobga olinadi', () => {
  const seg = computeShiftSegment({
    shift: shift({ breakMinutes: 60 }),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0)), log(at('2026-01-05', 17, 0))],
  });
  assert.strictEqual(seg.workedMinutes, 9 * 60 - 60);
});

test("computeShiftSegment: bitta log - chiqish yo'q (incomplete)", () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0))],
  });
  assert.strictEqual(seg.hasIn, true);
  assert.strictEqual(
    seg.hasOut,
    true,
    '"both" terminalda bitta log ham kirish ham chiqish hisoblanadi'
  );
  assert.strictEqual(seg.logCount, 1);
});

test('computeShiftSegment: "in" terminali - chiqish logi berilmaydi', () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0), 'in'), log(at('2026-01-05', 12, 0), 'in')],
  });
  assert.strictEqual(seg.hasIn, true);
  assert.strictEqual(seg.hasOut, false, '"in" terminal loglari chiqish sifatida hisoblanmaydi');
  assert.strictEqual(seg.workedMinutes, 0, "chiqish bo'lmasa ish vaqti 0");
});

test('computeShiftSegment: "out" terminalidan kelgan loglar chiqish hisoblanadi', () => {
  const seg = computeShiftSegment({
    shift: shift(),
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 17, 0), 'out')],
  });
  assert.strictEqual(seg.hasIn, false);
  assert.strictEqual(seg.hasOut, true);
});

test('assignLogsToShifts: log eng yaqin smenaga biriktiriladi', () => {
  const s1 = shift({ id: 1, startTime: '08:00', endTime: '17:00' });
  const s2 = shift({ id: 2, startTime: '20:00', endTime: '08:00', crossesMidnight: true });
  const dateKey = '2026-01-05';

  const segments = [s1, s2].map((s) => {
    const w = attendanceWindows(s, dateKey);
    return { shift: s, windows: w };
  });

  const logs = [
    log(at('2026-01-05', 8, 0)),
    log(at('2026-01-05', 20, 0)),
    log(at('2026-01-06', 7, 0)), // tungi smena oxiriga yaqin
  ];

  const buckets = assignLogsToShifts(segments, logs);
  assert.strictEqual(buckets[0].length, 1, '08:00 dagi log kunduzgi smenaga');
  assert.strictEqual(buckets[1].length, 2, '20:00 va 07:00 dagi loglar tungi smenaga');
});

test('24 soatlik navbatchilik: bitta log ham kirish ham chiqish', () => {
  const s = shift({
    startTime: '08:00',
    endTime: '08:00',
    crossesMidnight: true,
    breakMinutes: 60,
  });
  const seg = computeShiftSegment({
    shift: s,
    dateKey: '2026-01-05',
    logs: [log(at('2026-01-05', 8, 0)), log(at('2026-01-06', 7, 0))],
  });
  assert.strictEqual(seg.workedMinutes, 23 * 60 - 60);
  assert.strictEqual(seg.lateMinutes, 0);
});

test("Yil o'tishi: 31-dekabr tungi smena 1-yanvarga cho'ziladi", () => {
  const s = shift({ startTime: '20:00', endTime: '08:00', crossesMidnight: true });
  const w = shiftWindow(s, '2026-12-31');
  assert.strictEqual(T.dateKey(w.start), '2026-12-31');
  assert.strictEqual(T.dateKey(w.end), '2027-01-01');
});
