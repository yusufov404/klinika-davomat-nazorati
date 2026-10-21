'use strict';

const axios = require('axios');
const logger = require('../config/logger');
const SettingsService = require('./settings.service');
const { Notification, User } = require('../models');

/**
 * Bildirishnomalar:
 *  - Telegram bot orqali (tashqi ogohlantirish)
 *  - Tizim ichida (admin panelidagi belgcha)
 */
class NotificationService {
  /**
   * Telegram orqali xabar yuborish.
   * @param {string} text
   * @param {object} [options]
   */
  static async sendTelegram(text, _options = {}) {
    const settings = await SettingsService.all();
    const enabled = settings['telegram.enabled'];
    const token = settings['telegram.botToken'];
    const chatId = settings['telegram.chatId'];

    if (!enabled || !token || !chatId) {
      return { sent: false, reason: 'Telegram sozlanmagan' };
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const { data } = await axios.post(
        url,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        },
        { timeout: 8000 }
      );
      return { sent: true, messageId: data && data.result ? data.result.message_id : null };
    } catch (err) {
      const message =
        err.response && err.response.data
          ? err.response.data.description || JSON.stringify(err.response.data)
          : err.message;
      logger.warn(`Telegram yuborilmadi: ${message}`);
      return { sent: false, reason: message };
    }
  }

  /**
   * Telegram bilan bog'lanishni tekshirish (test xabar).
   */
  static async testTelegram() {
    const settings = await SettingsService.all();
    if (!settings['telegram.botToken'] || !settings['telegram.chatId']) {
      return { sent: false, reason: 'Bot token yoki chat ID kiritilmagan' };
    }
    const text =
      `✅ <b>Test xabari</b>\n` +
      `Klinika davomat tizimi bilan bog'lanish muvaffaqiyatli.\n` +
      `📅 ${new Date().toLocaleString('ru-RU')}`;
    return NotificationService.sendTelegram(text);
  }

  /**
   * Tizim ichidagi bildirishnoma (belgcha).
   */
  static async create({
    type = 'info',
    title,
    body = null,
    link = null,
    userId = null,
    meta = null,
  }) {
    try {
      // userId berilmasa — barcha adminlarga
      const targets = userId
        ? [userId]
        : (await User.findAll({ where: { isActive: true }, attributes: ['id'] })).map((u) => u.id);

      const rows = [];
      for (const uid of targets) {
        rows.push(
          await Notification.create({
            type,
            title,
            body,
            link,
            userId: uid,
            meta,
          })
        );
      }
      return rows;
    } catch (err) {
      logger.warn('Bildirishnoma yaratilmadi:', err.message);
      return [];
    }
  }

  /**
   * Ichki + Telegram bilan bir vaqtda bildirishnoma.
   */
  static async notify({
    type = 'info',
    title,
    body = null,
    link = null,
    userId = null,
    telegram = false,
    meta = null,
  }) {
    await NotificationService.create({ type, title, body, link, userId, meta });
    if (telegram) {
      await NotificationService.sendTelegram(`<b>${title}</b>${body ? `\n${body}` : ''}`);
    }
  }

  /**
   * Ta'til so'rovi kelganda.
   */
  static async notifyLeaveRequest(leave, employeeName) {
    const settings = await SettingsService.all();
    if (!settings['notify.leaveRequest']) return;
    await NotificationService.notify({
      type: 'leave',
      title: `Yangi ta'til so'rovi — ${employeeName}`,
      body: `${leave.startDate} — ${leave.endDate}`,
      link: '/leaves',
      telegram: true,
      meta: { leaveId: leave.id },
    });
  }

  /**
   * Terminal offline bo'lganda.
   */
  static async notifyTerminalOffline(terminal) {
    const settings = await SettingsService.all();
    if (!settings['notify.terminalOffline']) return;
    await NotificationService.notify({
      type: 'terminal',
      title: `Terminal offline: ${terminal.name}`,
      body: `IP: ${terminal.ipAddress}`,
      link: '/terminals',
      telegram: true,
      meta: { terminalId: terminal.id },
    });
  }

  /**
   * Kunda yakuniy hisobot.
   */
  static async notifyDailySummary(summary, dateStr) {
    const settings = await SettingsService.all();
    if (!settings['notify.dailySummary']) return;

    const threshold = Number(settings['notify.absentThreshold']) || 3;
    const lines = [
      `📊 <b>Kunlik davomat — ${dateStr}</b>`,
      `✅ Ishta: ${summary.present}`,
      `⏰ Kechikdi: ${summary.late}`,
      `❌ Kelmagan: ${summary.absent}`,
      `🏖 Ta'til/dam: ${summary.leave + summary.dayOff}`,
    ];
    if (summary.absent >= threshold) {
      lines.push(`⚠️ Kelmaganlar soni chegaradan yuqori (${threshold})`);
    }

    await NotificationService.notify({
      type: 'system',
      title: `Kunlik hisobot: ${dateStr}`,
      body: lines.join('\n'),
      link: '/reports',
      telegram: true,
      meta: { date: dateStr },
    });
  }
}

module.exports = NotificationService;
