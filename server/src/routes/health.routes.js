'use strict';

const express = require('express');
const { asyncHandler } = require('../middlewares/errorHandler');
const { sequelize, Terminal } = require('../models');
const T = require('../utils/time');

const router = express.Router();

/**
 * GET /api/health — server, baza va terminallar holati.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const started = Date.now();
    let dbOk = false;
    let dbError = null;
    try {
      await sequelize.authenticate();
      dbOk = true;
    } catch (err) {
      dbError = err.message;
    }

    const terminals = await Terminal.findAll({ where: { isActive: true } }).catch(() => []);
    const offline = terminals.filter((t) => t.status === 'offline');
    const timeDrift = terminals
      .filter(
        (t) => t.lastSeenAt && Math.abs(Date.now() - new Date(t.lastSeenAt).getTime()) > 300000
      )
      .map((t) => t.name);

    const health = {
      status: dbOk ? (offline.length ? 'degraded' : 'ok') : 'error',
      serverTime: new Date().toISOString(),
      timezone: T.TZ,
      uptimeSeconds: Math.round(process.uptime()),
      responseMs: Date.now() - started,
      database: { ok: dbOk, error: dbError },
      terminals: {
        total: terminals.length,
        online: terminals.length - offline.length,
        offline: offline.map((t) => ({
          id: t.id,
          name: t.name,
          ip: t.ipAddress,
          lastSeenAt: t.lastSeenAt,
        })),
        stale: timeDrift,
      },
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };

    res.status(dbOk ? 200 : 503).json({ success: dbOk, data: health });
  })
);

module.exports = router;
