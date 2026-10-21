'use strict';

const express = require('express');
const { z } = require('zod');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission } = require('../middlewares/auth');
const ReportService = require('../services/report.service');
const T = require('../utils/time');
const { badRequest } = require('../utils/errors');

const router = express.Router();

const filterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  departmentId: z.coerce.number().int().optional(),
  employeeId: z.coerce.number().int().optional(),
  status: z.string().optional(),
});

function resolveRange(query) {
  const q = filterSchema.parse(query);
  const dateFrom = q.dateFrom || T.addDays(T.today(), -30);
  const dateTo = q.dateTo || T.today();
  if (dateFrom > dateTo) throw badRequest("dateFrom dateTo dan katta bo'lmasligi kerak");
  return { ...q, dateFrom, dateTo };
}

/**
 * GET /api/reports/summary
 */
router.get(
  '/summary',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const stats = await ReportService.summary(filters);
    res.ok(stats);
  })
);

/**
 * GET /api/reports/daily
 */
router.get(
  '/daily',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const rows = await ReportService.dailyRows(filters);
    res.list(rows, { total: rows.length, ...filters });
  })
);

/**
 * GET /api/reports/late — kechikganlar
 */
router.get(
  '/late',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const rows = await ReportService.dailyRows({ ...filters, status: 'late' });
    res.list(rows, { total: rows.length });
  })
);

/**
 * GET /api/reports/absent — kelmaganlar
 */
router.get(
  '/absent',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const rows = await ReportService.dailyRows({ ...filters, status: 'absent' });
    res.list(rows, { total: rows.length });
  })
);

/**
 * GET /api/reports/incomplete — "tuzatish kerak" ro'yxati
 */
router.get(
  '/incomplete',
  requirePermission('reports:read'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const rows = await ReportService.dailyRows({ ...filters, status: 'incomplete' });
    res.list(rows, { total: rows.length });
  })
);

/**
 * GET /api/reports/export/daily.xlsx
 */
router.get(
  '/export/daily.xlsx',
  requirePermission('reports:export'),
  asyncHandler(async (req, res) => {
    const filters = resolveRange(req.query);
    const filename = `tabel_${filters.dateFrom}_${filters.dateTo}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await ReportService.exportDailyXlsx(res, filters);
  })
);

/**
 * GET /api/reports/export/timesheet.xlsx?year=&month=
 */
router.get(
  '/export/timesheet.xlsx',
  requirePermission('reports:export'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
        departmentId: z.coerce.number().int().optional(),
      })
      .parse(req.query);

    const filename = `oylik_tabel_${q.year}_${String(q.month).padStart(2, '0')}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await ReportService.exportTimesheetXlsx(res, q);
  })
);

/**
 * GET /api/reports/export/timesheet.pdf?year=&month=
 */
router.get(
  '/export/timesheet.pdf',
  requirePermission('reports:export'),
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        year: z.coerce.number().int().min(2000).max(2100),
        month: z.coerce.number().int().min(1).max(12),
        departmentId: z.coerce.number().int().optional(),
      })
      .parse(req.query);

    const filename = `oylik_tabel_${q.year}_${String(q.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await ReportService.exportTimesheetPdf(res, q);
  })
);

module.exports = router;
