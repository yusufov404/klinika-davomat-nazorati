'use strict';

const { Op } = require('sequelize');
const { TimesheetPeriod, Timesheet, DailyAttendance, Employee } = require('../models');
const audit = require('./audit.service');
const T = require('../utils/time');
const logger = require('../config/logger');

/**
 * Oylik davr boshqaruvi:
 *   open → submitted → approved → locked
 *
 * Yopilgan (locked) davrga avtomatik qayta hisoblash tegmaydi —
 * bu hisobchilar uchun muhim: tasdiqlangan raqamlar o'zgarib ketmaydi.
 */
class PeriodService {
  /**
   * Davr holatini olish (yo'q bo'lsa yaratiladi).
   */
  static async getOrCreate(year, month) {
    const [period] = await TimesheetPeriod.findOrCreate({
      where: { year, month },
      defaults: { year, month, status: 'open' },
    });
    return period;
  }

  /**
   * Barcha davrlar ro'yxati (oylar bo'yicha).
   */
  static async list(year) {
    const where = year ? { year } : {};
    return TimesheetPeriod.findAll({
      where,
      order: [
        ['year', 'DESC'],
        ['month', 'DESC'],
      ],
    });
  }

  /**
   * Davrni tasdiqlashga yuborish.
   */
  static async submit(year, month, { userId, note }) {
    const period = await PeriodService.getOrCreate(year, month);
    if (period.status === 'locked') {
      throw new Error("Yopilgan davrni o'zgartirib bo'lmaydi");
    }
    await period.update({ status: 'submitted', note: note || period.note });
    await audit.record({
      userId,
      action: 'timesheet_period.submit',
      entity: 'timesheet_periods',
      entityId: period.id,
      after: { year, month, status: 'submitted' },
    });
    return period;
  }

  /**
   * Davrni tasdiqlash (direktor/HR).
   */
  static async approve(year, month, { userId, note }) {
    const period = await PeriodService.getOrCreate(year, month);
    if (period.status === 'locked') {
      throw new Error("Yopilgan davrni tasdiqlab bo'lmaydi");
    }
    await period.update({
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      note: note || period.note,
    });
    await audit.record({
      userId,
      action: 'timesheet_period.approve',
      entity: 'timesheet_periods',
      entityId: period.id,
      after: { year, month, status: 'approved' },
    });
    return period;
  }

  /**
   * Davrni yopish — keyingi hisoblamalarda qat'iy saqlanadi.
   */
  static async lock(year, month, { userId, note }) {
    const period = await PeriodService.getOrCreate(year, month);

    // Yopishdan oldin oylik tabelni shakllantiramiz
    const attendanceService = require('./attendance.service');
    const from = T.monthDates(year, month)[0];
    const to = T.monthDates(year, month).slice(-1)[0];
    await attendanceService.recalculateRange(from, to);

    const sheets = await DailyAttendance.findAll({
      where: { date: { [Op.between]: [from, to] } },
    });

    const summary = PeriodService.summarize(sheets);
    await Timesheet.destroy({ where: { year, month } });

    const employees = await Employee.findAll({ where: { isActive: true }, attributes: ['id'] });
    for (const emp of employees) {
      const rows = sheets.filter((r) => r.employeeId === emp.id);
      const workedDays = rows.filter((r) => ['present', 'late'].includes(r.status)).length;
      const workedMinutes = rows.reduce((s, r) => s + (r.workedMinutes || 0), 0);
      const lateCount = rows.filter((r) => r.lateMinutes > 0).length;
      const lateMinutes = rows.reduce((s, r) => s + (r.lateMinutes || 0), 0);
      const absentDays = rows.filter((r) => r.status === 'absent').length;
      const leaveDays = rows.filter((r) => r.status === 'leave').length;

      await Timesheet.upsert(
        {
          employeeId: emp.id,
          year,
          month,
          workedDays,
          workedMinutes,
          lateCount,
          lateMinutes,
          absentDays,
          leaveDays,
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
        },
        { where: { employeeId: emp.id, year, month } }
      );
    }

    await period.update({
      status: 'locked',
      lockedAt: new Date(),
      lockedBy: userId,
      approvedBy: userId,
      approvedAt: new Date(),
      note: note || period.note,
    });

    await audit.record({
      userId,
      action: 'timesheet_period.lock',
      entity: 'timesheet_periods',
      entityId: period.id,
      after: { year, month, status: 'locked', summary },
    });

    logger.info(`Davr yopildi: ${year}-${month}`);
    return { period, summary };
  }

  /**
   * Davrni ochish (qayta ishlash uchun — faqat superadmin).
   */
  static async unlock(year, month, { userId, note }) {
    const period = await PeriodService.getOrCreate(year, month);
    await period.update({
      status: 'open',
      lockedAt: null,
      lockedBy: null,
      note: note || period.note,
    });
    await Timesheet.update({ status: 'draft' }, { where: { year, month } });
    await audit.record({
      userId,
      action: 'timesheet_period.unlock',
      entity: 'timesheet_periods',
      entityId: period.id,
      after: { year, month, status: 'open' },
    });
    return period;
  }

  /**
   * Berilgan sana yopilgan davrga tegishli mi?
   */
  static async isLocked(dateStr) {
    const date = new Date(`${dateStr}T00:00:00Z`);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const period = await TimesheetPeriod.findOne({ where: { year, month } });
    return period ? period.status === 'locked' : false;
  }

  /**
   * Yopilgan davrlar ro'yxati (hisob uchun).
   */
  static async lockedPeriods() {
    return TimesheetPeriod.findAll({
      where: { status: 'locked' },
      order: [
        ['year', 'DESC'],
        ['month', 'DESC'],
      ],
    });
  }

  static summarize(rows) {
    const summary = {
      total: rows.length,
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      holiday: 0,
      dayOff: 0,
      incomplete: 0,
      workedMinutes: 0,
      lateMinutes: 0,
    };
    for (const r of rows) {
      if (r.status === 'present') summary.present += 1;
      else if (r.status === 'late') summary.late += 1;
      else if (r.status === 'absent') summary.absent += 1;
      else if (r.status === 'leave') summary.leave += 1;
      else if (r.status === 'holiday') summary.holiday += 1;
      else if (r.status === 'day_off') summary.dayOff += 1;
      else if (r.status === 'incomplete') summary.incomplete += 1;
      summary.workedMinutes += r.workedMinutes || 0;
      summary.lateMinutes += r.lateMinutes || 0;
    }
    return summary;
  }
}

module.exports = PeriodService;
