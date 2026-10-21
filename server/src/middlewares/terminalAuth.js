'use strict';

const config = require('../config');
const { Terminal } = require('../models');
const { forbidden } = require('../utils/errors');

/**
 * Terminal push endpoint'i uchun IP allowlist.
 * Ruxsat berilgan manbalar:
 *   1) .env dagi TERMINAL_IP_ALLOWLIST
 *   2) bazadagi terminallarning IP manzillari
 */
async function terminalIpAllowlist(req, res, next) {
  try {
    const ip = normalizeIp(req.ip || req.socket.remoteAddress);
    const list = config.hikvision.ipAllowlist.map(normalizeIp).filter(Boolean);

    if (list.includes(ip)) return next();

    // Bazadagi terminallar
    const terminal = await Terminal.findOne({ where: { ipAddress: ip } });
    if (terminal && terminal.isActive) return next();

    if (!list.length && !config.hikvision.ipAllowlist.length) {
      // Sozlanmagan bo'lsa ogohlantiramiz, lekin bloklamaymiz (dastlabki o'rnatish)
      return next();
    }

    return next(forbidden(`Manzil rad etildi: ${ip}`));
  } catch (err) {
    return next(err);
  }
}

/**
 * Terminal maxfiy tokenini tekshirish.
 * Hikvision ba'zi firmwarelarda qo'shimcha header yubora olmaydi,
 * shuning uchun query va body dan ham qabul qilinadi.
 */
function terminalToken(req, res, next) {
  const expected = config.hikvision.eventToken;
  if (!expected) return next();

  const provided =
    req.headers['x-terminal-token'] ||
    req.query.token ||
    (req.body && req.body.token) ||
    (req.body && req.body.packetInfo && extractToken(req.body.packetInfo));

  if (provided && provided === expected) return next();

  return next(forbidden("Token noto'g'ri"));
}

function extractToken(packetInfo) {
  try {
    const parsed = typeof packetInfo === 'string' ? JSON.parse(packetInfo) : packetInfo;
    return parsed && parsed.token ? parsed.token : null;
  } catch (e) {
    return null;
  }
}

function normalizeIp(ip) {
  if (!ip) return null;
  let out = String(ip).trim();
  if (out.startsWith('::ffff:')) out = out.slice(7);
  return out;
}

module.exports = { terminalIpAllowlist, terminalToken };
