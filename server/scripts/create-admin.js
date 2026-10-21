'use strict';

/**
 * Yangi admin foydalanuvchi yaratish.
 * Ishga tushirish: node scripts/create-admin.js <username> <password> [full name] [role]
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { sequelize, Role, User } = require('../src/models');
const logger = require('../src/config/logger');

async function main() {
  const [username, password, fullName, roleName] = process.argv.slice(2);

  if (!username || !password) {
    console.log(
      'Foydalanish: node scripts/create-admin.js <username> <password> [full name] [role]'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
    process.exit(1);
  }

  await sequelize.authenticate();

  const role = await Role.findOne({ where: { name: roleName || 'superadmin' } });
  if (!role) {
    console.error(
      `Rol topilmadi: ${roleName}. Mavjud rollar: superadmin, hr_head, director, accountant`
    );
    process.exit(1);
  }

  const user = await User.create({
    username,
    fullName: fullName || username,
    roleId: role.id,
    isActive: true,
    passwordHash: await bcrypt.hash(password, 12),
  });

  logger.info(`Foydalanuvchi yaratildi: ${user.username} (${role.name})`);
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
