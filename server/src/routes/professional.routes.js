'use strict';

const express = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../middlewares/errorHandler');
const { authenticate, requirePermission } = require('../middlewares/auth');
const { badRequest, notFound } = require('../utils/errors');
const { AttendanceRequest, Consent, Employee, User } = require('../models');
const PeriodService = require('../services/period.service');
const LeaveBalanceService = require('../services/leaveBalance.service');
const OvertimeService = require('../services/overtime.service');
const SelfServiceService = require('../services/selfService.service');
const ReportBuilderService = require('../services/reportBuilder.service');
const PayrollService = require('../services/payroll.service');
const TwoFactorService = require('../services/twoFactor.service');
const ApiKeyService = require('../services/apiKey.service');
const AuditService = require('../services/audit.service');
const audit = require('../services/audit.service');

const router = express.Router();

// ===================================================================
//  1. OYLIK DAVR (tasdiqlash / yopish)
// ===================================================================
const periods = express.Router();

periods.get(
  '/',
  requirePermission('timesheets:read'),
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : null;
    res.ok(await PeriodService.list(year));
  })
);

periods.get(
  '/:year/:month',
  requirePermission('timesheets:read'),
  asyncHandler(async (req, res) => {
    const period = await PeriodService.getOrCreate(
      Number(req.params.year),
      Number(req.params.month)
    );
    const locked = await PeriodService.lockedPeriods();
    res.ok({ period, lockedPeriods: locked.map((p) => ({ year: p.year, month: p.month })) });
  })
);

periods.post(
  '/:year/:month/submit',
  requirePermission('timesheets:write'),
  asyncHandler(async (req, res) => {
    const period = await PeriodService.submit(Number(req.params.year), Number(req.params.month), {
      userId: req.user.id,
      note: req.body && req.body.note,
    });
    res.ok(period);
  })
);

periods.post(
  '/:year/:month/approve',
  requirePermission('timesheets:approve'),
  asyncHandler(async (req, res) => {
    const period = await PeriodService.approve(Number(req.params.year), Number(req.params.month), {
      userId: req.user.id,
      note: req.body && req.body.note,
    });
    res.ok(period);
  })
);

periods.post(
  '/:year/:month/lock',
  requirePermission('timesheets:approve'),
  asyncHandler(async (req, res) => {
    const result = await PeriodService.lock(Number(req.params.year), Number(req.params.month), {
      userId: req.user.id,
      note: req.body && req.body.note,
    });
    res.ok(result);
  })
);

periods.post(
  '/:year/:month/unlock',
  requirePermission('timesheets:approve'),
  asyncHandler(async (req, res) => {
    const period = await PeriodService.unlock(Number(req.params.year), Number(req.params.month), {
      userId: req.user.id,
      note: req.body && req.body.note,
    });
    res.ok(period);
  })
);

router.use('/periods', authenticate, periods);

// ===================================================================
//  2. TA'TIL BALANSI
// ===================================================================
const balances = express.Router();

balances.get(
  '/',
  requirePermission('leaves:read'),
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;

    if (employeeId) {
      res.ok(await LeaveBalanceService.forEmployee(employeeId, year));
      return;
    }
    res.ok(
      await LeaveBalanceService.table(
        year,
        req.query.departmentId ? Number(req.query.departmentId) : null
      )
    );
  })
);

balances.put(
  '/',
  requirePermission('leaves:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        employeeId: z.coerce.number().int().positive(),
        leaveTypeId: z.coerce.number().int().positive(),
        year: z.coerce.number().int().min(2000).max(2100),
        entitledDays: z.coerce.number().int().min(0).max(365).optional(),
        carriedOver: z.coerce.number().int().min(0).max(365).optional(),
        note: z.string().max(255).optional(),
      })
      .parse(req.body || {});

    const balance = await LeaveBalanceService.set(
      data.employeeId,
      data.leaveTypeId,
      data.year,
      data
    );
    res.ok(balance);
  })
);

