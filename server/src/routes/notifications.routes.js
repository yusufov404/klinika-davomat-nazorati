'use strict';

const express = require('express');
const { z } = require('zod');
const { Op } = require('sequelize');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const { Notification } = require('../models');
const SettingsService = require('../services/settings.service');
const NotificationService = require('../services/notification.service');
const ErrorTracking = require('../services/errorTracking.service');
const audit = require('../services/audit.service');
const { notFound } = require('../utils/errors');

const router = express.Router();

/**
 * GET /api/notifications — bildirishnomalar ro'yxati
 */
router.get(
  '/',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        unreadOnly: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {};
    // Foydalanuvchiga xos va barchaga tegishli
    where[Op.or] = [{ userId: req.user.id }, { userId: null }];
    if (q.unreadOnly === 'true') where.isRead = false;

    const rows = await Notification.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: q.limit,
    });

    const unread = await Notification.count({
      where: { ...where, isRead: false },
    });

    res.list(rows, { unread, total: rows.length });
  })
);

/**
 * POST /api/notifications/:id/read
 */
router.post(
  '/:id/read',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) throw notFound('Bildirishnoma topilmadi');
    await notification.update({ isRead: true });
    res.ok(notification);
  })
);

/**
 * POST /api/notifications/read-all
 */
router.post(
  '/read-all',
  requirePermission('attendance:read'),
  asyncHandler(async (req, res) => {
    const updated = await Notification.update(
      { isRead: true },
      { where: { userId: req.user.id, isRead: false } }
    );
    res.ok({ updated });
  })
);

// ===================================================================
//  Tizim sozlamalari (faqat superadmin)
// ===================================================================
const settings = express.Router();

settings.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const list = await SettingsService.forPanel();
    res.ok(list);
  })
);

settings.put(
  '/',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        settings: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
      })
      .parse(req.body || {});

    const before = await SettingsService.all();
    await SettingsService.setMany(data.settings, { userId: req.user.id });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'settings.update',
      entity: 'settings',
      before,
      after: await SettingsService.all(),
    });

    res.ok(await SettingsService.forPanel());
  })
);

/**
 * POST /api/settings/telegram/test — Telegram bilan bog'lanishni tekshirish
 */
settings.post(
  '/telegram/test',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const result = await NotificationService.testTelegram();
    if (!result.sent) {
      return res.status(400).json({
        success: false,
        error: { code: 'telegram_failed', message: result.reason || 'Telegram xabari yuborilmadi' },
      });
    }
    res.ok(result);
  })
);

router.use('/settings', settings);

// ===================================================================
//  Xatolar (error tracking)
// ===================================================================
//  Xatolar (error tracking)
// ===================================================================
const errors = express.Router();

errors.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        level: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const { rows, count } = await ErrorTracking.list(q);
    res.list(rows, { total: count, page: q.page, limit: q.limit });
  })
);

errors.get(
  '/stats',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    res.ok(await ErrorTracking.stats(7));
  })
);

errors.delete(
  '/cleanup',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const deleted = await ErrorTracking.cleanup(30);
    res.ok({ deleted });
  })
);

router.use('/errors', errors);

module.exports = router;
module.exports.settings = settings;
module.exports.errors = errors;
