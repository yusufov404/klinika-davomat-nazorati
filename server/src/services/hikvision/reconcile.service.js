'use strict';

const logger = require('../../config/logger');
const { Terminal } = require('../../models');
const TerminalService = require('../terminal.service');
const IngestService = require('../ingest.service');
const config = require('../../config');

/**
 * Zaxira usul: terminallardan loglarni o'qib olish (pull / reconcile).
 * Server o'chib qolgan yoki tarmoq uzilgan holat uchun.
 */
class ReconcileService {
  /**
   * Bitta terminaldan loglarni o'qish.
   * @param {object} terminal
   * @param {Date} from
   * @param {Date} to
   * @returns {Promise<{total:number, ingested:number, duplicates:number, errors:number}>}
   */
  static async pullTerminal(terminal, from, to) {
    const client = TerminalService.getClient(terminal);
    const stats = { total: 0, ingested: 0, duplicates: 0, unmatched: 0, ignored: 0, errors: 0 };

    const startTime = ReconcileService.toIsapiTime(from);
    const endTime = ReconcileService.toIsapiTime(to);

    let position = 0;
    let totalNum = null;
    let guard = 0;

    while (guard < 200) {
      guard += 1;
      const condition = {
        searchID: `reconcile-${terminal.id}-${Date.now()}`,
        searchResultPosition: position,
        maxResults: 30,
        major: 5,
        minor: 75,
        startTime,
        endTime,
      };

      const response = await client.listAccessEvents(condition);
      const acs = response && response.AcsEvent ? response.AcsEvent : {};
      const events = Array.isArray(acs.events) ? acs.events : [];

      if (totalNum === null) totalNum = parseInt(acs.totalNum, 10) || events.length;
      stats.total += events.length;

      if (!events.length) break;

      for (const ev of events) {
        const result = await IngestService.ingest({
          payload: ev,
          sourceIp: terminal.ipAddress,
          source: 'pull',
          terminalId: terminal.id,
        });
        if (result.status === 'created') stats.ingested += 1;
        else if (result.status === 'duplicate') stats.duplicates += 1;
        else if (result.status === 'unmatched') stats.unmatched += 1;
        else stats.ignored += 1;
      }

      position += events.length;
      if (position >= totalNum || events.length === 0) break;
    }

    return stats;
  }

  /**
   * ISAPI vaqti (ISO8601, TZ bilan).
   */
  static toIsapiTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    // Asia/Tashkent offseti (+05:00) qo'shiladi
    const iso = new Date(d.getTime() + 5 * 60 * 60 * 1000).toISOString();
    return `${iso.slice(0, 19)}+05:00`;
  }

  /**
   * Barcha terminallardan oxirgi N soatni o'qish.
   * @param {number} lookbackHours
   */
  static async run(lookbackHours = config.jobs.reconcileLookbackHours) {
    const terminals = await Terminal.findAll({ where: { isActive: true } });
    const to = new Date();
    const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);

    const summary = {
      terminals: 0,
      total: 0,
      ingested: 0,
      duplicates: 0,
      unmatched: 0,
      errors: 0,
      details: [],
    };

    for (const terminal of terminals) {
      try {
        const stats = await ReconcileService.pullTerminal(terminal, from, to);
        summary.terminals += 1;
        summary.total += stats.total;
        summary.ingested += stats.ingested;
        summary.duplicates += stats.duplicates;
        summary.unmatched += stats.unmatched;
        summary.errors += stats.errors;
        summary.details.push({ terminal: terminal.name, ...stats });
        await Terminal.update(
          { lastSyncAt: new Date(), lastSeenAt: new Date() },
          { where: { id: terminal.id } }
        );
      } catch (err) {
        summary.errors += 1;
        summary.details.push({ terminal: terminal.name, error: err.message });
        logger.error(`Reconcile xatosi (${terminal.name}):`, err.message);
        await Terminal.update({ status: 'offline' }, { where: { id: terminal.id } });
      }
    }

    if (summary.total) {
      logger.info(
        `Reconcile: ${summary.terminals} terminal, ${summary.total} event, ${summary.ingested} yangi, ${summary.duplicates} duplicate`
      );
    }
    return summary;
  }
}

module.exports = ReconcileService;
