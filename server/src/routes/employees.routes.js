'use strict';

const express = require('express');
const { createCrudRouter } = require('../utils/crud');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const { employeeSchema } = require('../middlewares/validate');
const { Employee, Department, Position, TerminalSyncJob, UnmatchedEvent } = require('../models');
const SyncService = require('../services/sync.service');
const audit = require('../services/audit.service');
const { notFound, badRequest } = require('../utils/errors');

const router = express.Router();

const include = [
  { model: Department, as: 'Department', required: false },
  { model: Position, as: 'Position', required: false },
];

// ===================================================================
//  Maxsus route'lar (CRUD router'dan OLDIN ro'yxatdan o'tadi)
// ===================================================================

/**
 * GET /api/employees/unmatched/list — xodimi topilmagan eventlar
 */
router.get(
  '/unmatched/list',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const { rows, count } = await UnmatchedEvent.findAndCountAll({
      where: { resolved: false },
      order: [['logTime', 'DESC']],
      limit: 200,
    });
    res.list(rows, { total: count });
  })
);

/**
 * POST /api/employees/unmatched/:id/resolve — eventni xodimga bog'lash
 */
router.post(
  '/unmatched/:id/resolve',
  requirePermission('attendance:adjust'),
  asyncHandler(async (req, res) => {
    const event = await UnmatchedEvent.findByPk(req.params.id);
    if (!event) throw notFound('Event topilmadi');

    const employee = await Employee.findByPk(req.body.employeeId);
    if (!employee) throw notFound('Xodim topilmadi');

    const IngestService = require('../services/ingest.service');
    const result = await IngestService.ingest({
      payload: event.rawPayload,
      sourceIp: null,
      source: 'manual',
      terminalId: event.terminalId,
    });

    await event.update({ resolved: true, employeeId: employee.id });
    res.ok(result);
  })
);

/**
 * GET /api/employees/:id/detail — xodim to'liq ma'lumoti
 */
router.get(
  '/:id/detail',
  requirePermission('employees:read'),
  asyncHandler(async (req, res) => {
    const employee = await Employee.findByPk(req.params.id, { include });
    if (!employee) throw notFound('Xodim topilmadi');

    const logs = await employee.getAttendanceLogs({
      order: [['logTime', 'DESC']],
      limit: 100,
    });
    const daily = await employee.getDailyAttendances({
      order: [['date', 'DESC']],
      limit: 60,
    });
    const leaves = await employee.getLeaves({ order: [['startDate', 'DESC']], limit: 30 });

    res.ok({ employee, logs, daily, leaves });
  })
);

/**
 * POST /api/employees/:id/sync — xodimni terminallarga darhol yuborish
 */
router.post(
  '/:id/sync',
  requirePermission('terminals:sync'),
  asyncHandler(async (req, res) => {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) throw notFound('Xodim topilmadi');

    const action = req.body && req.body.action ? req.body.action : 'add';
    const jobs = await SyncService.enqueueForAllTerminals(employee, action);
    const processed = await SyncService.processPending(50);
    res.ok({ queued: jobs.length, processed });
  })
);

/**
 * POST /api/employees/:id/face — yuz rasmini terminalga yuborish (multipart)
 */
router.post(
  '/:id/face',
  requirePermission('terminals:sync'),
  asyncHandler(async (req, res) => {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) throw notFound('Xodim topilmadi');
    if (!req.file) throw notFound('Rasm fayli topilmadi');

    const { Terminal } = require('../models');
    const TerminalService = require('../services/terminal.service');
    const terminals = await Terminal.findAll({ where: { isActive: true } });

    const results = [];
    for (const terminal of terminals) {
      try {
        const client = TerminalService.getClient(terminal);
        const userId = String(employee.terminalUserId || employee.employeeNo);
        await client.addFaceData({
          userId,
          faceData: {
            FaceData: {
              faceID: userId,
              personID: userId,
              faceURL: '',
              enable: true,
              similarity: 80,
            },
          },
          fileBuffer: req.file.buffer,
          fileName: req.file.originalname || `face-${userId}.jpg`,
        });
        results.push({ terminal: terminal.name, ok: true });
      } catch (err) {
        results.push({ terminal: terminal.name, ok: false, error: err.message });
        await TerminalSyncJob.create({
          employeeId: employee.id,
          terminalId: terminal.id,
          action: 'face',
          status: 'failed',
          attempts: 1,
          lastError: err.message,
        });
      }
    }

    if (results.every((r) => r.ok)) {
      await employee.update({ faceEnrolled: true });
    }

    res.ok(results);
  })
);

// ===================================================================
//  EXCEL: xodimlar ro'yxatini import/export
// ===================================================================

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
 * GET /api/employees/template.xlsx — xodimlar import shabloni
 */
router.get(
  '/template.xlsx',
  requirePermission('employees:read'),
  asyncHandler(async (req, res) => {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="xodimlar_shabloni.xlsx"');
    await ExcelService.exportEmployeesTemplate(res);
  })
);

/**
 * POST /api/employees/import-excel — xodimlarni Excel'dan import qilish
 */
router.post(
  '/import-excel',
  requirePermission('employees:write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Excel fayl yuklanmadi');

    const dryRun = req.body && String(req.body.dryRun) === 'true';
    const result = await ExcelService.importEmployees(req.file.buffer, {
      userId: req.user.id,
      dryRun,
    });

    if (!result.format) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation_error',
          message: result.errors[0] ? result.errors[0].message : 'Fayl formati tanib olinmadi',
          details: result.errors,
        },
      });
    }

    res.ok({ file: req.file.originalname, dryRun, ...result });
  })
);

// ===================================================================
//  CRUD (GET/POST/PUT/DELETE) — oxirida, umumiy route'lardan keyin
// ===================================================================
router.use(
  createCrudRouter({
    model: Employee,
    schema: employeeSchema,
    resource: 'employees',
    searchFields: ['fullName', 'employeeNo', 'phone'],
    filterFields: ['departmentId', 'positionId', 'isActive'],
    include,
    order: [['fullName', 'ASC']],
    basePath: '',
    hooks: {
      async afterCreate(row, req) {
        if (!row.terminalUserId) await row.update({ terminalUserId: row.employeeNo });
        await SyncService.enqueueForAllTerminals(row, 'add');
        await audit.record({
          ...audit.contextFromReq(req),
          action: 'employee.create',
          entity: 'employees',
          entityId: row.id,
          after: row.toJSON(),
        });
      },
      async afterUpdate(row, before, req) {
        const nameChanged = before.fullName !== row.fullName;
        const activated = before.isActive === false && row.isActive === true;
        const deactivated = before.isActive === true && row.isActive === false;

        if (deactivated) {
          await SyncService.enqueueForAllTerminals(row, 'delete');
        } else if (nameChanged || activated) {
          await SyncService.enqueueForAllTerminals(row, 'add');
        } else {
          await SyncService.enqueueForAllTerminals(row, 'update');
        }

        await audit.record({
          ...audit.contextFromReq(req),
          action: 'employee.update',
          entity: 'employees',
          entityId: row.id,
          before,
          after: row.toJSON(),
        });
      },
      async afterDelete(before, req) {
        await audit.record({
          ...audit.contextFromReq(req),
          action: 'employee.delete',
          entity: 'employees',
          entityId: before.id,
          before,
        });
      },
    },
  })
);

module.exports = router;