balances.post(
  '/seed-year',
  requirePermission('leaves:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100),
        defaultDays: z.coerce.number().int().min(0).max(365).default(14),
        leaveTypeIds: z.array(z.coerce.number().int().positive()).default([]),
      })
      .parse(req.body || {});

    const result = await LeaveBalanceService.seedYear(data.year, {
      defaultDays: data.defaultDays,
      leaveTypeIds: data.leaveTypeIds,
      userId: req.user.id,
    });
    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave_balance.seed_year',
      entity: 'leave_balances',
      after: result,
    });
    res.ok(result);
  })
);

router.use('/balances', authenticate, balances);

// ===================================================================
//  3. QO'SHIMCHA ISH VAQTI (OVERTIME)
// ===================================================================
const overtime = express.Router();

overtime.get(
  '/',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);

    if (req.query.employeeId) {
      res.ok(await OvertimeService.summary(Number(req.query.employeeId), year, month));
      return;
    }
    res.ok(
      await OvertimeService.monthlyTable(
        year,
        month,
        req.query.departmentId ? Number(req.query.departmentId) : null
      )
    );
  })
);

overtime.post(
  '/',
  requirePermission('attendance:adjust'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        employeeId: z.coerce.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        minutes: z.coerce.number().int().min(1).max(1440),
        kind: z.enum(['regular', 'night', 'holiday', 'weekend']).default('regular'),
        multiplier: z.coerce.number().int().min(1).max(5).optional(),
        note: z.string().max(255).optional(),
      })
      .parse(req.body || {});

    const record = await OvertimeService.create({ ...data, userId: req.user.id });
    res.created(record);
  })
);

overtime.delete(
  '/:id',
  requirePermission('attendance:adjust'),
  asyncHandler(async (req, res) => {
    res.ok(await OvertimeService.remove(req.params.id, { userId: req.user.id }));
  })
);

router.use('/overtime', authenticate, overtime);

// ===================================================================
//  4. TASDIQLASHGA SO'ROVLAR
// ===================================================================
const requests = express.Router();

requests.get(
  '/',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);

    const rows = await AttendanceRequest.findAll({
      where,
      include: [{ model: Employee, required: false }],
      order: [['id', 'DESC']],
      limit: 200,
    });
    res.list(rows, { total: rows.length });
  })
);

requests.post(
  '/:id/review',
  requirePermission('attendance:adjust'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        status: z.enum(['approved', 'rejected']),
        comment: z.string().max(500).optional(),
      })
      .parse(req.body || {});

    const request = await SelfServiceService.reviewRequest(req.params.id, {
      ...data,
      userId: req.user.id,
    });
    res.ok(request);
  })
);

router.use('/requests', authenticate, requests);

// ===================================================================
//  5. BIOMETRIK ROZILIK REGISTRI
// ===================================================================
const consents = express.Router();

consents.get(
  '/',
  requirePermission('employees:read'),
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);

    const rows = await Consent.findAll({
      where,
      include: [{ model: Employee, required: false }],
      order: [['id', 'DESC']],
    });
    res.list(rows, { total: rows.length });
  })
);

consents.post(
  '/',
  requirePermission('employees:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        employeeId: z.coerce.number().int().positive(),
        kind: z.enum(['biometric', 'photo', 'location', 'other']).default('biometric'),
        documentNo: z.string().max(100).optional(),
        givenAt: z.string().optional(),
        expiresAt: z.string().nullable().optional(),
        signaturePath: z.string().max(255).optional(),
        note: z.string().max(500).optional(),
      })
      .parse(req.body || {});

    const [record] = await Consent.create({
      ...data,
      givenAt: data.givenAt ? new Date(data.givenAt) : new Date(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      createdBy: req.user.id,
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'consent.create',
      entity: 'consents',
      entityId: record.id,
      after: { employeeId: data.employeeId, kind: data.kind, documentNo: data.documentNo },
    });

    res.created(record);
  })
);

