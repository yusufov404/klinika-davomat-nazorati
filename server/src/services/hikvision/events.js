'use strict';

const config = require('../../config');

/**
 * Hikvision eventlarini yagona formatga keltirish.
 * Terminal yuborgan payload turli bo'lishi mumkin:
 *   - { eventType, majorEventType, subEventType, AccessControllerEvent: {...} }
 *   - { ...AccessControllerEvent maydonlari to'g'ridan-to'g'ri... }
 *   - packetInfo ichida JSON string
 *   - XML (ba'zi firmwarelar) -> JSON konvertatsiya qilinadi
 */

const ACCEPT_MAJOR = config.hikvision.acceptMajor;
const ACCEPT_MINOR = config.hikvision.acceptMinor;
const CARD_MINOR = '73';

function firstDefined(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** XML -> oddiy obyekt (faqat event maydonlari uchun, regex asosida) */
function xmlToObject(xml) {
  const out = {};
  const re = /<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * @param {object|string|Buffer} raw
 * @returns {object|null} Normalize qilingan event yoki null
 */
function normalizeEvent(raw) {
  let payload = raw;

  if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        payload = JSON.parse(trimmed);
      } catch (e) {
        return null;
      }
    } else if (trimmed.startsWith('<')) {
      payload = xmlToObject(trimmed);
    } else {
      return null;
    }
  }

  if (!payload || typeof payload !== 'object') return null;

  // "packetInfo" maydoni ichida JSON bo'lishi mumkin
  if (payload.packetInfo && typeof payload.packetInfo === 'string') {
    try {
      payload = { ...payload, ...JSON.parse(payload.packetInfo) };
    } catch (e) {
      /* davom etamiz */
    }
  }

  const nested = payload.AccessControllerEvent || payload.accessControllerEvent || {};
  const merged = { ...payload, ...nested };

  const major = firstDefined(merged.majorEventType, payload.majorEventType);
  const minor = firstDefined(merged.subEventType, payload.subEventType);

  const eventTypeName = firstDefined(
    merged.eventTypeName,
    payload.eventTypeName,
    payload.eventType
  );

  const employeeNo = firstDefined(
    merged.employeeNoString,
    merged.employeeNo,
    merged.userId,
    merged.userID
  );

  const dateTime = firstDefined(merged.dateTime, merged.timestamp, merged.time, payload.dateTime);

  const serialNo = firstDefined(merged.serialNo, merged.eventID, payload.serialNo);
  const terminalSerial = firstDefined(
    merged.terminalSerialNo,
    merged.deviceSerialNo,
    payload.terminalSerialNo
  );

  const verifyMode = firstDefined(
    merged.currentVerifyMode,
    merged.verifyMode,
    payload.currentVerifyMode
  );

  const normalized = {
    majorEventType: major === undefined ? null : parseInt(major, 10),
    subEventType: minor === undefined ? null : parseInt(minor, 10),
    eventTypeName: eventTypeName || null,
    employeeNo: employeeNo === undefined ? null : String(employeeNo).trim(),
    name: firstDefined(merged.name, merged.userName, payload.name) || null,
    dateTime: dateTime || null,
    serialNo: serialNo === undefined ? null : String(serialNo),
    terminalSerialNo: terminalSerial ? String(terminalSerial) : null,
    verifyMode: verifyMode ? String(verifyMode) : null,
    raw: payload,
  };

  if (normalized.majorEventType === null || normalized.subEventType === null) {
    normalized.accepted = false;
    normalized.rejectReason = 'Event turi aniqlanmadi';
    return normalized;
  }

  const majorOk = ACCEPT_MAJOR.includes(String(normalized.majorEventType));
  const minorOk =
    ACCEPT_MINOR.includes(String(normalized.subEventType)) ||
    (config.hikvision.allowCardEvents && String(normalized.subEventType) === CARD_MINOR);

  normalized.accepted = majorOk && minorOk;
  if (!normalized.accepted) {
    normalized.rejectReason = `Event turi qabul qilinmadi (${normalized.majorEventType}/${normalized.subEventType})`;
  }
  return normalized;
}

/**
 * Terminal vaqti formatini Date ga o'girish.
 * Hikvision ko'pincha "2026-01-01T10:00:00+05:00" yoki "2026-01-01T10:00:00" (UTC?) yuboradi.
 */
function parseEventTime(dateTime) {
  if (!dateTime) return null;
  // "2026-01-01T10:00:00" (timezone'siz) -> Asia/Tashkent deb hisoblaymiz
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(String(dateTime).trim());
  const iso = hasTz ? dateTime : `${dateTime}+05:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date(String(dateTime).replace(' ', 'T'));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return d;
}

module.exports = { normalizeEvent, parseEventTime, xmlToObject };
