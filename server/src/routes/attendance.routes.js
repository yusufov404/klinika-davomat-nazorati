'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const {
  Employee,
  Department,
  Terminal,
  DailyAttendance,
  AttendanceLog,
  Timesheet,
  ManualAdjustment,
  Shift,
} = require('../models');
const attendanceService = require('../services/attendance.service');
const audit = require('../services/audit.service');
const T = require('../utils/time');
const { notFound, badRequest } = require('../utils/errors');
const { adjustmentSchema } = require('../middlewares/validate');

const router = express.Router();

const logsQuery = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  employeeId: z.coerce.number().int().optional(),
  departmentId: z.coerce.number().int().optional(),
  terminalId: z.coerce.number().int().optional(),
  source: z.string().optional(),
  eventType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * GET /api/attendance/logs — xom loglar
 */
router.get(
  '/logs',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const q = logsQuery.parse(req.query);
    const where = {};

    if (q.dateFrom) where.logTime = { [Op.gte]: T.startOfDay(q.dateFrom) };
    if (q.dateTo) {
      where.logTime = where.logTime || {};
      where.logTime[Op.lte] = T.endOfDay(q.dateTo);
    }
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.terminalId) where.terminalId = q.terminalId;
    if (q.source) where.source = q.source;
    if (q.eventType) where.eventType = q.eventType;

    if (q.departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId: q.departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: employees.map((e) => e.id) };
    }

    const { rows, count } = await AttendanceLog.findAndCountAll({
      where,
      include: [
        { model: Employee, required: false },
        { model: Terminal, required: false },
      ],
      order: [['logTime', 'DESC']],
      limit: q.limit,
      offset: (q.page - 1) * q.limit,
      distinct: true,
    });

    res.list(rows, {
      page: q.page,
      limit: q.limit,
      total: count,
      totalPages: Math.ceil(count / q.limit),
    });
  })
);

/**
 * GET /api/attendance/daily — hisoblangan kunlik natijalar
 */
router.get(
  '/daily',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        date: z.string().optional(),
        employeeId: z.coerce.number().int().optional(),
        departmentId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(5000).default(100),
      })
      .parse(req.query);

    const where = {};
    if (q.date) where.date = q.date;
    if (q.dateFrom) where.date = { [Op.gte]: q.dateFrom };
    if (q.dateTo) {
      where.date = where.date || {};
      where.date[Op.lte] = q.dateTo;
    }
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status;

    if (q.departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId: q.departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: employees.map((e) => e.id) };
    }

    const { rows, count } = await DailyAttendance.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
        { model: Shift, required: false },
      ],
      order: [
        ['date', 'DESC'],
        ['employeeId', 'ASC'],
      ],
      limit: q.limit,
      offset: (q.page - 1) * q.limit,
      distinct: true,
    });

    res.list(rows, {
      page: q.page,
      limit: q.limit,
      total: count,
      totalPages: Math.ceil(count / q.limit),
    });
  })
);

/**
 * POST /api/attendance/recalculate — qayta hisoblash
 */
router.post(
  '/recalculate',
  requirePermission('attendance:write'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        employeeId: z.coerce.number().int().optional(),
      })
      .parse(req.body || {});

    const from = q.dateFrom || T.addDays(T.today(), -1);
    const to = q.dateTo || T.today();
    if (from > to) throw badRequest("dateFrom dateTo dan katta bo'lmasligi kerak");

    const count = await attendanceService.recalculateRange(from, to, {
      employeeId: q.employeeId,
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'attendance.recalculate',
      entity: 'daily_attendance',
      after: { from, to, employeeId: q.employeeId || null, count },
    });

    res.ok({ from, to, count });
  })
);

/**
 * POST /api/attendance/adjust — qo'lda tuzatish (sabab bilan, audit bilan)
 */
