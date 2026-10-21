'use strict';

const { Op } = require('sequelize');
const logger = require('../config/logger');
const { Employee, Terminal, TerminalSyncJob } = require('../models');
const TerminalService = require('./terminal.service');

/**
 * Xodimlarni terminallarga sinxronlash (ISAPI orqali).
 * Har bir natija terminal_sync_jobs da saqlanadi, xatolar retry bilan qayta uriniladi.
 */
class SyncService {
  /**
   * ISAPI UserInfo payload.
   */
  static buildUserPayload(employee, { userId, faceEnabled = true } = {}) {
    const start = employee.hireDate
      ? `${String(employee.hireDate).slice(0, 10)}T00:00:00`
      : '2020-01-01T00:00:00';
    const end = employee.terminationDate
      ? `${String(employee.terminationDate).slice(0, 10)}T23:59:59`
      : '2037-12-31T23:59:59';

    return {
      UserInfo: {
        userID: String(userId),
        userName: employee.fullName,
        userType: 'normal',
        employeeNo: String(employee.terminalUserId || employee.employeeNo),
        cardNo: '',
        pin: '',
        faceUrl: '',
        faceId: { faceID: String(userId), enable: faceEnabled, similarity: 80 },
        valid: true,
        validityPeriod: { enable: true, startTime: start, endTime: end },
        authorization: {
          groupID: '1',
          rights: {
            isFaceEnable: faceEnabled,
            isCardEnable: false,
            isDisplayEnable: true,
            isVoiceEnable: false,
            isCallEnable: false,
            isDoorBellEnable: false,
            isLEDEnable: false,
            isAccountGroupEnable: false,
            isPersonAbsenceEnable: false,
            isIllegalCardEnable: false,
            isDuressEnable: false,
            isWhiteListEnable: false,
          },
        },
      },
    };
  }

  /**
   * Xodimni bitta terminalga qo'shish/yozish.
   * @returns {Promise<{ok:boolean, error?:string}>}
   */
  static async syncEmployee(employee, terminal, action = 'add') {
    const client = TerminalService.getClient(terminal);
    const userId = String(employee.terminalUserId || employee.employeeNo);

    try {
      if (action === 'delete') {
        await client.deleteUser(userId);
        return { ok: true };
      }

      const payload = SyncService.buildUserPayload(employee, { userId });

      if (action === 'add') {
        await client.addUser(payload);
      } else {
        await client.modifyUser(payload);
      }
      return { ok: true };
    } catch (err) {
      // "User already exist" -> modify bilan urinish
      if (action === 'add' && /exist/i.test(err.message)) {
        try {
          const payload = SyncService.buildUserPayload(employee, { userId });
          await client.modifyUser(payload);
          return { ok: true };
        } catch (e2) {
          return { ok: false, error: e2.message };
        }
      }
      return { ok: false, error: err.message };
    }
  }

  /**
   * Sinxronlash vazifasini navbatga qo'yish.
   * @param {number} employeeId
   * @param {number[]} terminalIds
   * @param {string} action add|update|delete|face
   */
  static async enqueue(employeeId, terminalIds, action) {
    const jobs = [];
    for (const terminalId of terminalIds) {
      const [job] = await TerminalSyncJob.findOrCreate({
        where: { employeeId, terminalId, action, status: 'pending' },
        defaults: {
          employeeId,
          terminalId,
          action,
          status: 'pending',
          attempts: 0,
        },
      });
      jobs.push(job);
    }
    return jobs;
  }

  /**
   * Xodim ishdan ketganda / ma'lumot o'zgarganda - barcha terminallar uchun navbat.
   */
  static async enqueueForAllTerminals(employee, action) {
    const terminals = await Terminal.findAll({ where: { isActive: true } });
    return SyncService.enqueue(
      employee.id,
      terminals.map((t) => t.id),
      action
    );
  }

  /**
   * Navbatdagi vazifalarni bajarish (retry bilan).
   */
  static async processPending(limit = 20) {
    const jobs = await TerminalSyncJob.findAll({
      where: {
        status: 'pending',
        [Op.or]: [{ nextRetryAt: null }, { nextRetryAt: { [Op.lte]: new Date() } }],
      },
      order: [['id', 'ASC']],
      limit,
    });

    let ok = 0;
    let failed = 0;

    for (const job of jobs) {
      const employee = await Employee.findByPk(job.employeeId);
      const terminal = await Terminal.findByPk(job.terminalId);
      job.attempts += 1;

      if (!employee || !terminal) {
        await job.update({
          status: 'failed',
          lastError: 'Xodim yoki terminal topilmadi',
          completedAt: new Date(),
        });
        failed += 1;
        continue;
      }

      const result = await SyncService.syncEmployee(employee, terminal, job.action);

      if (result.ok) {
        await job.update({
          status: 'ok',
          lastError: null,
          completedAt: new Date(),
          nextRetryAt: null,
        });
        await Terminal.update({ lastSyncAt: new Date() }, { where: { id: terminal.id } });
        ok += 1;
      } else {
        const maxAttempts = 5;
        const nextRetry = new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000);
        await job.update({
          status: job.attempts >= maxAttempts ? 'failed' : 'pending',
          lastError: result.error,
          nextRetryAt: job.attempts >= maxAttempts ? null : nextRetry,
        });
        failed += 1;
        logger.warn(
          `Sinxronlash xatosi (employee=${employee.id}, terminal=${terminal.name}): ${result.error}`
        );
      }
    }

    if (jobs.length)
      logger.info(`Sinxronlash: ${ok} muvaffaqiyat, ${failed} xato (${jobs.length} ta)`);
    return { processed: jobs.length, ok, failed };
  }

  /**
   * Barcha xodimlarni barcha terminallarga to'liq qayta sinxronlash.
   */
  static async fullResync() {
    const employees = await Employee.findAll({ where: { isActive: true } });
    const terminals = await Terminal.findAll({ where: { isActive: true } });
    for (const emp of employees) {
      for (const t of terminals) {
        await TerminalSyncJob.findOrCreate({
          where: { employeeId: emp.id, terminalId: t.id, action: 'add', status: 'pending' },
          defaults: { employeeId: emp.id, terminalId: t.id, action: 'add', status: 'pending' },
        });
      }
    }
    return { employees: employees.length, terminals: terminals.length };
  }
}

module.exports = SyncService;
