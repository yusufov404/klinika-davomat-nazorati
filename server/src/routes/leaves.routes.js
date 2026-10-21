'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { z } = require('zod');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const { Employee, Leave, LeaveType, User } = require('../models');
const { leaveSchema } = require('../middlewares/validate');
const { notFound, badRequest } = require('../utils/errors');
const audit = require('../services/audit.service');
const attendanceService = require('../services/attendance.service');
const T = require('../utils/time');

const router = express.Router();

/**
 * GET /api/leaves
 */
router.get(
  '/',
  requirePermission('leaves:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        employeeId: z.coerce.number().int().optional(),
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const where = {};
    if (q.employeeId) where.employeeId = q.employeeId;
    if (q.status) where.status = q.status;
    if (q.dateFrom) where.endDate = { [Op.gte]: q.dateFrom };
    if (q.dateTo) where.startDate = { [Op.lte]: q.dateTo };

    const { rows, count } = await Leave.findAndCountAll({
      where,
      include: [
        { model: Employee, required: false },
        { model: LeaveType, required: false },
        { model: User, as: 'approver', required: false },
      ],
      order: [['startDate', 'DESC']],
      limit: q.limit,
      offset: (q.page - 1) * q.limit,
      distinct: true,
    });

    res.list(rows, { page: q.page, limit: q.limit, total: count });
  })
);

/**
 * POST /api/leaves
 */
router.post(
  '/',
  requirePermission('leaves:write'),
  asyncHandler(async (req, res) => {
    const data = leaveSchema.parse(req.body);
    if (data.endDate < data.startDate) {
      throw badRequest("Tugash sanasi boshlanish sanasidan oldin bo'lmasligi kerak");
    }

    const employee = await Employee.findByPk(data.employeeId);
    if (!employee) throw notFound('Xodim topilmadi');

    const leave = await Leave.create({ ...data, status: 'pending' });

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave.create',
      entity: 'leaves',
      entityId: leave.id,
      after: leave.toJSON(),
    });

    // Bildirishnoma (panel + Telegram)
    try {
      const NotificationService = require('../services/notification.service');
      const employee = await Employee.findByPk(data.employeeId);
      await NotificationService.notifyLeaveRequest(leave, employee ? employee.fullName : 'Xodim');
    } catch (e) {
      /* bildirishnoma xatosi asosiy operatsiyani buzmasin */
    }

    res.created(leave);
  })
);

/**
 * POST /api/leaves/:id/approve
 */
router.post(
  '/:id/approve',
  requirePermission('leaves:approve'),
  asyncHandler(async (req, res) => {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) throw notFound("Ta'til topilmadi");

    const before = leave.toJSON();
    await leave.update({
      status: 'approved',
      approvedBy: req.user.id,
      approvedAt: new Date(),
    });

    // Tasdiqlangan ta'til bo'yicha kunlar darhol qayta hisoblanadi
    let date = leave.startDate;
    while (date <= leave.endDate) {
      await attendanceService.calculateEmployeeDay(leave.employeeId, date);
      date = T.addDays(date, 1);
    }

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave.approve',
      entity: 'leaves',
      entityId: leave.id,
      before,
      after: leave.toJSON(),
    });

    res.ok(leave);
  })
);

/**
 * POST /api/leaves/:id/reject
 */
router.post(
  '/:id/reject',
  requirePermission('leaves:approve'),
  asyncHandler(async (req, res) => {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) throw notFound("Ta'til topilmadi");

    const before = leave.toJSON();
    await leave.update({
      status: 'rejected',
      approvedBy: req.user.id,
      approvedAt: new Date(),
      comment: req.body && req.body.comment ? req.body.comment : leave.comment,
    });

    let date = leave.startDate;
    while (date <= leave.endDate) {
      await attendanceService.calculateEmployeeDay(leave.employeeId, date);
      date = T.addDays(date, 1);
    }

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave.reject',
      entity: 'leaves',
      entityId: leave.id,
      before,
      after: leave.toJSON(),
    });

    res.ok(leave);
  })
);

/**
 * PUT /api/leaves/:id
 */
router.put(
  '/:id',
  requirePermission('leaves:write'),
  asyncHandler(async (req, res) => {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) throw notFound("Ta'til topilmadi");

    const data = leaveSchema.partial().parse(req.body);
    const before = leave.toJSON();
    await leave.update(data);

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave.update',
      entity: 'leaves',
      entityId: leave.id,
      before,
      after: leave.toJSON(),
    });

    res.ok(leave);
  })
);

/**
 * DELETE /api/leaves/:id
 */
router.delete(
  '/:id',
  requirePermission('leaves:write'),
  asyncHandler(async (req, res) => {
    const leave = await Leave.findByPk(req.params.id);
    if (!leave) throw notFound("Ta'til topilmadi");
    const before = leave.toJSON();
    await leave.destroy();

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'leave.delete',
      entity: 'leaves',
      entityId: before.id,
      before,
    });

    res.ok({ id: Number(req.params.id), deleted: true });
  })
);

module.exports = router;
