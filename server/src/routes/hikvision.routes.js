'use strict';

const express = require('express');
const multer = require('multer');
const { asyncHandler } = require('../middlewares/errorHandler');
const { requirePermission, authenticate } = require('../middlewares/auth');
const { terminalIpAllowlist, terminalToken } = require('../middlewares/terminalAuth');
const { eventLimiter } = require('../middlewares/rateLimit');
const IngestService = require('../services/ingest.service');
const logger = require('../config/logger');
const config = require('../config');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFaceSizeMb * 1024 * 1024, files: 5 },
});

/**
 * POST /api/hikvision/events
 * Terminal eventlar qabul qilish (asosiy yo'l - push).
 *
 * Terminal yuboradigan formatlar:
 *   - application/json
 *   - multipart/form-data (packetInfo maydoni JSON)
 *   - application/x-www-form-urlencoded
 *
 * Javob darhol 200 qaytariladi (og'ir hisob keyin bajariladi).
 */
router.post(
  '/events',
  eventLimiter,
  upload.any(),
  terminalToken,
  terminalIpAllowlist,
  asyncHandler(async (req, res) => {
    let payload = req.body;

    // multipart/form-data: packetInfo maydonida JSON
    if (req.files && req.files.length) {
      payload = { ...req.body };
      if (req.body.packetInfo) {
        try {
          payload = { ...payload, ...JSON.parse(req.body.packetInfo) };
        } catch (e) {
          logger.warn('packetInfo JSON parse xatosi');
        }
      }
    }

    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        payload = req.body;
      }
    }

    // Hech narsa kelmagan bo'lsa - yana urinishga majbur qilmaslik uchun 200
    if (!payload || (typeof payload === 'object' && !Object.keys(payload).length)) {
      return res.status(200).json({ success: true, data: { status: 'empty' } });
    }

    const result = await IngestService.ingest({
      payload,
      sourceIp: req.ip || req.socket.remoteAddress,
      source: 'push',
    });

    if (result.status === 'created') {
      // Og'ir hisob navbatda (ketma-ket, parallel emas)
      enqueueCalculation(result.employeeId, result.logTime);
    }

    res.status(200).json({ success: true, data: result });
  })
);

/**
 * Davomat hisobini navbatga qo'yish (ketma-ket bajariladi).
 * Parallel hisoblash PostgreSQL'ni ortiqcha yuklaydi va
 * "prepared statement does not exist" xatolarini keltirib chiqaradi.
 */
let calcQueue = Promise.resolve();

function enqueueCalculation(employeeId, logTime) {
  const attendanceService = require('../services/attendance.service');
  const T = require('../utils/time');

  calcQueue = calcQueue
    .then(async () => {
      const dateKey = T.dateKey(new Date(logTime));
      await attendanceService.calculateEmployeeDay(employeeId, dateKey);
      // Tungi smena uchun keyingi kun ham tekshiriladi
      await attendanceService.calculateEmployeeDay(employeeId, T.addDays(dateKey, 1));
    })
    .catch((err) => logger.error('Hisoblash xatosi:', err.message));
}

/**
 * GET /api/hikvision/status — terminal ulanish holati (diagnostika).
 */
router.get(
  '/status',
  authenticate,
  requirePermission('terminals:read'),
  asyncHandler(async (req, res) => {
    const TerminalService = require('../services/terminal.service');
    const results = await TerminalService.checkAll();
    res.ok(results);
  })
);

module.exports = router;
