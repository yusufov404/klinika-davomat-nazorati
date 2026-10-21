'use strict';

const TZ = process.env.TZ || 'Asia/Tashkent';
process.env.TZ = TZ;

/**
 * Sana/vaqt yordamchilari. Barcha hisoblar Asia/Tashkent (UTC+5) zonasida.
 * Bazada vaqtlar timestamptz; ilovada JS Date (UTC) saqlanadi,
 * lekin "kun" chegaralari TZ zonasida hisoblanadi.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' formatidagi sana (TZ bo'yicha) */
function dateKey(date = new Date()) {
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-US va UTC offsetni qo'lda o'zgartiramiz
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Sana kaliti => Date (mahalliy kunning 00:00 UTC+5) */
function startOfDay(dateKeyStr) {
  const [y, m, d] = dateKeyStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5 * 60 * 60 * 1000);
}

/** Sana kaliti uchun kun oxirgi vaqti (23:59:59.999 UTC+5) */
function endOfDay(dateKeyStr) {
  return new Date(startOfDay(dateKeyStr).getTime() + DAY_MS - 1);
}

/** +kunlar */
function addDays(dateKeyStr, days) {
  return dateKey(new Date(startOfDay(dateKeyStr).getTime() + days * DAY_MS));
}

/** 'HH:mm' => minutlar */
function timeToMinutes(time) {
  if (!time) return 0;
  const [h, m] = String(time).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 'HH:mm:ss' yoki ISO sanani TZ bo'yicha 'HH:mm' ga aylantirish */
function toMinutesInTz(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(date));
  const get = (t) => parts.find((p) => p.type === t).value;
  return Number(get('hour')) * 60 + Number(get('minute'));
}

/** 'HH:mm' formatini qaytarish */
function minutesToTime(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Haftaning kuni (1=Dushanba ... 7=Yakshanba) */
function weekday(dateKeyStr) {
  const d = startOfDay(dateKeyStr);
  // UTC da 1970-01-01 = Thursday (4)
  const day = d.getUTCDay(); // 0=Sunday
  return day === 0 ? 7 : day;
}

/** Bugungi sana kaliti */
function today() {
  return dateKey(new Date());
}

/** Oyning oxirgi kuni */
function endOfMonth(year, month) {
  return dateKey(new Date(Date.UTC(year, month, 0, 12, 0, 0) - 5 * 60 * 60 * 1000));
}

/** Dushanbadan boshlab oy sanalari */
function monthDates(year, month) {
  const out = [];
  const last = endOfMonth(year, month);
  let cur = dateKey(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0) - 5 * 60 * 60 * 1000));
  while (cur <= last) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function minutesToHours(min) {
  return Math.round((min / 60) * 100) / 100;
}

module.exports = {
  TZ,
  DAY_MS,
  dateKey,
  startOfDay,
  endOfDay,
  addDays,
  timeToMinutes,
  toMinutesInTz,
  minutesToTime,
  weekday,
  today,
  endOfMonth,
  monthDates,
  minutesToHours,
};
