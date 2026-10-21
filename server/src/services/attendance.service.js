'use strict';

const { Op } = require('sequelize');
const config = require('../config');
const logger = require('../config/logger');
const {
  Employee,
  EmployeeSchedule,
  Shift,
  Holiday,
  Leave,
  DailyAttendance,
  AttendanceLog,
  ManualAdjustment,
  Terminal,
} = require('../models');
const T = require('../utils/time');

/**
 * ============================================================
 *  DAVOMAT HISOBLASH ALGORITMI (spec 6-bo'lim)
 * ============================================================
 */

/**
 * Smenaning real vaqt oralig'ini hisoblaydi.
 * @param {object} shift
 * @param {string} dateKey Biznes-kun (smena boshlanadigan kun)
 */
function shiftWindow(shift, dateKey) {
  const start = new Date(
    T.startOfDay(dateKey).getTime() + T.timeToMinutes(shift.startTime) * 60000
  );
  let end;
  if (shift.crossesMidnight) {
    end = new Date(
      T.startOfDay(T.addDays(dateKey, 1)).getTime() + T.timeToMinutes(shift.endTime) * 60000
    );
  } else {
    end = new Date(T.startOfDay(dateKey).getTime() + T.timeToMinutes(shift.endTime) * 60000);
    if (end <= start) end = new Date(end.getTime() + T.DAY_MS); // 00:00 dan kichik bo'lsa
  }
  return { start, end };
}

/**
 * Log uchun "ishga kirish/chiqish" oynalari (grace bilan).
 */
function attendanceWindows(shift, dateKey) {
  const { start, end } = shiftWindow(shift, dateKey);
  const before = config.attendance.windowBeforeHours * 60 * 60000;
  const after = config.attendance.windowAfterHours * 60 * 60000;
  return {
    shiftStart: start,
    shiftEnd: end,
    windowStart: new Date(start.getTime() - before),
    windowEnd: new Date(end.getTime() + after),
    // Kechikish chegarasi: smena boshi + grace
    lateDeadline: new Date(start.getTime() + (shift.graceLateMinutes || 0) * 60000),
    // Erta ketish chegarasi: smena oxiri - grace
    earlyDeadline: new Date(end.getTime() - (shift.graceEarlyMinutes || 0) * 60000),
  };
}

/**
 * Bir smena uchun loglarni tahlil qiladi (sof funksiya - testlanadi).
 *
 * @param {object} p
 * @param {object} p.shift
 * @param {string} p.dateKey
 * @param {Array}  p.logs  AttendanceLog[] (window ichidagi)
 * @returns {object}
 */
function computeShiftSegment({ shift, dateKey, logs }) {
  const w = attendanceWindows(shift, dateKey);
  const sorted = [...logs].sort((a, b) => new Date(a.logTime) - new Date(b.logTime));

  const inCandidates = [];
  const outCandidates = [];

  for (const log of sorted) {
    const dir = log.Terminal ? log.Terminal.direction : log.direction || 'both';
    if (dir === 'in') inCandidates.push(log);
    else if (dir === 'out') outCandidates.push(log);
    else {
      inCandidates.push(log);
      outCandidates.push(log);
    }
  }

  const firstInLog = inCandidates.length
    ? inCandidates.reduce((a, b) => (new Date(a.logTime) <= new Date(b.logTime) ? a : b))
    : null;
  const lastOutLog = outCandidates.length
    ? outCandidates.reduce((a, b) => (new Date(a.logTime) >= new Date(b.logTime) ? a : b))
    : null;

  const firstIn = firstInLog ? new Date(firstInLog.logTime) : null;
  const lastOut = lastOutLog ? new Date(lastOutLog.logTime) : null;

  const hasIn = Boolean(firstIn);
  const hasOut = Boolean(lastOut);

  // --- Kechikish ---
  let lateMinutes = 0;
  if (hasIn) {
    const diff = (firstIn.getTime() - w.shiftStart.getTime()) / 60000;
    if (diff > (shift.graceLateMinutes || 0)) {
      lateMinutes = config.attendance.lateCountsFullGrace
        ? Math.round(diff) // to'liq kechikish
        : Math.round(diff - (shift.graceLateMinutes || 0)); // faqat grace oshgan qismi
    }
  }

  // --- Erta ketish ---
  let earlyLeaveMinutes = 0;
  if (hasOut) {
    const diff = (w.earlyDeadline.getTime() - lastOut.getTime()) / 60000;
    if (diff > 0) earlyLeaveMinutes = Math.round(diff);
  }

  // --- Ishlagan vaqt ---
  let workedMinutes = 0;
  if (hasIn && hasOut) {
    const total = (lastOut.getTime() - firstIn.getTime()) / 60000;
    workedMinutes = Math.max(0, Math.round(total) - (shift.breakMinutes || 0));
  }

  return {
    shift,
    dateKey,
    firstIn,
    lastOut,
    lateMinutes,
    earlyLeaveMinutes,
    workedMinutes,
    hasIn,
    hasOut,
    logCount: sorted.length,
    windows: w,
  };
}

