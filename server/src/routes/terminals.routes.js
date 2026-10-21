'use strict';

const express = require('express');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const { terminalSchema } = require('../middlewares/validate');
const { Terminal, TerminalSyncJob } = require('../models');
const { encrypt } = require('../utils/crypto');
const { notFound } = require('../utils/errors');
const TerminalService = require('../services/terminal.service');
const SyncService = require('../services/sync.service');
const audit = require('../services/audit.service');
const { z } = require('zod');

const router = express.Router();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.string().optional(),
  isActive: z.string().optional(),
});

/**
 * GET /api/terminals
 */
router.get(
  '/',
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const { page, limit, status, isActive } = listSchema.parse(req.query);
    const where = {};
    if (status) where.status = status;
    if (isActive !== undefined && isActive !== '') where.isActive = isActive === 'true';

    const { rows, count } = await Terminal.findAndCountAll({
      where,
      order: [['name', 'ASC']],
      limit,
      offset: (page - 1) * limit,
    });

    // Parolni chiqarmaymiz
    const safe = rows.map((t) => {
      const json = t.toJSON();
      delete json.passwordEncrypted;
      return json;
    });

    res.list(safe, { page, limit, total: count });
  })
);

/**
 * GET /api/terminals/monitoring — terminallar monitoring paneli uchun
 * (/:id dan OLDIN bo'lishi shart)
 */
router.get(
  '/monitoring',
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const { Op } = require('sequelize');
    const { TerminalSyncJob, AttendanceLog } = require('../models');
    const terminals = await Terminal.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
    });

    const now = Date.now();
    const startOfDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tashkent' }));
    const items = [];

    for (const t of terminals) {
      const lastSeen = t.lastSeenAt ? new Date(t.lastSeenAt).getTime() : null;
      const ageMinutes = lastSeen ? Math.round((now - lastSeen) / 60000) : null;

      const [logsToday, pendingJobs, failedJobs] = await Promise.all([
        AttendanceLog.count({
          where: { terminalId: t.id, logTime: { [Op.gte]: startOfDay } },
        }),
        TerminalSyncJob.count({ where: { terminalId: t.id, status: 'pending' } }),
        TerminalSyncJob.count({ where: { terminalId: t.id, status: 'failed' } }),
      ]);

      items.push({
        id: t.id,
        name: t.name,
        ipAddress: t.ipAddress,
        port: t.port,
        direction: t.direction,
        status: t.status,
        serialNumber: t.serialNumber,
        lastSeenAt: t.lastSeenAt,
        lastSyncAt: t.lastSyncAt,
        ageMinutes,
        // 10 daqiqadan ko'p gap bo'lsa — muammoli
        stale: ageMinutes === null || ageMinutes > 10,
        logsToday,
        pendingJobs,
        failedJobs,
      });
    }

    const summary = {
      total: items.length,
      online: items.filter((i) => i.status === 'active' && !i.stale).length,
      offline: items.filter((i) => i.status !== 'active').length,
      stale: items.filter((i) => i.stale).length,
      pendingJobs: items.reduce((s, i) => s + i.pendingJobs, 0),
      failedJobs: items.reduce((s, i) => s + i.failedJobs, 0),
      logsToday: items.reduce((s, i) => s + i.logsToday, 0),
    };

    res.ok({ summary, terminals: items });
  })
);

/**
 * GET /api/terminals/:id
 */
router.get(
  '/:id',
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) throw notFound('Terminal topilmadi');
    const json = terminal.toJSON();
    delete json.passwordEncrypted;
    res.ok(json);
  })
);

/**
 * POST /api/terminals
 */
router.post(
  '/',
  requirePermission('terminals:write'),
  asyncHandler(async (req, res) => {
    const data = terminalSchema.parse(req.body);
    const terminal = await Terminal.create({
      ...data,
      passwordEncrypted: encrypt(data.password),
    });
    delete terminal.passwordEncrypted;

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'terminal.create',
      entity: 'terminals',
      entityId: terminal.id,
      after: { ...terminal.toJSON() },
    });

    res.created(terminal);
  })
);

/**
 * PUT /api/terminals/:id
 */
router.put(
  '/:id',
  requirePermission('terminals:write'),
  asyncHandler(async (req, res) => {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) throw notFound('Terminal topilmadi');

    const data = terminalSchema.partial().parse(req.body);
    const before = terminal.toJSON();
    delete before.passwordEncrypted;

    if (data.password) {
      data.passwordEncrypted = encrypt(data.password);
      delete data.password;
    }

    await terminal.update(data);

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'terminal.update',
      entity: 'terminals',
      entityId: terminal.id,
      before,
      after: { ...terminal.toJSON(), passwordEncrypted: undefined },
    });

    const json = terminal.toJSON();
    delete json.passwordEncrypted;
    res.ok(json);
  })
);

/**
 * DELETE /api/terminals/:id
 */
router.delete(
  '/:id',
  requirePermission('terminals:write'),
  asyncHandler(async (req, res) => {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) throw notFound('Terminal topilmadi');
    const before = terminal.toJSON();
    delete before.passwordEncrypted;
    await terminal.destroy();

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'terminal.delete',
      entity: 'terminals',
      entityId: terminal.id,
      before,
    });

    res.ok({ id: Number(req.params.id), deleted: true });
  })
);

/**
 * POST /api/terminals/:id/test — ulanishni tekshirish
 */
router.post(
  '/:id/test',
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const result = await TerminalService.testConnection(req.params.id);
    res.ok(result);
  })
);

/**
 * POST /api/terminals/:id/notify — HTTP push konfiguratsiyasini o'rnatish
 */
router.post(
  '/:id/notify',
  requirePermission('terminals:write'),
  asyncHandler(async (req, res) => {
    const result = await TerminalService.configureNotification(
      req.params.id,
      req.body && req.body.publicUrl
    );
    res.ok(result);
  })
);

/**
 * POST /api/terminals/:id/sync — xodimlarni bu terminalga yuborish
 */
router.post(
  '/:id/sync',
  requirePermission('terminals:sync'),
  asyncHandler(async (req, res) => {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) throw notFound('Terminal topilmadi');

    const { Employee } = require('../models');
    const employees = await Employee.findAll({ where: { isActive: true } });
    for (const emp of employees) {
      await TerminalSyncJob.findOrCreate({
        where: { employeeId: emp.id, terminalId: terminal.id, action: 'add', status: 'pending' },
        defaults: { employeeId: emp.id, terminalId: terminal.id, action: 'add', status: 'pending' },
      });
    }

    const processed = await SyncService.processPending(100);
    res.ok({ queued: employees.length, processed });
  })
);

/**
 * GET /api/terminals/:id/sync-jobs
 */
router.get(
  '/:id/sync-jobs',
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const jobs = await TerminalSyncJob.findAll({
      where: { terminalId: req.params.id },
      order: [['id', 'DESC']],
      limit: 100,
    });
    res.list(jobs, { total: jobs.length });
  })
);

module.exports = router;
