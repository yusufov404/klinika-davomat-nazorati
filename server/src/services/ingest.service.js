'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const config = require('../config');
const logger = require('../config/logger');
const { AttendanceLog, Employee, Terminal, UnmatchedEvent } = require('../models');
const { normalizeEvent, parseEventTime } = require('./hikvision/events');

/**
 * Eventni bazaga yozish.
 *  - duplicate himoyasi: (terminal_id, serial_no) UNIQUE
 *  - debounce: bir xodimdan 60 soniya ichidagi ketma-ket eventlar bitta
 *  - xodim topilmasa -> unmatched_events (HR qo'lda tuzatadi)
 */
class IngestService {
  /**
   * @param {object} p
   * @param {object|string|Buffer} p.payload
   * @param {string} p.sourceIp
   * @param {string} p.source 'push' | 'pull'
   * @param {number} [p.terminalId]
   * @returns {Promise<{status:string, reason?:string, logId?:number}>}
   */
  static async ingest({ payload, sourceIp, source = 'push', terminalId = null }) {
    const event = normalizeEvent(payload);

    if (!event) return { status: 'ignored', reason: 'Payload tushunilmadi' };
    if (!event.accepted) {
      logger.debug(`Event rad etildi: ${event.rejectReason}`);
      return { status: 'ignored', reason: event.rejectReason };
    }

    const terminal = await IngestService.resolveTerminal({ event, sourceIp, terminalId });
    if (!terminal) {
      logger.warn(`Terminal aniqlanmadi (ip=${sourceIp}, serial=${event.terminalSerialNo})`);
      return { status: 'ignored', reason: 'Terminal topilmadi' };
    }

    const logTime = parseEventTime(event.dateTime) || new Date();
    const employee = await IngestService.resolveEmployee(event);

    if (!employee) {
      await IngestService.storeUnmatched({ event, terminal, logTime });
      return { status: 'unmatched', reason: 'Xodim topilmadi' };
    }

    // ---- Debounce ----
    if (config.attendance.debounceSeconds > 0) {
      const since = new Date(logTime.getTime() - config.attendance.debounceSeconds * 1000);
      const recent = await AttendanceLog.findOne({
        where: {
          employeeId: employee.id,
          logTime: { [Op.gte]: since, [Op.lte]: logTime },
        },
        order: [['logTime', 'DESC']],
      });
      if (recent) {
        return { status: 'duplicate', reason: 'Debounce (60s ichida)', logId: recent.id };
      }
    }

    // ---- Kirish/chiqish terminal yo'nalishiga qarab ----
    let eventType = 'unknown';
    if (terminal.direction === 'in') eventType = 'in';
    else if (terminal.direction === 'out') eventType = 'out';

    const row = {
      employeeId: employee.id,
      terminalId: terminal.id,
      logTime,
      serialNo: event.serialNo,
      eventType,
      verifyMode: event.verifyMode,
      source,
      rawPayload: event.raw,
      majorEventType: event.majorEventType,
      subEventType: event.subEventType,
      deviceTime: event.dateTime ? parseEventTime(event.dateTime) : null,
    };

    try {
      let created;
      let isNew;

      if (event.serialNo) {
        // serial_no bor -> UNIQUE (terminal_id, serial_no) orqali himoya
        [created, isNew] = await AttendanceLog.findOrCreate({
          where: { terminalId: terminal.id, serialNo: event.serialNo },
          defaults: row,
        });
        if (!isNew) {
          return { status: 'duplicate', reason: 'serial_no allaqachon mavjud', logId: created.id };
        }
      } else {
        // serial yo'q -> (terminal, xodim, aniq vaqt) bo'yicha tekshiruv
        const existing = await AttendanceLog.findOne({
          where: {
            terminalId: terminal.id,
            employeeId: employee.id,
            logTime,
          },
        });
        if (existing) {
          return { status: 'duplicate', reason: 'Aniq vaqtda log mavjud', logId: existing.id };
        }
        created = await AttendanceLog.create(row);
        isNew = true;
      }

      await IngestService.markTerminalSeen(terminal);
      return { status: 'created', logId: created.id, employeeId: employee.id, logTime };
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        return { status: 'duplicate', reason: 'UNIQUE constraint' };
      }
      throw err;
    }
  }

  /**
   * Terminalni aniqlash: avval serial raqami, keyin IP.
   */
  static async resolveTerminal({ event, sourceIp, terminalId }) {
    if (terminalId) {
      const t = await Terminal.findByPk(terminalId);
      if (t) return t;
    }
    if (event.terminalSerialNo) {
      const t = await Terminal.findOne({ where: { serialNumber: event.terminalSerialNo } });
      if (t) return t;
    }
    if (sourceIp) {
      const t = await Terminal.findOne({ where: { ipAddress: sourceIp } });
      if (t) return t;
    }
    return null;
  }

  /**
   * Xodimni employeeNo bo'yicha topish.
   */
  static async resolveEmployee(event) {
    if (!event.employeeNo) return null;
    const emp = await Employee.findOne({
      where: {
        [Op.or]: [{ terminalUserId: event.employeeNo }, { employeeNo: event.employeeNo }],
      },
    });
    return emp;
  }

  static async storeUnmatched({ event, terminal, logTime }) {
    try {
      await UnmatchedEvent.findOrCreate({
        where: {
          terminalId: terminal.id,
          serialNo: event.serialNo || `no-serial-${logTime.getTime()}`,
        },
        defaults: {
          terminalId: terminal.id,
          employeeNo: event.employeeNo,
          employeeName: event.name,
          logTime,
          eventType: event.eventTypeName,
          verifyMode: event.verifyMode,
          rawPayload: event.raw,
          resolved: false,
        },
      });
    } catch (err) {
      logger.error('Unmatched event saqlanmadi:', err.message);
    }
  }

  static async markTerminalSeen(terminal) {
    await Terminal.update(
      { lastSeenAt: new Date(), status: 'active' },
      { where: { id: terminal.id } }
    );
  }
}

module.exports = IngestService;
