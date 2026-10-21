'use strict';

/**
 * Rol huquqlari (RBAC).
 *
 * 1) Dasturiy standartlar — `PERMISSIONS` (quyidagi jadval).
 * 2) Bazadagi sozlamalar — `role_permissions` jadvali orqali istalgan rolda
 *    huquqni YOQISH yoki YOQILISH mumkin (admin panel → Sozlamalar → Rollar).
 *    Agar rolda bitta ham qator bo'lmasa — dasturiy standartlar qo'llaniladi.
 *
 * Superadmin barcha huquqlarga ega.
 * Huquq formatı: "resurs:amal"  (masalan "employees:read", "employees:write")
 */
const PERMISSIONS = {
  superadmin: ['*'],

  // Tizim administratori / boshqa ma'mur
  adminka: ['*'],

  // Glavniy vrach — ko'rish va tasdiqlash
  glavniy_vrach: [
    'employees:read',
    'departments:read',
    'positions:read',
    'shifts:read',
    'schedules:read',
    'holidays:read',
    'leave-types:read',
    'leaves:read',
    'leaves:approve',
    'attendance:read',
    'timesheets:read',
    'timesheets:approve',
    'reports:read',
    'reports:export',
    'terminals:read',
    'audit:read',
  ],

  // Kadrlar bo'limi boshlig'i
  hr_head: [
    'employees:read',
    'employees:write',
    'departments:read',
    'departments:write',
    'positions:read',
    'positions:write',
    'shifts:read',
    'shifts:write',
    'schedules:read',
    'schedules:write',
    'holidays:read',
    'holidays:write',
    'leave-types:read',
    'leaves:read',
    'leaves:write',
    'leaves:approve',
    'attendance:read',
    'attendance:write',
    'attendance:adjust',
    'timesheets:read',
    'timesheets:write',
    'timesheets:approve',
    'reports:read',
    'reports:export',
    'terminals:read',
    'terminals:write',
    'terminals:sync',
    'audit:read',
  ],

  // Direktor
  director: [
    'employees:read',
    'departments:read',
    'positions:read',
    'shifts:read',
    'schedules:read',
    'holidays:read',
    'leave-types:read',
    'leaves:read',
    'leaves:approve',
    'attendance:read',
    'timesheets:read',
    'timesheets:approve',
    'reports:read',
    'reports:export',
    'terminals:read',
    'audit:read',
  ],

  // Hisobchi
  accountant: [
    'employees:read',
    'departments:read',
    'shifts:read',
    'leave-types:read',
    'attendance:read',
    'timesheets:read',
    'reports:read',
    'reports:export',
  ],

  // Klinika xodimi — faqat o'z paneli ("Menim panel" / /api/my/*)
  // Boshqa xodimlar ma'lumotini ko'ra olmaydi.
  staff: [],
};

const ROLE_NAMES = Object.keys(PERMISSIONS);

/**
 * Barcha mumkin bo'lgan huquqlar ro'yxati (paneldagi matritsa uchun).
 */
const ALL_PERMISSIONS = [
  'employees:read',
  'employees:write',
  'departments:read',
  'departments:write',
  'positions:read',
  'positions:write',
  'shifts:read',
  'shifts:write',
  'schedules:read',
  'schedules:write',
  'holidays:read',
  'holidays:write',
  'leave-types:read',
  'leaves:read',
  'leaves:write',
  'leaves:approve',
  'attendance:read',
  'attendance:write',
  'attendance:adjust',
  'timesheets:read',
  'timesheets:write',
  'timesheets:approve',
  'reports:read',
  'reports:export',
  'terminals:read',
  'terminals:write',
  'terminals:sync',
  'users:read',
  'users:write',
  'audit:read',
];

/**
 * Rolning effective huquqlarini hisoblash.
 *
 * @param {string} roleName
 * @param {Array<{permission:string, enabled:boolean}>} [rows] role_permissions jadvalidan
 * @returns {string[]}
 */
function resolvePermissions(roleName, rows) {
  const base = new Set(PERMISSIONS[roleName] || []);
  if (!rows || !rows.length) return Array.from(base);

  for (const row of rows) {
    if (row.enabled) base.add(row.permission);
    else base.delete(row.permission);
  }
  return Array.from(base);
}

/**
 * Huquqni tekshirish.
 * @param {string[]} permissions effective huquqlar
 * @param {string} permission masalan "employees:write"
 */
function can(permissions, permission) {
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;
  const [resource] = String(permission).split(':');
  return permissions.includes(`${resource}:*`);
}

module.exports = { PERMISSIONS, ROLE_NAMES, ALL_PERMISSIONS, resolvePermissions, can };
