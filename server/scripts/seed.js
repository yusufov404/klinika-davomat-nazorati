'use strict';

/**
 * Boshlang'ich ma'lumotlar: rollar, smenalar, ta'til turlari, admin foydalanuvchisi.
 * Ishga tushirish:  npm run seed
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { sequelize, Role, Shift, LeaveType, User } = require('../src/models');
const logger = require('../src/config/logger');

const ROLES = [
  { name: 'superadmin', description: "Tizimning to'liq huquqlari" },
  { name: 'adminka', description: "Boshqa ma'mur — admin bilan bir xil to'liq huquq" },
  { name: 'glavniy_vrach', description: "Glavniy vrach — ko'rish va tasdiqlash" },
  { name: 'hr_head', description: "Kadrlar bo'limi boshlig'i" },
  { name: 'director', description: 'Direktor — hisobotlar va tasdiqlash' },
  { name: 'accountant', description: "Hisobchi — faqat ko'rish va eksport" },
  { name: 'staff', description: "Klinika xodimi — faqat o'z paneli" },
];

/**
 * Tizimga kirish uchun yaratiladigan asosiy hisoblar.
 * Parollar .env dan olinadi (yoki standart qiymat).
 */
const ACCOUNTS = [
  {
    username: 'admin',
    role: 'superadmin',
    envKey: 'ADMIN_PASSWORD',
    defaultPassword: 'Admin@12345',
  },
  {
    username: 'adminka',
    role: 'adminka',
    envKey: 'ADMINKA_PASSWORD',
    defaultPassword: 'Adminka@12345',
  },
  {
    username: 'glavniy_vrach',
    role: 'glavniy_vrach',
    envKey: 'GLAVNIY_VRACH_PASSWORD',
    defaultPassword: 'Vrach@12345',
  },
];

const SHIFTS = [
  {
    name: 'Kunduzgi 08:00-17:00',
    startTime: '08:00',
    endTime: '17:00',
    crossesMidnight: false,
    graceLateMinutes: 10,
    graceEarlyMinutes: 10,
    breakMinutes: 60,
  },
  {
    name: 'Kunduzgi 09:00-18:00',
    startTime: '09:00',
    endTime: '18:00',
    crossesMidnight: false,
    graceLateMinutes: 10,
    graceEarlyMinutes: 10,
    breakMinutes: 60,
  },
  {
    name: 'Tungi 20:00-08:00',
    startTime: '20:00',
    endTime: '08:00',
    crossesMidnight: true,
    graceLateMinutes: 15,
    graceEarlyMinutes: 15,
    breakMinutes: 45,
  },
  {
    name: '24 soatlik navbatchilik',
    startTime: '08:00',
    endTime: '08:00',
    crossesMidnight: true,
    graceLateMinutes: 30,
    graceEarlyMinutes: 30,
    breakMinutes: 60,
  },
  {
    name: 'Yarim kun (08:00-13:00)',
    startTime: '08:00',
    endTime: '13:00',
    crossesMidnight: false,
    graceLateMinutes: 10,
    graceEarlyMinutes: 5,
    breakMinutes: 0,
  },
];

const LEAVE_TYPES = [
  { name: "Mehnat ta'tili", isPaid: true },
  { name: 'Kasallik', isPaid: true },
  { name: 'Xizmat safari', isPaid: true },
  { name: "O'z hisobidan", isPaid: false },
  { name: 'Tugunish/ota-onalik', isPaid: true },
  { name: 'Harbiy xizmat', isPaid: true },
];

async function seed({ closeConnection = true } = {}) {
  await sequelize.authenticate();
  logger.info('Seed boshlandi');
  for (const r of ROLES) {
    await Role.findOrCreate({ where: { name: r.name }, defaults: r });
  }
  logger.info(`Rolalar: ${ROLES.length}`);

  for (const s of SHIFTS) {
    await Shift.findOrCreate({ where: { name: s.name }, defaults: s });
  }
  logger.info(`Smenalar: ${SHIFTS.length}`);

  for (const l of LEAVE_TYPES) {
    await LeaveType.findOrCreate({ where: { name: l.name }, defaults: l });
  }
  logger.info(`Ta'til turlari: ${LEAVE_TYPES.length}`);

  // Admin foydalanuvchi
  for (const acc of ACCOUNTS) {
    const password = process.env[acc.envKey] || acc.defaultPassword;
    const existing = await User.findOne({ where: { username: acc.username } });
    if (!existing) {
      const role = await Role.findOne({ where: { name: acc.role } });
      await User.create({
        username: acc.username,
        fullName:
          acc.role === 'glavniy_vrach'
            ? 'Glavniy vrach'
            : acc.role === 'adminka'
              ? 'Boshqa administrator'
              : 'Tizim administratori',
        roleId: role.id,
        isActive: true,
        passwordHash: await bcrypt.hash(password, 12),
      });
      logger.info(`Hisob yaratildi: ${acc.username} / ${acc.role}  (parol: ${password})`);
      logger.warn(`!!! ${acc.username} parolini darhol o'zgartiring !!!`);
    } else {
      logger.info(`Hisob mavjud: ${acc.username}`);
    }
  }

  logger.info('Seed yakunlandi');
  if (closeConnection) await sequelize.close();
}

if (require.main === module) {
  seed({ closeConnection: true }).catch((err) => {
    logger.error('Seed xatosi:', err);
    process.exit(1);
  });
}

module.exports = seed;
