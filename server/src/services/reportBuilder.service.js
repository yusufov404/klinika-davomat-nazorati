'use strict';

const { Op } = require('sequelize');
const { DailyAttendance, Employee, Department, Timesheet, ReportTemplate } = require('../models');
const T = require('../utils/time');
const audit = require('./audit.service');

/**
 * Hisobot konstruktori — foydalanuvchi ustunlarni va filtrlarni tanlaydi,
 * shablonni saqlaydi va keyin bir zumda qayta ishlatadi.
 */

/** Mavjud ustunlar (kalit -> sarlavha + qiymat olish funksiyasi) */
const COLUMNS = {
  date: { label: 'Sana', type: 'date' },
  employee: { label: 'Xodim', type: 'string' },
  employeeNo: { label: 'Tabel №', type: 'string' },
  department: { label: "Bo'lim", type: 'string' },
  position: { label: 'Lavozim', type: 'string' },
  firstIn: { label: 'Kelish', type: 'time' },
  lastOut: { label: 'Ketish', type: 'time' },
  workedHours: { label: 'Ish soati', type: 'number' },
  workedMinutes: { label: 'Ish vaqti (daq)', type: 'number' },
  lateMinutes: { label: 'Kechikish (daq)', type: 'number' },
  earlyLeaveMinutes: { label: 'Erta ketish (daq)', type: 'number' },
  status: { label: 'Holat', type: 'status' },
  note: { label: 'Izoh', type: 'string' },
  isManualAdjusted: { label: "Qo'lda tuzatilgan", type: 'boolean' },
};

class ReportBuilderService {
  static get columns() {
    return Object.entries(COLUMNS).map(([key, def]) => ({ key, ...def }));
  }

  /**
   * Dinamik hisobot ma'lumotlarini yig'ish.
   */
  static async build({ dateFrom, dateTo, employeeId, departmentId, status, columns }) {
    const where = {};
    if (dateFrom) where.date = { [Op.gte]: dateFrom };
    if (dateTo) where.date = where.date || {};
    if (dateTo) where.date[Op.lte] = dateTo;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    if (departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: employees.map((e) => e.id) };
    }

    const rows = await DailyAttendance.findAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
      ],
      order: [
        ['date', 'ASC'],
        ['employeeId', 'ASC'],
      ],
      limit: 10000,
    });

    const cols = columns && columns.length ? columns : Object.keys(COLUMNS);
    const data = rows.map((row) => {
      const out = {};
      for (const key of cols) {
        out[key] = ReportBuilderService.value(row, key);
      }
      return out;
    });

    return { columns: cols, rows: data, total: data.length };
  }

  static value(row, key) {
    switch (key) {
      case 'employee':
        return row.Employee ? row.Employee.fullName : '';
      case 'employeeNo':
        return row.Employee ? row.Employee.employeeNo : '';
      case 'department':
        return row.Employee && row.Employee.Department ? row.Employee.Department.name : '';
      case 'position':
        return row.Employee && row.Employee.Position ? row.Employee.Position.name : '';
      case 'workedHours':
        return Math.round(((row.workedMinutes || 0) / 60) * 100) / 100;
      case 'firstIn':
        return row.firstIn ? T.toMinutesInTz(row.firstIn) : null;
      case 'lastOut':
        return row.lastOut ? T.toMinutesInTz(row.lastOut) : null;
      case 'date':
        return row.date;
      default:
        return row[key] !== undefined ? row[key] : null;
    }
  }

  /**
   * Shablonlarni saqlash.
   */
  static async saveTemplate({ name, description, type, columns, filters, isPublic, userId }) {
    const [template] = await ReportTemplate.create({
      name,
      description: description || null,
      type: type || 'daily',
      columns: columns || [],
      filters: filters || {},
      isPublic: Boolean(isPublic),
      createdBy: userId,
    });
    await audit.record({
      userId,
      action: 'report_template.create',
      entity: 'report_templates',
      entityId: template.id,
      after: { name, type, columns },
    });
    return template;
  }

  static async listTemplates(userId) {
    return ReportTemplate.findAll({
      where: { [Op.or]: [{ isPublic: true }, { createdBy: userId }] },
      order: [['id', 'ASC']],
    });
  }

  static async deleteTemplate(id, userId) {
    const template = await ReportTemplate.findByPk(id);
    if (!template) throw new Error('Shablon topilmadi');
    if (!template.isPublic && template.createdBy !== userId) {
      throw new Error("Faqat o'zingiz yaratgan shablonni o'chirasiz");
    }
    const before = template.toJSON();
    await template.destroy();
    await audit.record({
      userId,
      action: 'report_template.delete',
      entity: 'report_templates',
      entityId: id,
      before,
    });
    return { deleted: true };
  }

  /**
   * Oylik hisobot — har bir xodim uchun bir qator.
   */
  static async monthlyRows({ year, month, departmentId }) {
    const where = { year, month };
    const sheets = await Timesheet.findAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
      ],
      order: [['employeeId', 'ASC']],
    });

    let rows = sheets;
    if (departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId },
        attributes: ['id'],
      });
      const ids = employees.map((e) => e.id);
      rows = sheets.filter((s) => ids.includes(s.employeeId));
    }

    return rows.map((s) => ({
      employee: s.Employee ? s.Employee.fullName : '',
      employeeNo: s.Employee ? s.Employee.employeeNo : '',
      department: s.Employee && s.Employee.Department ? s.Employee.Department.name : '',
      workedDays: s.workedDays,
      workedHours: Math.round(((s.workedMinutes || 0) / 60) * 100) / 100,
      lateCount: s.lateCount,
      lateMinutes: s.lateMinutes,
      absentDays: s.absentDays,
      leaveDays: s.leaveDays,
      status: s.status,
    }));
  }
}

module.exports = ReportBuilderService;
