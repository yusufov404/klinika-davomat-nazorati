'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const { notFound, badRequest } = require('./errors');

/**
 * Umumiy CRUD router yaratuvchi.
 * Barcha asosiy ma'lumotlar (bo'lim, lavozim, smena, bayram, ta'til turi ...)
 * shu yordamchi orqali qisqa va bir xil usulda boshqariladi.
 *
 * @param {object} opts
 * @param {import('sequelize').Model} opts.model
 * @param {import('zod').ZodTypeAny} opts.schema
 * @param {string} opts.resource  "employees" kabi
 * @param {string[]} opts.searchFields
 * @param {Array} [opts.include]
 * @param {string[]} [opts.filterFields] query'dan filtrlash uchun
 * @param {object} [opts.hooks]
 */
function createCrudRouter(opts) {
  const {
    model,
    schema,
    resource,
    searchFields = [],
    include = [],
    filterFields = [],
    order = [['id', 'ASC']],
    hooks = {},
    basePath = '',
  } = opts;

  const router = express.Router();

  // ---------- LIST ----------
  router.get(
    basePath,
    requirePermission(`${resource}:read`),
    asyncHandler(async (req, res) => {
      const { page = 1, limit = 50, q, ...rest } = req.query;
      const where = {};

      if (q && searchFields.length) {
        const like = { [Op.iLike]: `%${q}%` };
        where[Op.or] = searchFields.map((f) => ({ [f]: like }));
      }

      for (const field of filterFields) {
        if (rest[field] !== undefined && rest[field] !== '') {
          where[field] = rest[field];
        }
      }

      const { rows, count } = await model.findAndCountAll({
        where,
        include,
        order,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        distinct: true,
      });

      res.list(rows, {
        page: Number(page),
        limit: Number(limit),
        total: count,
        totalPages: Math.ceil(count / Number(limit)),
      });
    })
  );

  // ---------- GET ONE ----------
  router.get(
    `${basePath}/:id`,
    requirePermission(`${resource}:read`),
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id, { include });
      if (!row) throw notFound('Topilmadi');
      res.ok(row);
    })
  );

  // ---------- CREATE ----------
  router.post(
    basePath,
    requirePermission(`${resource}:write`),
    asyncHandler(async (req, res) => {
      const data = schema.parse(req.body);
      if (hooks.beforeCreate) await hooks.beforeCreate(data, req);
      const row = await model.create(data);
      if (hooks.afterCreate) await hooks.afterCreate(row, req);
      const fresh = await model.findByPk(row.id, { include });
      res.created(fresh);
    })
  );

  // ---------- UPDATE ----------
  router.put(
    `${basePath}/:id`,
    requirePermission(`${resource}:write`),
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id);
      if (!row) throw notFound('Topilmadi');

      const data = schema.partial().parse(req.body);
      if (hooks.beforeUpdate) await hooks.beforeUpdate(data, row, req);

      const before = row.toJSON();
      await row.update(data);
      if (hooks.afterUpdate) await hooks.afterUpdate(row, before, req);

      const fresh = await model.findByPk(row.id, { include });
      res.ok(fresh);
    })
  );

  // ---------- DELETE ----------
  router.delete(
    `${basePath}/:id`,
    requirePermission(`${resource}:write`),
    asyncHandler(async (req, res) => {
      const row = await model.findByPk(req.params.id);
      if (!row) throw notFound('Topilmadi');

      if (hooks.beforeDelete) {
        const veto = await hooks.beforeDelete(row, req);
        if (veto) throw badRequest(veto);
      }

      const before = row.toJSON();
      await row.destroy();
      if (hooks.afterDelete) await hooks.afterDelete(before, req);
      res.ok({ id: Number(req.params.id), deleted: true });
    })
  );

  return router;
}

module.exports = { createCrudRouter };
