'use strict';

const { Op } = require('sequelize');
const { OvertimeRecord, Employee, DailyAttendance } = require('../models');
const T = require('../utils/time');
const audit = require('./audit.service');

/**
 * Qo'shimcha ish vaqti (overtime) va premiumlar.
 *  - regular  : 1.0x
 *  - night    : kechqurun smena (ko'pincha 1.5x)
 *  - holiday  : bayram kuni (2.0x)
 *  - weekend  : dam kuni (1.5x)
 */
class OvertimeService {
  static MULTIPLIERS = { regular: 1, night: 15, holiday: 2, weekend: 15 };

  static async create({
    employeeId,
    date,
    minutes,
    kind = 'regular',
    multiplier,
    note,
    userId,
    source = 'manual',
  }) {
    const employee = await Employee.findByPk(employeeId);
    if (!employee) throw new Error('Xodim topilmadi');

    const [record] = await OvertimeRecord.create({
      employeeId,
      date,
      minutes,
      kind,
      multiplier: multiplier || OvertimeService.MULTIPLIERS[kind] || 1,
      note: note || null,
      source,
      approvedBy: userId,
    });

    await audit.record({
      userId,
      action: 'overtime.create',
      entity: 'overtime_records',
      entityId: record.id,
      after: { employeeId, date, minutes, kind },
    });

    return record;
  }

  static async remove(id, { userId }) {
    const record = await OvertimeRecord.findByPk(id);
    if (!record) throw new Error('Yozuv topilmadi');
    const before = record.toJSON();
    await record.destroy();
    await audit.record({
      userId,
      action: 'overtime.delete',
      entity: 'overtime_records',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  /**
   * Xodim bo'yicha oylik overtime summary.
   */
  static async summary(employeeId, year, month) {
    const from = T.monthDates(year, month)[0];
    const to = T.monthDates(year, month).slice(-1)[0];

    const records = await OvertimeRecord.findAll({
      where: { employeeId, date: { [Op.between]: [from, to] } },
      order: [['date', 'ASC']],
    });

    const totalMinutes = records.reduce((s, r) => s + r.minutes, 0);
    const paidMinutes = records.reduce((s, r) => s + Math.round(r.minutes * r.multiplier), 0);

    return {
      records,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      paidMinutes,
      paidHours: Math.round((paidMinutes / 60) * 100) / 100,
      byKind: records.reduce((acc, r) => {
        acc[r.kind] = (acc[r.kind] || 0) + r.minutes;
        return acc;
      }, {}),
    };
  }

  /**
   * Barcha xodimlar uchun oylik jadval.
   */
  static async monthlyTable(year, month, departmentId = null) {
    const employees = await Employee.findAll({
      where: departmentId ? { departmentId, isActive: true } : { isActive: true },
      order: [['fullName', 'ASC']],
    });

    const rows = [];
    for (const emp of employees) {
      const s = await OvertimeService.summary(emp.id, year, month);
      rows.push({ employee: emp, ...s });
    }
    return rows;
  }

  /**
   * Kechqurun smena uchun avtomatik overtime (ish tugagandan keyin).
   */
  static async autoDetect(employeeId, date) {
    const daily = await DailyAttendance.findOne({ where: { employeeId, date } });
    if (!daily || !daily.lastOut) return null;

    const endMinutes = T.toMinutesInTz(daily.lastOut);
    const NIGHT_START = 22 * 60;
    if (endMinutes < NIGHT_START) return null;

    const overtimeMinutes = endMinutes - NIGHT_START;
    if (overtimeMinutes < 30) return null; // 30 daqiqadan kamini hisoblamaymiz

    const existing = await OvertimeRecord.findOne({
      where: { employeeId, date, kind: 'night' },
    });
    if (existing) return existing;

    return OvertimeService.create({
      employeeId,
      date,
      minutes: overtimeMinutes,
      kind: 'night',
      source: 'auto',
    });
  }
}

module.exports = OvertimeService;