consents.post(
  '/:id/revoke',
  requirePermission('employees:write'),
  asyncHandler(async (req, res) => {
    const record = await Consent.findByPk(req.params.id);
    if (!record) throw notFound('Rozilik topilmadi');
    await record.update({ revokedAt: new Date() });
    await audit.record({
      ...audit.contextFromReq(req),
      action: 'consent.revoke',
      entity: 'consents',
      entityId: record.id,
      after: { revokedAt: record.revokedAt },
    });
    res.ok(record);
  })
);

router.use('/consents', authenticate, consents);

// ===================================================================
//  6. XODIMNING O'Z PANELI (self-service)
// ===================================================================
const my = express.Router();

my.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({
      where: { terminalUserId: req.user.username },
    });
    if (!employee) {
      throw badRequest("Sizning hisobingizga xodim biriktirilmagan. HR bilan bog'laning.");
    }
    res.ok(await SelfServiceService.myProfile(employee.id));
  })
);

my.get(
  '/balances',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ where: { terminalUserId: req.user.username } });
    if (!employee) throw badRequest('Xodim biriktirilmagan');
    res.ok(await SelfServiceService.myBalances(employee.id));
  })
);

my.get(
  '/overtime',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ where: { terminalUserId: req.user.username } });
    if (!employee) throw badRequest('Xodim biriktirilmagan');
    res.ok(
      await SelfServiceService.myOvertime(
        employee.id,
        Number(req.query.year || new Date().getFullYear()),
        Number(req.query.month || new Date().getMonth() + 1)
      )
    );
  })
);

my.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ where: { terminalUserId: req.user.username } });
    if (!employee) throw badRequest('Xodim biriktirilmagan');
    res.ok(await SelfServiceService.myRequests(employee.id));
  })
);

my.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ where: { terminalUserId: req.user.username } });
    if (!employee) throw badRequest('Xodim biriktirilmagan');

    const data = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        requestedIn: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        requestedOut: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        reason: z.string().min(3).max(500),
      })
      .parse(req.body || {});

    const request = await SelfServiceService.createRequest(employee.id, data);
    res.created(request);
  })
);

router.use('/my', authenticate, my);

// ===================================================================
//  7. HISOBOT KONSTRUKTORI
// ===================================================================
const builder = express.Router();

builder.get(
  '/columns',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    res.ok(ReportBuilderService.columns);
  })
);

builder.get(
  '/data',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        employeeId: z.coerce.number().int().optional(),
        departmentId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        columns: z.string().optional(),
      })
      .parse(req.query);

    const result = await ReportBuilderService.build({
      ...q,
      columns: q.columns ? q.columns.split(',') : null,
    });
    res.ok(result);
  })
);

builder.get(
  '/templates',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    res.ok(await ReportBuilderService.listTemplates(req.user.id));
  })
);

builder.post(
  '/templates',
  requirePermission('reports:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().min(2).max(150),
        description: z.string().max(500).optional(),
        type: z.string().max(30).optional(),
        columns: z.array(z.string()).optional(),
        filters: z.record(z.any()).optional(),
        isPublic: z.boolean().optional(),
      })
      .parse(req.body || {});

    const template = await ReportBuilderService.saveTemplate({ ...data, userId: req.user.id });
    res.created(template);
  })
);

builder.delete(
  '/templates/:id',
  requirePermission('reports:write'),
  asyncHandler(async (req, res) => {
    res.ok(await ReportBuilderService.deleteTemplate(req.params.id, req.user.id));
  })
);

builder.get(
  '/monthly',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);
    res.ok(
      await ReportBuilderService.monthlyRows({
        year,
        month,
        departmentId: req.query.departmentId ? Number(req.query.departmentId) : null,
      })
    );
  })
);

router.use('/report-builder', authenticate, builder);

// ===================================================================
//  8. PAYROLL (hisob-chek)
// ===================================================================
const payroll = express.Router();

