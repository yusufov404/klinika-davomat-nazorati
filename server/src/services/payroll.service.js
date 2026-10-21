'use strict';

const { Op } = require('sequelize');
const { Employee, Department, Position, DailyAttendance, OvertimeRecord } = require('../models');
const T = require('../utils/time');

/**
 * Payroll (hisob-chek) eksporti — hisobchining dasturi uchun tayyor jadval.
 * Har bir xodim uchun: ish kunlari, soatlar, kechikish, absent, ta'til,
 * overtime (premium bilan) va yakuniy to'lanadigan summa.
 */
class PayrollService {
  /** Standart koeffitsiyentlar (so'm) */
  static DEFAULTS = {
    baseRate: 0, // soatlik ish haqi — klinikaga qarab o'rnatiladi
    overtimeRate: 0,
    latePenaltyPerMinute: 0,
    absenceDeductionPerDay: 0,
    leavePaid: true,
  };

  /**
   * Oylik payroll jadvali.
   * @param {object} opts { year, month, rates }
   */
  static async monthly({ year, month, rates = {}, departmentId = null }) {
    const config = { ...PayrollService.DEFAULTS, ...rates };

    const from = T.monthDates(year, month)[0];
    const to = T.monthDates(year, month).slice(-1)[0];

    const employees = await Employee.findAll({
      where: departmentId ? { departmentId, isActive: true } : { isActive: true },
      include: [
        { model: Department, as: 'Department', required: false },
        { model: Position, as: 'Position', required: false },
      ],
      order: [['fullName', 'ASC']],
    });

    const rows = [];

    for (const emp of employees) {
      const daily = await DailyAttendance.findAll({
        where: { employeeId: emp.id, date: { [Op.between]: [from, to] } },
      });

      const workedMinutes = daily.reduce((s, d) => s + (d.workedMinutes || 0), 0);
      const lateMinutes = daily.reduce((s, d) => s + (d.lateMinutes || 0), 0);
      const earlyLeaveMinutes = daily.reduce((s, d) => s + (d.earlyLeaveMinutes || 0), 0);
      const presentDays = daily.filter((d) => ['present', 'late'].includes(d.status)).length;
      const absentDays = daily.filter((d) => d.status === 'absent').length;
      const leaveDays = daily.filter((d) => d.status === 'leave').length;
      const dayOffDays = daily.filter((d) => d.status === 'day_off').length;
      const holidayDays = daily.filter((d) => d.status === 'holiday').length;

      const overtime = await OvertimeRecord.findAll({
        where: { employeeId: emp.id, date: { [Op.between]: [from, to] } },
      });
      const overtimeMinutes = overtime.reduce((s, o) => s + o.minutes, 0);
      const overtimePaidMinutes = overtime.reduce(
        (s, o) => s + Math.round(o.minutes * o.multiplier),
        0
      );

      const workedHours = Math.round((workedMinutes / 60) * 100) / 100;
      const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
      const overtimePaidHours = Math.round((overtimePaidMinutes / 60) * 100) / 100;

      // To'lov hisobi (koeffitsiyentlar 0 bo'lsa — 0 chiqadi)
      const basePay = Math.round(workedHours * config.baseRate * 100) / 100;
      const overtimePay = Math.round(overtimePaidHours * config.overtimeRate * 100) / 100;
      const lateDeduction = Math.round((lateMinutes * config.latePenaltyPerMinute) / 100) / 100;
      const absenceDeduction = Math.round(absentDays * config.absenceDeductionPerDay * 100) / 100;

      const gross =
        Math.round((basePay + overtimePay - lateDeduction - absenceDeduction) * 100) / 100;

      rows.push({
        employeeId: emp.id,
        employeeNo: emp.employeeNo,
        fullName: emp.fullName,
        department: emp.Department ? emp.Department.name : '',
        position: emp.Position ? emp.Position.name : '',
        presentDays,
        absentDays,
        leaveDays,
        dayOffDays,
        holidayDays,
        workedHours,
        workedMinutes,
        overtimeHours,
        overtimePaidHours,
        lateMinutes,
        earlyLeaveMinutes,
        basePay,
        overtimePay,
        lateDeduction,
        absenceDeduction,
        gross,
      });
    }

    const totals = rows.reduce(
      (t, r) => {
        t.presentDays += r.presentDays;
        t.absentDays += r.absentDays;
        t.leaveDays += r.leaveDays;
        t.workedHours += r.workedHours;
        t.overtimeHours += r.overtimeHours;
        t.lateMinutes += r.lateMinutes;
        t.gross += r.gross;
        return t;
      },
      {
        presentDays: 0,
        absentDays: 0,
        leaveDays: 0,
        workedHours: 0,
        overtimeHours: 0,
        lateMinutes: 0,
        gross: 0,
      }
    );
    totals.workedHours = Math.round(totals.workedHours * 100) / 100;
    totals.overtimeHours = Math.round(totals.overtimeHours * 100) / 100;
    totals.gross = Math.round(totals.gross * 100) / 100;

    return { period: { year, month, from, to }, rates: config, rows, totals, count: rows.length };
  }

  /**
   * 1C/Excel uchun matritsa formatidagi jadval (T/P/K — kunlar qatorida).
   */
  static async matrix({ year, month, departmentId = null }) {
    const dates = T.monthDates(year, month);
    const payroll = await PayrollService.monthly({ year, month, departmentId });

    const dailyRows = await DailyAttendance.findAll({
      where: { date: { [Op.between]: [dates[0], dates.slice(-1)[0]] } },
    });

    const byEmployee = new Map();
    for (const d of dailyRows) {
      if (!byEmployee.has(d.employeeId)) byEmployee.set(d.employeeId, new Map());
      byEmployee.get(d.employeeId).set(d.date, d);
    }

    const codeFor = (status) =>
      ({ present: 'I', late: 'K', absent: 'X', leave: 'T', holiday: 'B', day_off: 'D' })[status] ||
      '';

    const rows = payroll.rows.map((r) => {
      const empDays = byEmployee.get(r.employeeId) || new Map();
      return {
        ...r,
        days: dates.map((d) => codeFor(empDays.get(d) ? empDays.get(d).status : '')),
      };
    });

    return { period: { year, month, dates }, rows, totals: payroll.totals };
  }
}

module.exports = PayrollService;
