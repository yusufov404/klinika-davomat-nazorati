'use strict';

const { Op } = require('sequelize');
const { LeaveBalance, Leave, LeaveType, Employee } = require('../models');
const T = require('../utils/time');

/**
 * Ta'til balansi:
 *  - entitledDays  : berilgan kunlar (odatda yiliga 14 ish kuni)
 *  - usedDays      : tasdiqlangan ta'tillar bo'yicha sarflangan kunlar
 *  - carriedOver   : o'tgan yildan ko'chirilgan kunlar
 */
class LeaveBalanceService {
  /**
   * Xodim uchun barcha ta'til turlari bo'yicha balans.
   * @param {number} employeeId
   * @param {number} year
   */
  static async forEmployee(employeeId, year = new Date().getFullYear()) {
    const types = await LeaveType.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
    const balances = await LeaveBalance.findAll({ where: { employeeId, year } });
    const used = await LeaveBalanceService.usedDays(employeeId, year);

    return types.map((type) => {
      const bal = balances.find((b) => b.leaveTypeId === type.id);
      const entitled = (bal ? bal.entitledDays : 0) + (bal ? bal.carriedOver : 0);
      const usedDays = used[type.id] || 0;
      return {
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        isPaid: type.isPaid,
        entitledDays: entitled,
        usedDays,
        remainingDays: entitled - usedDays,
        carriedOver: bal ? bal.carriedOver : 0,
      };
    });
  }

  /**
   * Tasdiqlangan ta'tillar bo'yicha sarflangan kunlar.
   */
  static async usedDays(employeeId, year) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const leaves = await Leave.findAll({
      where: {
        employeeId,
        status: 'approved',
        startDate: { [Op.lte]: to },
        endDate: { [Op.gte]: from },
      },
      include: [{ model: LeaveType, as: 'LeaveType', required: false }],
    });

    const result = {};
    for (const leave of leaves) {
      const days = LeaveBalanceService.countDays(leave.startDate, leave.endDate);
      const key = leave.leaveTypeId;
      result[key] = (result[key] || 0) + days;
    }
    return result;
  }

  /**
   * Sana oralig'ida ish kunlari soni (dam kunlari hisobga olinmaydi).
   */
  static countDays(startDate, endDate) {
    let count = 0;
    let date = startDate;
    let guard = 0;
    while (date <= endDate && guard < 400) {
      guard += 1;
      const dow = T.weekday(date);
      if (dow <= 5) count += 1;
      date = T.addDays(date, 1);
    }
    return count;
  }

  /**
   * Balansni o'rnatish.
   */
  static async set(employeeId, leaveTypeId, year, { entitledDays, carriedOver, note }) {
    const [balance] = await LeaveBalance.findOrCreate({
      where: { employeeId, leaveTypeId, year },
      defaults: { employeeId, leaveTypeId, year, entitledDays: 0, carriedOver: 0 },
    });
    await balance.update({
      entitledDays: entitledDays !== undefined ? entitledDays : balance.entitledDays,
      carriedOver: carriedOver !== undefined ? carriedOver : balance.carriedOver,
      note: note !== undefined ? note : balance.note,
    });
    return balance;
  }

  /**
   * Yil boshida barcha faol xodimlar uchun standart balans.
   */
  static async seedYear(year, { defaultDays = 14, leaveTypeIds = [] }) {
    const employees = await Employee.findAll({ where: { isActive: true }, attributes: ['id'] });
    let created = 0;
    for (const emp of employees) {
      for (const typeId of leaveTypeIds) {
        const [balance] = await LeaveBalance.findOrCreate({
          where: { employeeId: emp.id, leaveTypeId: typeId, year },
          defaults: { employeeId: emp.id, leaveTypeId: typeId, year, entitledDays: defaultDays },
        });
        if (balance.entitledDays === 0) {
          await balance.update({ entitledDays: defaultDays });
          created += 1;
        }
      }
    }
    return { employees: employees.length, created };
  }

  /**
   * Barcha xodimlar uchun balans jadvali (hisobot uchun).
   */
  static async table(year = new Date().getFullYear(), departmentId = null) {
    const employees = await Employee.findAll({
      where: departmentId ? { departmentId, isActive: true } : { isActive: true },
      include: [{ model: require('../models').Department, as: 'Department', required: false }],
      order: [['fullName', 'ASC']],
    });

    const rows = [];
    for (const emp of employees) {
      const balances = await LeaveBalanceService.forEmployee(emp.id, year);
      rows.push({
        employee: emp,
        balances,
        totalEntitled: balances.reduce((s, b) => s + b.entitledDays, 0),
        totalUsed: balances.reduce((s, b) => s + b.usedDays, 0),
        totalRemaining: balances.reduce((s, b) => s + b.remainingDays, 0),
      });
    }
    return rows;
  }
}

module.exports = LeaveBalanceService;
