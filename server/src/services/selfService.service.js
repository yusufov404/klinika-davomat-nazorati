'use strict';

const { Op } = require('sequelize');
const { Employee, DailyAttendance, AttendanceRequest, Department } = require('../models');
const T = require('../utils/time');
const LeaveBalanceService = require('./leaveBalance.service');
const OvertimeService = require('./overtime.service');

/**
 * Xodimning o'z paneli (self-service).
 * Xodim faqat o'z ma'lumotlarini ko'radi — boshqa xodimlarni emas.
 */
class SelfServiceService {
  /**
   * Xodimning o'z profili va joriy oy statistikasi.
   */
  static async myProfile(employeeId) {
    const employee = await Employee.findByPk(employeeId, {
      include: [{ model: Department, as: 'Department', required: false }],
    });
    if (!employee) throw new Error('Xodim topilmadi');

    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const from = T.monthDates(year, month)[0];
    const to = T.monthDates(year, month).slice(-1)[0];

    const daily = await DailyAttendance.findAll({
      where: { employeeId, date: { [Op.between]: [from, to] } },
      order: [['date', 'DESC']],
    });

    const summary = {
      present: daily.filter((d) => d.status === 'present').length,
      late: daily.filter((d) => d.status === 'late').length,
      absent: daily.filter((d) => d.status === 'absent').length,
      leave: daily.filter((d) => d.status === 'leave').length,
      incomplete: daily.filter((d) => d.status === 'incomplete').length,
      workedMinutes: daily.reduce((s, d) => s + (d.workedMinutes || 0), 0),
      lateMinutes: daily.reduce((s, d) => s + (d.lateMinutes || 0), 0),
      earlyLeaveMinutes: daily.reduce((s, d) => s + (d.earlyLeaveMinutes || 0), 0),
    };

    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        employeeNo: employee.employeeNo,
        department: employee.Department ? employee.Department.name : null,
        hireDate: employee.hireDate,
      },
      period: { year, month, from, to },
      summary,
      daily,
    };
  }

  /**
   * Xodimning ta'til balansi.
   */
  static async myBalances(employeeId, year = new Date().getFullYear()) {
    return LeaveBalanceService.forEmployee(employeeId, year);
  }

  /**
   * Xodimning overtime (qo'shimcha ish vaqti) ro'yxati.
   */
  static async myOvertime(employeeId, year, month) {
    return OvertimeService.summary(employeeId, year, month);
  }

  /**
   * Xodimning so'rovlari (tasdiqlashga so'raydigan).
   */
  static async myRequests(employeeId) {
    return AttendanceRequest.findAll({
      where: { employeeId },
      order: [['id', 'DESC']],
      limit: 50,
    });
  }

  /**
   * Tasdiqlashga so'rov yuborish.
   */
  static async createRequest(employeeId, { date, requestedIn, requestedOut, reason }) {
    const existing = await AttendanceRequest.findOne({
      where: { employeeId, date, status: 'pending' },
    });
    if (existing) return existing;

    const [request] = await AttendanceRequest.create({
      employeeId,
      date,
      requestedIn: requestedIn || null,
      requestedOut: requestedOut || null,
      reason: reason || null,
    });

    // HR'ni xabardor qilamiz
    try {
      const NotificationService = require('./notification.service');
      await NotificationService.notify({
        type: 'info',
        title: "Kelishni tasdiqlashga so'rov",
        body: `${date} — ${reason || "sabab ko'rsatilmagan"}`,
        link: '/requests',
      });
    } catch (e) {
      /* xabar yuborilmasa ham muammo yo'q */
    }

    return request;
  }

  /**
   * So'rovni tasdiqlash/rad etish (HR).
   */
  static async reviewRequest(id, { status, comment, userId }) {
    const request = await AttendanceRequest.findByPk(id);
    if (!request) throw new Error("So'rov topilmadi");
    if (request.status !== 'pending') throw new Error("So'rov allaqachon ko'rib chiqilgan");

    await request.update({
      status,
      reviewedBy: userId,
      reviewedAt: new Date(),
      reviewComment: comment || null,
    });

    if (status === 'approved') {
      // Tasdiqlangan so'rov — davomatni tuzatish (qo'lda tuzatish sifatida)
      const daily = await DailyAttendance.findOne({
        where: { employeeId: request.employeeId, date: request.date },
      });

      const patch = {
        employeeId: request.employeeId,
        date: request.date,
        status: daily ? daily.status : 'present',
        isManualAdjusted: true,
        computedAt: new Date(),
      };
      if (request.requestedIn) {
        patch.firstIn = DailyAttendance.prototype.constructor.rawAttributes
          ? new Date(`${request.date}T${request.requestedIn}:00+05:00`)
          : null;
      }
      if (request.requestedOut) {
        patch.lastOut = new Date(`${request.date}T${request.requestedOut}:00+05:00`);
      }
      if (patch.firstIn && patch.lastOut) {
        let diff = T.timeToMinutes(request.requestedOut) - T.timeToMinutes(request.requestedIn);
        if (diff < 0) diff += 1440;
        patch.workedMinutes = diff;
      }

      await DailyAttendance.upsert(patch, {
        where: { employeeId: request.employeeId, date: request.date },
      });
    }

    return request;
  }
}

module.exports = SelfServiceService;