payroll.get(
  '/',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);
    const rates = {
      baseRate: req.query.baseRate ? Number(req.query.baseRate) : undefined,
      overtimeRate: req.query.overtimeRate ? Number(req.query.overtimeRate) : undefined,
      latePenaltyPerMinute: req.query.latePenalty ? Number(req.query.latePenalty) : undefined,
      absenceDeductionPerDay: req.query.absenceDeduction
        ? Number(req.query.absenceDeduction)
        : undefined,
    };
    res.ok(
      await PayrollService.monthly({
        year,
        month,
        rates,
        departmentId: req.query.departmentId ? Number(req.query.departmentId) : null,
      })
    );
  })
);

payroll.get(
  '/matrix',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);
    res.ok(
      await PayrollService.matrix({
        year,
        month,
        departmentId: req.query.departmentId ? Number(req.query.departmentId) : null,
      })
    );
  })
);

router.use('/payroll', authenticate, payroll);

// ===================================================================
//  9. XAVFSIZLIK: 2FA, API kalitlari, audit zanjiri
// ===================================================================
const security = express.Router();

// --- 2FA ---
security.post(
  '/2fa/setup',
  asyncHandler(async (req, res) => {
    const secret = TwoFactorService.generateSecret();
    await req.user.update({ twoFactorPending: TwoFactorService.encrypt(secret) });
    res.ok({
      secret,
      otpauthUrl: TwoFactorService.otpauthUrl(secret, req.user.username),
      backupCodes: TwoFactorService.backupCodes(),
    });
  })
);

security.post(
  '/2fa/enable',
  asyncHandler(async (req, res) => {
    const data = z.object({ code: z.string().min(6).max(10) }).parse(req.body || {});

    const secret = TwoFactorService.decrypt(req.user.twoFactorPending);
    if (!secret) throw badRequest('2FA sozlanmagan');

    if (!TwoFactorService.verify(secret, data.code)) {
      throw badRequest("Kod noto'g'ri");
    }

    await req.user.update({
      twoFactorSecret: TwoFactorService.encrypt(secret),
      twoFactorEnabled: true,
      twoFactorPending: null,
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'user.2fa_enable',
      entity: 'users',
      entityId: req.user.id,
    });

    res.ok({ enabled: true });
  })
);

security.post(
  '/2fa/disable',
  asyncHandler(async (req, res) => {
    const data = z.object({ password: z.string().min(1) }).parse(req.body || {});

    const bcrypt = require('bcryptjs');
    const user = await User.findByPk(req.user.id);
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw badRequest("Parol noto'g'ri");

    await user.update({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorPending: null,
    });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'user.2fa_disable',
      entity: 'users',
      entityId: user.id,
    });

    res.ok({ enabled: false });
  })
);

// --- API kalitlari ---
security.get(
  '/api-keys',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const list = await ApiKeyService.list();
    res.list(
      list.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        revokedAt: k.revokedAt,
        createdAt: k.createdAt,
      })),
      { total: list.length }
    );
  })
);

security.post(
  '/api-keys',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().min(2).max(100),
        scopes: z.array(z.string()).optional(),
        expiresAt: z.string().nullable().optional(),
      })
      .parse(req.body || {});

    const { record, plainKey } = await ApiKeyService.create({
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      userId: req.user.id,
    });

    res.created({
      id: record.id,
      name: record.name,
      key: plainKey,
      warning: "Bu kalit faqat bir marta ko'rsatiladi — darhol saqlang",
    });
  })
);

security.delete(
  '/api-keys/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    res.ok(await ApiKeyService.revoke(req.params.id, { userId: req.user.id }));
  })
);

// --- Audit zanjiri tekshiruvi ---
security.get(
  '/audit/verify',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    res.ok(await AuditService.verifyChain(Number(req.query.limit || 5000)));
  })
);

router.use('/security', authenticate, security);

// ===================================================================
//  10. METRIKALAR (Prometheus) — autentifikatsiyasiz
// ===================================================================
router.get('/metrics', async (req, res) => {
  const MetricsService = require('../services/metrics.service');
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(await MetricsService.render());
});

module.exports = router;