/**
 * Xodim uchun bir kunlik smenalar ro'yxatini oladi.
 * @returns {Array<{shift:object, schedule:object}>}
 */
async function getEmployeeShifts(employeeId, dateKey) {
  const weekday = T.weekday(dateKey);
  const schedules = await EmployeeSchedule.findAll({
    where: {
      employeeId,
      isActive: true,
      validFrom: { [Op.lte]: dateKey },
      [Op.or]: [{ validTo: null }, { validTo: { [Op.gte]: dateKey } }],
    },
    include: [{ model: Shift, as: 'Shift', where: { isActive: true }, required: false }],
    order: [['priority', 'ASC']],
  });

  const result = [];
  for (const sched of schedules) {
    if (!sched.Shift) continue;
    const weekdays = Array.isArray(sched.weekdays) ? sched.weekdays.map(Number) : [];
    if (weekdays.length && !weekdays.includes(weekday)) continue;
    result.push({ shift: sched.Shift, schedule: sched });
  }
  return result;
}

/**
 * Loglarni smenalar bo'yicha taqsimlash.
 * Agar log bir nechta oynaga tushsa - eng yaqin smena boshlanishiga ega bo'lganga biriktiriladi.
 */
function assignLogsToShifts(segments, logs) {
  const buckets = segments.map(() => []);
  for (const log of logs) {
    const t = new Date(log.logTime).getTime();
    let bestIdx = -1;
    let bestDist = Infinity;
    segments.forEach((seg, i) => {
      const w = seg.windows;
      if (t >= w.windowStart.getTime() && t <= w.windowEnd.getTime()) {
        const dist = Math.abs(t - w.shiftStart.getTime());
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    });
    if (bestIdx >= 0) buckets[bestIdx].push(log);
  }
  return buckets;
}

/**
 * Xodim uchun kunlik natijani hisoblaydi (DB bilan).
 *
 * @param {number} employeeId
 * @param {string} dateKey 'YYYY-MM-DD'
 * @param {object} [opts] { persist: boolean, logs, segments }
 * @returns {object|null}
 */
async function calculateEmployeeDay(employeeId, dateKey, opts = {}) {
  const persist = opts.persist !== false;

  const employee = await Employee.findByPk(employeeId);
  if (!employee) return null;

  const holiday = await Holiday.findOne({ where: { date: dateKey } });
  const leave = await Leave.findOne({
    where: {
      employeeId,
      status: 'approved',
      startDate: { [Op.lte]: dateKey },
      endDate: { [Op.gte]: dateKey },
    },
  });

  const shiftPairs = await getEmployeeShifts(employeeId, dateKey);

  // Xuddi bir smena bir necha marta biriktirilgan bo'lsa (takroriy grafik) —
  // bitta segmentga birlashtiramiz, aks holda kun "incomplete" bo'lib qoladi
  const uniqueShifts = [];
  const seenShiftIds = new Set();
  for (const pair of shiftPairs) {
    if (seenShiftIds.has(pair.shift.id)) continue;
    seenShiftIds.add(pair.shift.id);
    uniqueShifts.push(pair);
  }
  const shiftList = uniqueShifts;

  // --- Holatlar: ta'til / bayram / dam kuni ---
  if (leave) {
    return persistResult(
      {
        employeeId,
        date: dateKey,
        shiftId: shiftList.length ? shiftList[0].shift.id : null,
        firstIn: null,
        lastOut: null,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        breakMinutes: 0,
        status: 'leave',
        isManualAdjusted: false,
        note: `Ta'til: ${leave.LeaveType ? leave.LeaveType.name : ''}`.trim(),
      },
      persist,
      dateKey
    );
  }

  if (!shiftList.length) {
    const status = holiday ? 'holiday' : 'day_off';
    return persistResult(
      {
        employeeId,
        date: dateKey,
        shiftId: null,
        firstIn: null,
        lastOut: null,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        breakMinutes: 0,
        status,
        isManualAdjusted: false,
        note: holiday ? holiday.name : 'Smena biriktirilmagan',
      },
      persist,
      dateKey
    );
  }

  if (holiday && !holiday.isWorking) {
    return persistResult(
      {
        employeeId,
        date: dateKey,
        shiftId: shiftList[0].shift.id,
        firstIn: null,
        lastOut: null,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        breakMinutes: 0,
        status: 'holiday',
        isManualAdjusted: false,
        note: holiday.name,
      },
      persist,
      dateKey
    );
  }

  // --- Loglarni yig'ish ---
  const segments = shiftList.map((p) => {
    const w = attendanceWindows(p.shift, dateKey);
    return { shift: p.shift, schedule: p.schedule, windows: w };
  });

  const rangeStart = new Date(Math.min(...segments.map((s) => s.windows.windowStart.getTime())));
  const rangeEnd = new Date(Math.max(...segments.map((s) => s.windows.windowEnd.getTime())));

  const logs = await AttendanceLog.findAll({
    where: {
      employeeId,
      logTime: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd },
    },
    include: [{ model: Terminal, as: 'Terminal', required: false }],
    order: [['logTime', 'ASC']],
  });

  const buckets = assignLogsToShifts(segments, logs);
  const computed = segments.map((seg, i) =>
    computeShiftSegment({ shift: seg.shift, dateKey, logs: buckets[i] })
  );

  // --- Jamlash ---
  const totalLogs = computed.reduce((s, c) => s + c.logCount, 0);
  const firstIns = computed.filter((c) => c.hasIn).map((c) => c.firstIn);
  const lastOuts = computed.filter((c) => c.hasOut).map((c) => c.lastOut);

  const firstIn = firstIns.length ? new Date(Math.min(...firstIns.map((d) => d.getTime()))) : null;
  const lastOut = lastOuts.length ? new Date(Math.max(...lastOuts.map((d) => d.getTime()))) : null;

  const workedMinutes = computed.reduce((s, c) => s + c.workedMinutes, 0);
  const lateMinutes = computed.reduce((s, c) => s + c.lateMinutes, 0);
  const earlyLeaveMinutes = computed.reduce((s, c) => s + c.earlyLeaveMinutes, 0);
  const breakMinutes = computed.reduce((s, c) => s + (c.shift.breakMinutes || 0), 0);

  const missingSegments = computed.filter((c) => c.logCount === 0);
  const notes = [];
  if (missingSegments.length) {
    notes.push(`Log yo'q smena: ${missingSegments.map((c) => c.shift.name).join(', ')}`);
  }
  for (const c of computed) {
    if (c.shift.minWorkMinutes && c.hasIn && c.hasOut && c.workedMinutes < c.shift.minWorkMinutes) {
      notes.push(`${c.shift.name}: minimal ish vaqti bajarilmagan`);
    }
  }

  let status;
  if (totalLogs === 0) {
    status = 'absent';
  } else if (!firstIn || !lastOut || missingSegments.length) {
    status = 'incomplete';
  } else if (lateMinutes > 0) {
    status = 'late';
  } else {
    status = 'present';
  }

  return persistResult(
    {
      employeeId,
      date: dateKey,
      shiftId: shiftList[0].shift.id,
      firstIn,
      lastOut,
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      breakMinutes,
      status,
      isManualAdjusted: false,
      note: notes.length ? notes.join('; ').slice(0, 250) : null,
    },
    persist,
    dateKey
  );
}

