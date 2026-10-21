'use strict';

const crypto = require('crypto');
const { AuditLog } = require('../models');
const logger = require('../config/logger');

/**
 * Audit log — o'zgartirilmaslik (tamper-evident) bilan.
 *
 * Har bir yozuv oldingisining hash'ini o'z ichiga oladi:
 *   hash = sha256(prev_hash + row_json)
 * Shu tariqa yozuvlarni o'zgartirish yoki o'chirish aniqlanadi.
 */
/**
 * Barqaror JSON (kalitlar tartiblanadi) — jsonb kalit tartibini saqlamaydi,
 * shuning uchun hash hisoblashida muhim.
 */
function stableStringify(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

class AuditService {
  /**
   * @param {object} opts
   * @param {number|null} opts.userId
   * @param {string} opts.action
   * @param {string} opts.entity
   * @param {string|number} opts.entityId
   * @param {object|null} opts.before
   * @param {object|null} opts.after
   * @param {string|null} opts.ipAddress
   */
  static async record({
    userId = null,
    action,
    entity,
    entityId = null,
    before = null,
    after = null,
    ipAddress = null,
    transaction = null,
  }) {
    try {
      const prevHash = await AuditService.lastHash();
      const createdAt = new Date();

      const payload = {
        userId,
        action,
        entity,
        entityId: entityId === null || entityId === undefined ? null : String(entityId),
        before: stableStringify(before),
        after: stableStringify(after),
        ipAddress,
        createdAt: createdAt.toISOString(),
        prevHash,
      };

      const hash = crypto
        .createHash('sha256')
        .update(prevHash + JSON.stringify(payload))
        .digest('hex');

      await AuditLog.create(
        {
          userId,
          action,
          entity,
          entityId: payload.entityId,
          before: before ? JSON.parse(JSON.stringify(before)) : null,
          after: after ? JSON.parse(JSON.stringify(after)) : null,
          ipAddress,
          hash,
          prevHash,
          createdAt,
          updatedAt: createdAt,
        },
        { transaction }
      );
    } catch (err) {
      // Audit yozilmasa asosiy operatsiya buzilmasin, lekin xato loglanadi
      logger.error('Audit log yozilmadi:', err.message);
    }
  }

  /**
   * Oxirgi yozuvning hash'i.
   */
  static async lastHash() {
    const last = await AuditLog.findOne({
      order: [['id', 'DESC']],
      attributes: ['hash'],
    });
    return last && last.hash ? last.hash : 'GENESIS';
  }

  /**
   * Zanjir butunligini tekshirish.
   * @returns {{ valid: boolean, brokenAt: number|null, checked: number }}
   */
  static async verifyChain(limit = 5000) {
    const rows = await AuditLog.findAll({
      order: [['id', 'ASC']],
      limit,
    });

    let prevHash = 'GENESIS';
    for (const row of rows) {
      const payload = {
        userId: row.userId,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        before: stableStringify(row.before),
        after: stableStringify(row.after),
        ipAddress: row.ipAddress,
        createdAt: new Date(row.createdAt).toISOString(),
        prevHash: row.prevHash || 'GENESIS',
      };
      const expected = crypto
        .createHash('sha256')
        .update((row.prevHash || 'GENESIS') + JSON.stringify(payload))
        .digest('hex');

      if ((row.prevHash || 'GENESIS') !== prevHash || expected !== row.hash) {
        return { valid: false, brokenAt: row.id, checked: rows.length };
      }
      prevHash = row.hash;
    }

    return { valid: true, brokenAt: null, checked: rows.length };
  }

  /** req dan foydalanuvchi va IP olish */
  static contextFromReq(req) {
    return {
      userId: req.user ? req.user.id : null,
      ipAddress: req.ip || null,
    };
  }
}

module.exports = AuditService;
