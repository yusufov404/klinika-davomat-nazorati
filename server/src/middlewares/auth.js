'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { unauthorized, forbidden } = require('../utils/errors');
const { User, Role, RolePermission } = require('../models');
const { resolvePermissions, can } = require('../config/rbac');

/**
 * Foydalanuvchining effective huquqlarini hisoblash.
 * (bazadagi role_permissions sozlamalari + dasturiy standartlar)
 */
async function loadPermissions(user) {
  const roleName = user.Role ? user.Role.name : null;
  if (!roleName) return [];

  const rows = await RolePermission.findAll({ where: { roleId: user.roleId } });
  return resolvePermissions(roleName, rows);
}

/**
 * JWT access token tekshiruvchi.
 */
async function authenticate(req, res, next) {
  try {
    // Tashqi integratsiyalar uchun API kaliti (X-API-Key)
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const ApiKeyService = require('../services/apiKey.service');
      const record = await ApiKeyService.verify(apiKey);
      if (!record) throw unauthorized("API kaliti noto'g'ri yoki muddati tugagan");
      req.user = {
        id: null,
        username: `apikey:${record.keyPrefix}`,
        fullName: record.name,
        role: 'api_key',
        roleId: null,
        permissions: record.scopes && record.scopes.length ? record.scopes : ['*'],
        apiKey: record,
      };
      return next();
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.access_token;

    if (!token) throw unauthorized();

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret, { issuer: config.jwt.issuer });
    } catch (err) {
      throw unauthorized('Token yaroqsiz yoki muddati tugagan');
    }

    const user = await User.findByPk(decoded.sub, { include: [{ model: Role }] });
    if (!user || !user.isActive) throw unauthorized('Foydalanuvchi faol emas');

    const permissions = await loadPermissions(user);

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.Role ? user.Role.name : null,
      roleId: user.roleId,
      permissions,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Rol bo'yicha huquq tekshiruvchi.
 * @param {...string} permissions "employees:write" kabi
 */
function requirePermission(...permissions) {
  return (req, res, next) => {
    const list = req.user ? req.user.permissions : [];
    const allowed = permissions.every((p) => can(list, p));
    if (!allowed) {
      return next(forbidden("Bu amalga huquqingiz yo'q"));
    }
    next();
  };
}

/**
 * Rolni tekshirish (rol nomi bo'yicha).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(forbidden("Bu rol uchun ruxsat yo'q"));
    }
    next();
  };
}

module.exports = { authenticate, requirePermission, requireRole, loadPermissions };
