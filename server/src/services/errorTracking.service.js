'use strict';

const { Op } = require('sequelize');
const { ErrorLog } = require('../models');
const logger = require('../config/logger');

/**
 * Xato kuzatuvi — serverdagi 500 xatolar bazaga yoziladi
 * (admin panel → Sozlamalar → Xatolar).
 */
class ErrorTracking {
  /**
   * @param {Error} err
   * @param {object} context { req, userId, path, method, ip, code }
   */
  static async capture(err, context = {}) {
    try {
      await ErrorLog.create({
        level: context.level || 'error',
        message: (err && err.message) || String(err),
        stack: err && err.stack ? err.stack : null,
        code: context.code || (err && err.code) || null,
        path: context.path || null,
        method: context.method || null,
        userId: context.userId || null,
        ipAddress: context.ip || null,
        context: context.meta || null,
      });
    } catch (e) {
      logger.error('Xato bazaga yozilmadi:', e.message);
    }
  }

  /**
   * Oxirgi xatolar ro'yxati.
   */
  static async list({ level, dateFrom, dateTo, page = 1, limit = 50 } = {}) {
    const where = {};
    if (level) where.level = level;
    if (dateFrom) where.createdAt = { [Op.gte]: new Date(`${dateFrom}T00:00:00`) };
    if (dateTo) {
      where.createdAt = where.createdAt || {};
      where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59`);
    }

    const { rows, count } = await ErrorLog.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return { rows, count };
  }

  /**
   * Statistika (ko'p uchraydigan xatolar).
   */
  static async stats(days = 7) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await ErrorLog.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ['message', 'path', 'level'],
    });

    const byMessage = new Map();
    for (const row of rows) {
      const key = (row.message || '').slice(0, 160);
      byMessage.set(key, (byMessage.get(key) || 0) + 1);
    }

    return {
      total: rows.length,
      top: Array.from(byMessage.entries())
        .map(([message, count]) => ({ message, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  /**
   * Eski xatolarni tozalash.
   */
  static async cleanup(keepDays = 30) {
    const before = new Date(Date.now() - keepDays * 86400000);
    const deleted = await ErrorLog.destroy({ where: { createdAt: { [Op.lt]: before } } });
    return deleted;
  }
}

module.exports = ErrorTracking;
