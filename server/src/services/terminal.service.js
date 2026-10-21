'use strict';

const logger = require('../config/logger');
const { Terminal } = require('../models');
const { decrypt } = require('../utils/crypto');
const HikvisionClient = require('./hikvision/client');

/**
 * Terminal bilan ishlash yordamchilari.
 */
class TerminalService {
  /**
   * @param {object} terminal Terminal model
   * @returns {HikvisionClient}
   */
  static getClient(terminal) {
    const password = decrypt(terminal.passwordEncrypted);
    if (!password) {
      throw new Error(
        `Terminal ${terminal.name} parolini ochib bo'lmadi (ENCRYPTION_KEY mos kelmadi?)`
      );
    }
    return new HikvisionClient({
      ipAddress: terminal.ipAddress,
      port: terminal.port,
      username: terminal.username,
      password,
    });
  }

  /**
   * Terminalga ulanishni tekshirish va ma'lumot olish.
   * @param {number} terminalId
   */
  static async testConnection(terminalId) {
    const terminal = await Terminal.findByPk(terminalId);
    if (!terminal) throw new Error('Terminal topilmadi');

    const previousStatus = terminal.status;
    const client = TerminalService.getClient(terminal);
    const started = Date.now();
    const result = {
      terminalId,
      name: terminal.name,
      ip: terminal.ipAddress,
      reachable: false,
      latencyMs: null,
      deviceInfo: null,
      serverTime: new Date().toISOString(),
      deviceTime: null,
      timeDriftSeconds: null,
      timeWarning: false,
      error: null,
    };

    try {
      const info = await client.deviceInfo();
      result.reachable = true;
      result.latencyMs = Date.now() - started;
      result.deviceInfo = {
        deviceName: info.deviceName,
        deviceType: info.deviceType,
        serialNumber: info.serialNumber,
        model: info.deviceModel || info.model,
        firmwareVersion: info.firmwareVersion,
        macAddress: info.macAddress,
      };

      // Terminal seriali bazada boshqacha bo'lsa - sinxronlaymiz
      if (info.serialNumber && info.serialNumber !== terminal.serialNumber) {
        await Terminal.update({ serialNumber: info.serialNumber }, { where: { id: terminal.id } });
        logger.info(`Terminal ${terminal.name}: serial raqam yangilandi -> ${info.serialNumber}`);
      }

      try {
        const time = await client.time();
        const deviceTime = time.time ? new Date(time.time.replace(' ', 'T')) : null;
        result.deviceTime = deviceTime ? deviceTime.toISOString() : null;
        if (deviceTime) {
          const drift = Math.abs(deviceTime.getTime() - Date.now()) / 1000;
          result.timeDriftSeconds = Math.round(drift);
          result.timeWarning = drift > 60;
        }
      } catch (e) {
        result.timeWarning = false;
      }

      await Terminal.update(
        { lastSeenAt: new Date(), status: 'active' },
        { where: { id: terminal.id } }
      );

      // Qayta ulandi — xabar beramiz
      if (previousStatus === 'offline') {
        const NotificationService = require('./notification.service');
        await NotificationService.notify({
          type: 'terminal',
          title: `Terminal qayta ulandi: ${terminal.name}`,
          body: `IP: ${terminal.ipAddress}`,
          link: '/terminals',
          meta: { terminalId: terminal.id },
        });
      }
    } catch (err) {
      result.error = err.message;
      await Terminal.update({ status: 'offline' }, { where: { id: terminal.id } });

      // Yangi offline bo'ldi — ogohlantirish
      if (previousStatus !== 'offline') {
        const NotificationService = require('./notification.service');
        await NotificationService.notifyTerminalOffline(terminal);
      }
    }

    return result;
  }

  /**
   * Terminalga HTTP Host Notification (push) ni sozlash.
   * @param {number} terminalId
   * @param {string} [publicUrl] Masalan http://192.168.50.2:3000
   */
  static async configureNotification(terminalId, publicUrl) {
    const terminal = await Terminal.findByPk(terminalId);
    if (!terminal) throw new Error('Terminal topilmadi');

    const client = TerminalService.getClient(terminal);
    const base = (publicUrl || '').replace(/\/+$/, '');
    const url = `${base}/api/hikvision/events`;

    await client.setHttpHost(url, { token: process.env.TERMINAL_EVENT_TOKEN || '' });
    await Terminal.update({ lastSyncAt: new Date() }, { where: { id: terminal.id } });
    return { terminalId, url };
  }

  /**
   * Barcha terminallarni tekshirish va holatlarini yangilash.
   */
  static async checkAll() {
    const terminals = await Terminal.findAll({ where: { isActive: true } });
    const results = [];
    for (const t of terminals) {
      try {
        results.push(await TerminalService.testConnection(t.id));
      } catch (err) {
        results.push({ terminalId: t.id, name: t.name, reachable: false, error: err.message });
      }
    }
    return results;
  }
}

module.exports = TerminalService;
