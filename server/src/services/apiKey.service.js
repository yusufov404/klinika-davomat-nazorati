'use strict';

const crypto = require('crypto');
const { ApiKey } = require('../models');
const audit = require('./audit.service');

/**
 * Tashqi integratsiyalar uchun API kalitlari.
 * Kalit faqat hash ko'rinishida saqlanadi — to'liq qiymat bir marta ko'rsatiladi.
 */
class ApiKeyService {
  static PREFIX = 'kln';

  /**
   * Yangi kalit yaratish.
   * @returns {{ record, plainKey }}
   */
  static async create({ name, scopes = [], expiresAt = null, userId = null }) {
    const random = crypto.randomBytes(24).toString('hex');
    const plainKey = `${ApiKeyService.PREFIX}_${random}`;
    const keyPrefix = plainKey.slice(0, 12);

    const record = await ApiKey.create({
      name,
      keyPrefix,
      keyHash: ApiKeyService.hash(plainKey),
      scopes,
      expiresAt,
      createdBy: userId,
    });

    await audit.record({
      userId,
      action: 'api_key.create',
      entity: 'api_keys',
      entityId: record.id,
      after: { name, keyPrefix, scopes },
    });

    return { record, plainKey };
  }

  static hash(key) {
    return crypto.createHash('sha256').update(String(key)).digest('hex');
  }

  /**
   * Kalitni tekshirish (autentifikatsiya middleware uchun).
   */
  static async verify(plainKey) {
    if (!plainKey) return null;
    const record = await ApiKey.findOne({ where: { keyHash: ApiKeyService.hash(plainKey) } });
    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && new Date(record.expiresAt) < new Date()) return null;

    await record.update({ lastUsedAt: new Date() });
    return record;
  }

  static async revoke(id, { userId }) {
    const record = await ApiKey.findByPk(id);
    if (!record) throw new Error('Kalit topilmadi');
    await record.update({ revokedAt: new Date() });
    await audit.record({
      userId,
      action: 'api_key.revoke',
      entity: 'api_keys',
      entityId: id,
      after: { keyPrefix: record.keyPrefix },
    });
    return record;
  }

  static async list() {
    return ApiKey.findAll({ order: [['id', 'DESC']] });
  }
}

module.exports = ApiKeyService;