router.post(
  '/adjust',
  requirePermission('attendance:adjust'),
  asyncHandler(async (req, res) => {
    const data = adjustmentSchema.parse(req.body);

    const employee = await Employee.findByPk(data.employeeId);
    if (!employee) throw notFound('Xodim topilmadi');

    const existing = await DailyAttendance.findOne({
      where: { employeeId: data.employeeId, date: data.date },
    });

    const before = existing ? existing.toJSON() : null;

    const newValue = {
      employeeId: data.employeeId,
      date: data.date,
      firstIn: data.firstIn ? new Date(data.firstIn) : existing ? existing.firstIn : null,
      lastOut: data.lastOut ? new Date(data.lastOut) : existing ? existing.lastOut : null,
      workedMinutes:
        data.workedMinutes !== undefined && data.workedMinutes !== null
          ? data.workedMinutes
          : existing
            ? existing.workedMinutes
            : 0,
      lateMinutes:
        data.lateMinutes !== undefined && data.lateMinutes !== null
          ? data.lateMinutes
          : existing
            ? existing.lateMinutes
            : 0,
      earlyLeaveMinutes:
        data.earlyLeaveMinutes !== undefined && data.earlyLeaveMinutes !== null
          ? data.earlyLeaveMinutes
          : existing
            ? existing.earlyLeaveMinutes
            : 0,
      breakMinutes: existing ? existing.breakMinutes : 0,
      shiftId: existing ? existing.shiftId : null,
      status: data.status || (existing ? existing.status : 'present'),
      isManualAdjusted: true,
      note: data.note || (existing ? existing.note : null),
      computedAt: new Date(),
    };

    const [row] = await DailyAttendance.upsert(newValue, {
      where: { employeeId: data.employeeId, date: data.date },
    });

    await ManualAdjustment.create({
      employeeId: data.employeeId,
      date: data.date,
      oldValue: before,
      newValue: row.toJSON(),
      reason: data.reason,
      createdBy: req.user.id,
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'attendance.adjust',
      entity: 'daily_attendance',
      entityId: row.id,
      before,
      after: row.toJSON(),
    });

    res.ok(row);
  })
);

/**
 * GET /api/timesheets/:year/:month
 * (shu route /api/attendance/timesheets va /api/timesheets manzilida ishlaydi)
 */
const timesheetRouter = express.Router();

timesheetRouter.get(
  '/:year/:month',
  requirePermission('timesheets:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      throw badRequest("Yil yoki oy noto'g'ri");
    }

    const q = z
      .object({
        employeeId: z.coerce.number().int().optional(),
        departmentId: z.coerce.number().int().optional(),
      })
      .parse(req.query);

    const where = { year, month };
    if (q.employeeId) where.employeeId = q.employeeId;

    const { rows, count } = await Timesheet.findAndCountAll({
      where,
      include: [{ model: Employee, required: false }],
      order: [['employeeId', 'ASC']],
      limit: 1000,
    });

    res.list(rows, { total: count, year, month });
  })
);

/**
 * POST /api/timesheets/:year/:month/generate — oylik tabelni shakllantirish
 */
timesheetRouter.post(
  '/:year/:month/generate',
  requirePermission('timesheets:write'),
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    const q = z
      .object({
        employeeId: z.coerce.number().int().optional(),
        departmentId: z.coerce.number().int().optional(),
      })
      .parse(req.body || {});

    const where = { isActive: true };
    if (q.employeeId) where.id = q.employeeId;
    if (q.departmentId) where.departmentId = q.departmentId;

    const employees = await Employee.findAll({ where, attributes: ['id'] });
    const dates = T.monthDates(year, month);
    const from = dates[0];
    const to = dates[dates.length - 1];

    const result = [];
    for (const emp of employees) {
      await attendanceService.recalculateRange(from, to, { employeeId: emp.id });

      const rows = await DailyAttendance.findAll({
        where: { employeeId: emp.id, date: { [Op.gte]: from, [Op.lte]: to } },
      });

      const workedDays = rows.filter((r) => ['present', 'late'].includes(r.status)).length;
      const workedMinutes = rows.reduce((s, r) => s + (r.workedMinutes || 0), 0);
      const lateCount = rows.filter((r) => r.lateMinutes > 0).length;
      const lateMinutes = rows.reduce((s, r) => s + (r.lateMinutes || 0), 0);
      const absentDays = rows.filter((r) => r.status === 'absent').length;
      const leaveDays = rows.filter((r) => r.status === 'leave').length;

      const [sheet] = await Timesheet.upsert(
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
          status: 'draft',
        },
        { where: { employeeId: emp.id, year, month } }
      );
      result.push(sheet);
    }

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'timesheet.generate',
      entity: 'timesheets',
      after: { year, month, count: result.length },
    });

    res.ok({ year, month, count: result.length, timesheets: result });
  })
);

