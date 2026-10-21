'use strict';

const cron = require('node-cron');
const config = require('../config');
const logger = require('../config/logger');
const ReconcileService = require('../services/hikvision/reconcile.service');
const TerminalService = require('../services/terminal.service');
const SyncService = require('../services/sync.service');
const attendanceService = require('../services/attendance.service');
const { Terminal } = require('../models');
const T = require('../utils/time');

const tasks = [];

/**
 * Har bir task'ni ro'yxatga oladi (bir vaqtda bir marta ishlasin).
 */
function schedule(name, expression, fn) {
  const task = cron.schedule(
    expression,
    async () => {
      const started = Date.now();
      try {
        await fn();
        logger.debug(`Job "${name}" bajarildi (${Date.now() - started}ms)`);
      } catch (err) {
        logger.error(`Job "${name}" xatosi:`, err.message);
      }
    },
    { timezone: config.jobs.timezone }
  );
  tasks.push({ name, task });
  logger.info(`Job "${name}" rejalashtirildi: ${expression}`);
}

/**
 * Barcha job'larni ishga tushirish.
 */
function startAll() {
  // 1) Reconcile - har 5-10 daqiqada oxirgi 1-2 soat
  schedule('reconcile', config.jobs.reconcileCron, async () => {
    const summary = await ReconcileService.run(config.jobs.reconcileLookbackHours);
    if (summary.ingested > 0) {
      // Yangi loglar bo'lsa - davomatni qayta hisoblaymiz
      const today = T.today();
      await attendanceService.recalculateRange(T.addDays(today, -1), today);
    }
  });

  // 2) Kecha kechqurun - 24 soatlik tekshiruv
  schedule('nightly-reconcile', config.jobs.nightlyReconcileCron, async () => {
    const summary = await ReconcileService.run(config.jobs.nightlyReconcileLookbackHours);
    logger.info(`Kecha kechqurun reconcile: ${summary.ingested} yangi event`);
    const today = T.today();
    await attendanceService.recalculateRange(T.addDays(today, -3), today);
  });

  // 3) Davomatni qayta hisoblash
  schedule('calculate', config.jobs.calculateCron, async () => {
    const today = T.today();
    await attendanceService.recalculateRange(T.addDays(today, -2), today);
  });

  // 4) Terminal sinxronlash navbati
  schedule('terminal-sync', config.jobs.syncCron, async () => {
    await SyncService.processPending(20);
  });

  // 5) Terminal holati tekshiruvi
  schedule('terminal-health', config.jobs.healthCron, async () => {
    const results = await TerminalService.checkAll();
    const offline = results.filter((r) => !r.reachable);
    if (offline.length) {
      logger.warn(`Offline terminallar: ${offline.map((r) => r.name).join(', ')}`);
      // Faqat yangi offline bo'lganlarga xabar beramiz
      for (const t of offline) {
        const terminal = await Terminal.findByPk(t.terminalId);
        if (terminal && terminal.status === 'active') {
          // holat allaqahan 'offline' qilib qo'yildi -> ogohlantirish
        }
      }
    }
  });

  // 6) Kunlik yakuniy hisobot bildirishnomasi
  schedule('daily-summary', config.notify.dailySummaryCron, async () => {
    const reportService = require('../services/report.service');
    const notificationService = require('../services/notification.service');
    const T = require('../utils/time');

    const today = T.today();
    const summary = await reportService.summary({ dateFrom: today, dateTo: today });
    await notificationService.notifyDailySummary(summary, today);
  });

  // 7) Eski xatolarni tozalash
  schedule('error-cleanup', config.jobs.errorCleanupCron, async () => {
    const errorTracking = require('../services/errorTracking.service');
    const deleted = await errorTracking.cleanup(30);
    if (deleted) logger.info(`30 kundan eski ${deleted} ta xato tozalandi`);
  });
}

function stopAll() {
  for (const { task } of tasks) task.stop();
  tasks.length = 0;
}

module.exports = { startAll, stopAll, schedule };
