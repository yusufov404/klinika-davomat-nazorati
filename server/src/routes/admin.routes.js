'use strict';

const express = require('express');
const { z } = require('zod');
const { createCrudRouter } = require('../utils/crud');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const {
  departmentSchema,
  positionSchema,
  shiftSchema,
  scheduleSchema,
  holidaySchema,
  leaveTypeSchema,
  dateStr,
} = require('../middlewares/validate');
const {
  Department,
  Position,
  Shift,
  EmployeeSchedule,
  Holiday,
  LeaveType,
  Employee,
  User,
  Role,
  RolePermission,
  AuditLog,
} = require('../models');
const { resolvePermissions } = require('../config/rbac');
const audit = require('../services/audit.service');
const { notFound } = require('../utils/errors');

/**
 * Boshqaruv route'lari. Har bir modul alohida router sifatida eksport qilinadi
 * (routes/index.js da alohida autentifikatsiya bilan ulanadi).
 */

// ---------- Bo'limlar ----------
const departments = createCrudRouter({
  model: Department,
  schema: departmentSchema,
  resource: 'departments',
  searchFields: ['name'],
  include: [{ model: Employee, as: 'head', required: false }],
  order: [['name', 'ASC']],
  basePath: '',
});

// ---------- Lavozimlar ----------
const positions = createCrudRouter({
  model: Position,
  schema: positionSchema,
  resource: 'positions',
  searchFields: ['name'],
  order: [['name', 'ASC']],
  basePath: '',
});

// ---------- Smenalar ----------
const shifts = createCrudRouter({
  model: Shift,
  schema: shiftSchema,
  resource: 'shifts',
  searchFields: ['name'],
  order: [['id', 'ASC']],
  basePath: '',
});

// ---------- Grafiklar ----------
const schedules = createCrudRouter({
  model: EmployeeSchedule,
  schema: scheduleSchema,
  resource: 'schedules',
  searchFields: [],
  filterFields: ['employeeId', 'shiftId'],
  include: [
    { model: Employee, required: false },
    { model: Shift, as: 'Shift', required: false },
  ],
  order: [
    ['employeeId', 'ASC'],
    ['priority', 'ASC'],
  ],
  basePath: '',
});

// ---------- Bayramlar ----------
const holidays = createCrudRouter({
  model: Holiday,
  schema: holidaySchema,
  resource: 'holidays',
  searchFields: ['name'],
  order: [['date', 'ASC']],
  basePath: '',
});

// ---------- Ta'til turlari ----------
const leaveTypes = createCrudRouter({
  model: LeaveType,
  schema: leaveTypeSchema,
  resource: 'leave-types',
  searchFields: ['name'],
  order: [['id', 'ASC']],
  basePath: '',
});

// ---------- Tizim foydalanuvchilari ----------
const users = express.Router();

const userSchema = z.object({
  username: z.string().min(3).max(100),
  password: z.string().min(6).max(100),
  fullName: z.string().min(3).max(200),
  roleId: z.coerce.number().int().positive(),
  isActive: z.boolean().optional(),
});

users.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const list = await User.findAll({ include: [{ model: Role }], order: [['id', 'ASC']] });
    res.list(list, { total: list.length });
  })
);

users.post(
  '/',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const data = userSchema.parse(req.body);
    const bcrypt = require('bcryptjs');
    const user = await User.create({
      username: data.username,
      fullName: data.fullName,
      roleId: data.roleId,
      isActive: data.isActive !== false,
      passwordHash: await bcrypt.hash(data.password, 12),
    });
    await audit.record({
      ...audit.contextFromReq(req),
      action: 'user.create',
      entity: 'users',
      entityId: user.id,
      after: { id: user.id, username: user.username, roleId: user.roleId },
    });
    res.created(user);
  })
);

users.put(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw notFound('Foydalanuvchi topilmadi');

    const data = userSchema.partial().parse(req.body);
    const before = {
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      isActive: user.isActive,
    };

    if (data.password) {
      const bcrypt = require('bcryptjs');
      data.passwordHash = await bcrypt.hash(data.password, 12);
      delete data.password;
    }
    await user.update(data);

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'user.update',
      entity: 'users',
      entityId: user.id,
      before,
      after: {
        username: user.username,
        fullName: user.fullName,
        roleId: user.roleId,
        isActive: user.isActive,
      },
    });
    res.ok(user);
  })
);

// ---------- Audit log ----------
const auditLogs = express.Router();

