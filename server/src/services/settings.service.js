'use strict';

const { Setting } = require('../models');
const logger = require('../config/logger');

/**
 * Tizim sozlamalari (kalit-qiymat) — 5 sekundli kesh bilan.
 */
const DEFAULTS = {
  'telegram.enabled': false,
  'telegram.botToken': '',
  'telegram.chatId': '',
  'notify.dailySummary': true,
  'notify.dailySummaryCron': '30 18 * * *',
  'notify.terminalOffline': true,
  'notify.leaveRequest': true,
  'notify.absentThreshold': 3,
  'clinic.name': 'Klinika',
  'clinic.timezone': 'Asia/Tashkent',
};

let cache = null;
let cacheTime = 0;
const TTL = 5000;

/**
 * Sozlamalar haqida ma'lumot (panelda ko'rsatish uchun).
 */
const SETTINGS_META = {
  'telegram.enabled': { type: 'boolean', description: 'Telegram orqali xabar yuborish' },
  'telegram.botToken': {
    type: 'string',
    description: 'Telegram bot tokeni (BotFather)',
    isSecret: true,
  },
  'telegram.chatId': { type: 'string', description: 'Xabar yuboriladigan chat ID' },
  'notify.dailySummary': { type: 'boolean', description: 'Har kuni kunlik hisobot yuborish' },
  'notify.dailySummaryCron': { type: 'string', description: 'Kunlik hisobot vaqti (cron)' },
  'notify.terminalOffline': { type: 'boolean', description: "Terminal offline bo'lganda xabar" },
  'notify.leaveRequest': { type: 'boolean', description: "Yangi ta'til so'rovi kelganda xabar" },
  'notify.absentThreshold': {
    type: 'number',
    description: 'Kelmaganlar chegarasi (ogohlantirish)',
  },
  'clinic.name': { type: 'string', description: 'Klinika nomi (hujjatlarda)' },
  'clinic.timezone': { type: 'string', description: 'Vaqt zonasi' },
};

class SettingsService {
  /**
   * Barcha sozlamalarni olish (kalitlar bo'yicha obyekt).
   */
  static async all() {
    if (cache && Date.now() - cacheTime < TTL) return cache;

    const rows = await Setting.findAll();
    const result = { ...DEFAULTS };
    for (const row of rows) {
      result[row.key] = SettingsService.parseValue(row);
    }
    cache = result;
    cacheTime = Date.now();
    return result;
  }

  /**
   * Bitta sozlama.
   */
  static async get(key, fallback = undefined) {
    const all = await SettingsService.all();
    return all[key] !== undefined ? all[key] : fallback;
  }

  /**
   * Sozlama o'rnatish.
   */
  static async set(
    key,
    value,
    { userId = null, type = null, description = null, isSecret = null } = {}
  ) {
    const parsed = SettingsService.serialize(value, type);
    const [row] = await Setting.findOrCreate({
      where: { key },
      defaults: {
        key,
        value: parsed.value,
        type: parsed.type,
        description,
        isSecret: isSecret === null ? key.toLowerCase().includes('token') : isSecret,
        updatedBy: userId,
      },
    });

    if (row.value !== parsed.value || row.type !== parsed.type) {
      await row.update({
        value: parsed.value,
        type: parsed.type,
        description: description || row.description,
        isSecret: isSecret === null ? row.isSecret : isSecret,
        updatedBy: userId,
      });
    }

    cache = null;
    logger.info(`Sozlama o'zgartirildi: ${key}`);
    return row;
  }

  /**
   * Sozlamalarni birdan o'rnatish.
   */
  static async setMany(values, { userId = null } = {}) {
    const result = [];
    for (const [key, value] of Object.entries(values)) {
      result.push(await SettingsService.set(key, value, { userId }));
    }
    return result;
  }

  /**
   * Ommaviy o'qish (panel uchun, maxfiy qiymatlar yashirilgan).
   * Bazada yozilmagan sozlamalar ham standart qiymat bilan qaytariladi.
   */
  static async forPanel() {
    const rows = await Setting.findAll({ order: [['key', 'ASC']] });
    const byKey = new Map(rows.map((r) => [r.key, r]));

    const result = [];

    // 1) Bazada yozilgan sozlamalar
    for (const row of rows) {
      result.push({
        key: row.key,
        value: row.isSecret ? (row.value ? '••••••' : '') : SettingsService.parseValue(row),
        type: row.type,
        description: row.description || (SETTINGS_META[row.key] || {}).description || null,
        isSecret: row.isSecret,
        updatedAt: row.updatedAt,
      });
    }

    // 2) Standart sozlamalar (bazasda yo'q bo'lsa)
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (byKey.has(key)) continue;
      const meta = SETTINGS_META[key] || {};
      result.push({
        key,
        value,
        type:
          meta.type ||
          (typeof value === 'boolean'
            ? 'boolean'
            : typeof value === 'number'
              ? 'number'
              : 'string'),
        description: meta.description || null,
        isSecret: Boolean(meta.isSecret),
        updatedAt: null,
      });
    }

    return result.sort((a, b) => a.key.localeCompare(b.key));
  }

  static parseValue(row) {
    switch (row.type) {
      case 'boolean':
        return row.value === 'true' || row.value === true;
      case 'number':
        return Number(row.value);
      case 'json':
        try {
          return JSON.parse(row.value || 'null');
        } catch (e) {
          return null;
        }
      default:
        return row.value === null ? null : String(row.value);
    }
  }

  static serialize(value, type = null) {
    let resolvedType = type;
    let resolved = value;

    if (!resolvedType) {
      if (typeof value === 'boolean') resolvedType = 'boolean';
      else if (typeof value === 'number') resolvedType = 'number';
      else if (value && typeof value === 'object') resolvedType = 'json';
      else resolvedType = 'string';
    }

    if (resolvedType === 'boolean') resolved = value ? 'true' : 'false';
    else if (resolvedType === 'number') resolved = String(Number(value));
    else if (resolvedType === 'json') resolved = JSON.stringify(value);

    return {
      value: resolved === null || resolved === undefined ? null : String(resolved),
      type: resolvedType,
    };
  }
}

module.exports = SettingsService;
