'use strict';

require('dotenv').config();

const toInt = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
const toBool = (v, d) => {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  timezone: process.env.TZ || 'Asia/Tashkent',
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${toInt(process.env.PORT, 3000)}`,

  db: {
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'attendance',
    user: process.env.DB_USER || 'attendance',
    password: process.env.DB_PASSWORD || 'attendance',
    logging: toBool(process.env.DB_LOGGING, false),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'CHANGE_ME_ACCESS_SECRET',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'CHANGE_ME_REFRESH_SECRET',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
    issuer: process.env.JWT_ISSUER || 'klinika-attendance',
  },

  // AES-256-GCM uchun 64 hex belgili kalit (32 bayt)
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  hikvision: {
    // Terminal push eventlari uchun maxfiy token
    eventToken: process.env.TERMINAL_EVENT_TOKEN || 'CHANGE_ME_EVENT_TOKEN',
    // Ruxsat etilgan terminallar IP ro'yxati (vergul bilan ajratilgan)
    ipAllowlist: (process.env.TERMINAL_IP_ALLOWLIST || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // ISAPI so'rovlari uchun timeout (ms)
    timeout: toInt(process.env.TERMINAL_HTTP_TIMEOUT, 10000),
    // Event qabul qilinadigan major/minor juftliklar
    acceptMajor: (process.env.TERMINAL_ACCEPT_MAJOR || '5').split(',').map((s) => s.trim()),
    acceptMinor: (process.env.TERMINAL_ACCEPT_MINOR || '75').split(',').map((s) => s.trim()),
    // Boshqa xodimga tegishli eventlar (masalan 5,73 - karta)
    allowCardEvents: toBool(process.env.TERMINAL_ALLOW_CARD_EVENTS, true),
  },

  attendance: {
    // Bir xodimdan 60 soniya ichidagi ketma-ket eventlar bitta deb hisoblanadi
    debounceSeconds: toInt(process.env.ATTENDANCE_DEBOUNCE_SECONDS, 60),
    // Loglar smena oynasiga biriktirilgandan oldingi/so'ngi qo'shimcha vaqt (soat)
    windowBeforeHours: toInt(process.env.ATTENDANCE_WINDOW_BEFORE_HOURS, 3),
    windowAfterHours: toInt(process.env.ATTENDANCE_WINDOW_AFTER_HOURS, 3),
    // Kechikishni to'liq hisoblash (true) yoki faqat grace oshgan qismini (false)
    lateCountsFullGrace: toBool(process.env.ATTENDANCE_LATE_COUNTS_FULL_GRACE, true),
  },

  jobs: {
    enabled: toBool(process.env.JOBS_ENABLED, true),
    reconcileCron: process.env.JOB_RECONCILE_CRON || '*/5 * * * *',
    reconcileLookbackHours: toInt(process.env.JOB_RECONCILE_LOOKBACK_HOURS, 2),
    nightlyReconcileCron: process.env.JOB_NIGHTLY_RECONCILE_CRON || '0 2 * * *',
    nightlyReconcileLookbackHours: toInt(process.env.JOB_NIGHTLY_RECONCILE_LOOKBACK_HOURS, 24),
    calculateCron: process.env.JOB_CALCULATE_CRON || '*/10 * * * *',
    timesheetCron: process.env.JOB_TIMESHEET_CRON || '10 1 1 * *',
    healthCron: process.env.JOB_HEALTH_CRON || '*/1 * * * *',
    syncCron: process.env.JOB_SYNC_CRON || '*/2 * * * *',
    errorCleanupCron: process.env.JOB_ERROR_CLEANUP_CRON || '0 4 * * 0',
    timezone: process.env.JOB_TIMEZONE || 'Asia/Tashkent',
  },

  notify: {
    dailySummaryCron: process.env.NOTIFY_DAILY_SUMMARY_CRON || '30 18 * * *',
  },

  backup: {
    enabled: toBool(process.env.BACKUP_ENABLED, true),
    cron: process.env.BACKUP_CRON || '0 3 * * *',
    dir: process.env.BACKUP_DIR || '/app/backups',
    retentionDays: toInt(process.env.BACKUP_RETENTION_DAYS, 14),
  },

  logLevel: process.env.LOG_LEVEL || 'info',
  trustProxy: toInt(process.env.TRUST_PROXY, 1),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFaceSizeMb: toInt(process.env.MAX_FACE_SIZE_MB, 5),
};

module.exports = config;