auditLogs.get(
  '/',
  requirePermission('audit:read'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        entity: z.string().optional(),
        action: z.string().optional(),
        userId: z.coerce.number().int().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);

    const { Op } = require('sequelize');
    const where = {};
    if (q.entity) where.entity = q.entity;
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = q.userId;
    if (q.dateFrom) where.createdAt = { [Op.gte]: new Date(`${q.dateFrom}T00:00:00`) };
    if (q.dateTo) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.lte] = new Date(`${q.dateTo}T23:59:59`);
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, required: false }],
      order: [['id', 'DESC']],
      limit: q.limit,
      offset: (q.page - 1) * q.limit,
      distinct: true,
    });

    res.list(rows, { page: q.page, limit: q.limit, total: count });
  })
);

// ---------- Grafiklar (bulk) ----------
const schedulesBulk = express.Router();

schedulesBulk.post(
  '/',
  requirePermission('schedules:write'),
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        employeeIds: z
          .array(z.coerce.number().int().positive())
          .min(1, 'Kamida 1 ta xodim tanlang'),
        shiftId: z.coerce.number().int().positive(),
        validFrom: dateStr,
        validTo: dateStr.nullish(),
        weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
        departmentId: z.coerce.number().int().nullish(),
        skipExisting: z.boolean().default(true),
      })
      .parse(req.body || {});

    const { EmployeeSchedule, Employee, Shift } = require('../models');
    const shift = await Shift.findByPk(data.shiftId);
    if (!shift) throw notFound('Smena topilmadi');

    // Bo'lim bo'yicha tanlangan bo'lsa — uning xodimlarini olamiz
    let employeeIds = data.employeeIds;
    if (data.departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId: data.departmentId, isActive: true },
        attributes: ['id'],
      });
      employeeIds = Array.from(new Set([...employeeIds, ...employees.map((e) => e.id)]));
    }

    let created = 0;
    let skipped = 0;

    for (const employeeId of employeeIds) {
      if (data.skipExisting) {
        const existing = await EmployeeSchedule.findOne({
          where: {
            employeeId,
            shiftId: data.shiftId,
            validFrom: data.validFrom,
          },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
      }
      await EmployeeSchedule.create({
        employeeId,
        shiftId: data.shiftId,
        validFrom: data.validFrom,
        validTo: data.validTo || null,
        weekdays: data.weekdays,
        isActive: true,
      });
      created += 1;
    }

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'schedule.bulk_assign',
      entity: 'employee_schedules',
      after: { created, skipped, shiftId: data.shiftId, count: employeeIds.length },
    });

    res.ok({ created, skipped, total: employeeIds.length, shift: shift.name });
  })
);

// ---------- Rollar va huquqlar ----------
const roles = express.Router();

const permissionSchema = z.object({
  permission: z.string().min(3).max(100),
  enabled: z.boolean().default(true),
});

roles.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const { ALL_PERMISSIONS, PERMISSIONS } = require('../config/rbac');
    const list = await Role.findAll({ order: [['id', 'ASC']] });

    const result = [];
    for (const role of list) {
      const rows = await RolePermission.findAll({ where: { roleId: role.id } });
      const effective = resolvePermissions(role.name, rows);
      result.push({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: Object.prototype.hasOwnProperty.call(PERMISSIONS, role.name),
        defaultPermissions: PERMISSIONS[role.name] || [],
        effectivePermissions: effective,
        overrides: rows.map((r) => ({ permission: r.permission, enabled: r.enabled })),
        userCount: await User.count({ where: { roleId: role.id } }),
      });
    }

    res.ok({
      roles: result,
      allPermissions: ALL_PERMISSIONS,
    });
  })
);

roles.put(
  '/:id/permissions',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const role = await Role.findByPk(req.params.id);
    if (!role) throw notFound('Rol topilmadi');

    const data = z
      .object({
        permissions: z.array(permissionSchema).max(200),
      })
      .parse(req.body || {});

    const before = (await RolePermission.findAll({ where: { roleId: role.id } })).map((r) => ({
      permission: r.permission,
      enabled: r.enabled,
    }));

    // to'liq almashtirish
    await RolePermission.destroy({ where: { roleId: role.id } });
    for (const p of data.permissions) {
      await RolePermission.create({
        roleId: role.id,
        permission: p.permission,
        enabled: p.enabled,
      });
    }

    const rows = await RolePermission.findAll({ where: { roleId: role.id } });
    const effective = resolvePermissions(role.name, rows);

    await audit.record({
      ...audit.contextFromReq(req),
      action: 'role.permissions.update',
      entity: 'roles',
      entityId: role.id,
      before: { permissions: before },
      after: { permissions: data.permissions },
    });

    res.ok({
      id: role.id,
      name: role.name,
      effectivePermissions: effective,
      overrides: rows.map((r) => ({ permission: r.permission, enabled: r.enabled })),
    });
  })
);

module.exports = {
  departments,
  positions,
  shifts,
  schedules,
  schedulesBulk,
  holidays,
  leaveTypes,
  users,
  roles,
  auditLogs,
};