/**
 * POST /api/timesheets/:id/approve
 */
timesheetRouter.post(
  '/:id/approve',
  requirePermission('timesheets:approve'),
  asyncHandler(async (req, res) => {
    const sheet = await Timesheet.findByPk(req.params.id);
    if (!sheet) throw notFound('Tabel topilmadi');

    await sheet.update({
      status: 'approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'timesheet.approve',
      entity: 'timesheets',
      entityId: sheet.id,
      after: sheet.toJSON(),
    });

    res.ok(sheet);
  })
);

// ============================================================
//  EXCEL INTEGRATSIYASI
// ============================================================

const multer = require('multer');
const ExcelService = require('../services/excel.service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname);
    cb(ok ? null : new Error('Faqat .xlsx fayl qabul qilinadi'), ok);
  },
});

/**
 * GET /api/attendance/tabel/:year/:month/template.xlsx
 * Oylik tabel shabloni (matritsa) — Excel'da to'ldirib qaytarish uchun.
 */
router.get(
  '/tabel/:year/:month/template.xlsx',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.params.year);
    const month = Number(req.params.month);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      throw badRequest("Yil yoki oy noto'g'ri");
    }

    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const filename = `tabel_shabloni_${year}_${String(month).padStart(2, '0')}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await ExcelService.exportTabelMatrix(res, { year, month, departmentId });
  })
);

/**
 * POST /api/attendance/import-excel
 * Excel fayldagi tabel o'zgarishlarini bazaga qo'llaydi.
 */
router.post(
  '/import-excel',
  requirePermission('attendance:adjust'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Excel fayl yuklanmadi');

    const q = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100).optional(),
        month: z.coerce.number().int().min(1).max(12).optional(),
        reason: z
          .string()
          .min(3, "Sabab kamida 3 ta belgidan iborat bo'lishi kerak")
          .max(500)
          .optional(),
      })
      .parse(req.body || {});

    const parsed = await ExcelService.parseWorkbook(req.file.buffer);

    if (!parsed.format) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: parsed.errors[0] ? parsed.errors[0].message : 'Fayl formati tanib olinmadi',
          details: parsed.errors,
        },
      });
    }

    // Oy: fayldan yoki so'rovdan
    let { year, month } = q;
    if (parsed.format === 'matrix') {
      year = year || parsed.meta.year;
      month = month || parsed.meta.month;
    }
    if (!year || !month) {
      // kunlik format: sanalardan oyni aniqlaymiz
      const firstDate = parsed.rows.find((r) => r.date)?.date;
      if (firstDate) {
        year = year || Number(firstDate.slice(0, 4));
        month = month || Number(firstDate.slice(5, 7));
      }
    }
    if (!year || !month) {
      throw badRequest("Oyni aniqlab bo'lmadi. So'rovda yil va oy ko'rsating (year, month)");
    }

    const report = await ExcelService.applyImport(parsed.rows, {
      year,
      month,
      reason: q.reason || 'Excel orqali import qilindi',
      userId: req.user.id,
      ipAddress: req.ip,
    });

    res.ok({
      format: parsed.format,
      year,
      month,
      file: req.file.originalname,
      ...report,
    });
  })
);

// Oylik tabel route'lari alohida eksport qilinadi (/api/timesheets manzili uchun)
router.use('/timesheets', timesheetRouter);

module.exports = router;
module.exports.timesheetRouter = timesheetRouter;