/**
 * Natijani bazaga yozadi. Qo'lda tuzatilgan kunlar ustidan yozilmaydi.
 */
async function persistResult(data, persist, _dateKey) {
  if (!persist) return data;

  const existing = await DailyAttendance.findOne({
    where: { employeeId: data.employeeId, date: data.dateKey || data.date },
  });

  if (existing && existing.isManualAdjusted) {
    // Qo'lda tuzatilgan kun - qayta hisoblamaslik
    return existing;
  }

  const manual = await ManualAdjustment.findOne({
    where: { employeeId: data.employeeId, date: data.date },
  });
  if (manual) {
    return existing || data;
  }

  const [row] = await DailyAttendance.upsert(data, {
    where: { employeeId: data.employeeId, date: data.date },
  });
  return row;
}

/**
 * Sana oralig'ini barcha xodimlar uchun qayta hisoblaydi.
 * @param {string} fromDate
 * @param {string} toDate
 * @param {object} [opts] { employeeId }
 */
async function recalculateRange(fromDate, toDate, opts = {}) {
  const where = { isActive: true };
  if (opts.employeeId) where.id = opts.employeeId;
  const employees = await Employee.findAll({ where, attributes: ['id'] });

  let count = 0;
  for (const emp of employees) {
    let date = fromDate;
    while (date <= toDate) {
      try {
        await calculateEmployeeDay(emp.id, date);
        count += 1;
      } catch (err) {
        logger.error(`Hisoblash xatosi (employee=${emp.id}, date=${date}):`, err.message);
      }
      date = T.addDays(date, 1);
    }
  }
  logger.info(`Davomat qayta hisoblandi: ${fromDate}..${toDate} (${count} kunlik yozuv)`);
  return count;
}

module.exports = {
  shiftWindow,
  attendanceWindows,
  computeShiftSegment,
  getEmployeeShifts,
  assignLogsToShifts,
  calculateEmployeeDay,
  recalculateRange,
};
