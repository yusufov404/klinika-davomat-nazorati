'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { User, Role, RefreshToken, LoginAttempt } = require('../models');
const { unauthorized, tooMany } = require('../utils/errors');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

class AuthService {
  /**
   * Login
   */
  static async login({ username, password, code, ipAddress, userAgent }) {
    // Bloklashni tekshirish
    const attempts = await LoginAttempt.count({
      where: {
        username,
        ipAddress,
        success: false,
        attemptedAt: {
          [require('sequelize').Op.gte]: new Date(Date.now() - LOCK_MINUTES * 60 * 1000),
        },
      },
    });
    if (attempts >= MAX_ATTEMPTS) {
      throw tooMany(`Juda ko'p xato urinish. ${LOCK_MINUTES} daqiqa kutib turing.`);
    }

    const user = await User.findOne({
      where: { username },
      include: [{ model: Role }],
    });

    const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));

    await LoginAttempt.create({ username, ipAddress, success: Boolean(ok) });

    if (!ok) {
      throw unauthorized("Login yoki parol noto'g'ri");
    }

    // Ikki omilli autentifikatsiya (2FA)
    if (user.twoFactorEnabled) {
      const TwoFactorService = require('./twoFactor.service');
      const secret = TwoFactorService.decrypt(user.twoFactorSecret);
      if (!secret) {
        throw unauthorized("2FA sozlamasi buzilgan. Administrator bilan bog'laning.");
      }
      if (!code) {
        const err = unauthorized('Ikki omilli autentifikatsiya kodi talab qilinadi');
        err.code = '2fa_required';
        throw err;
      }
      if (!TwoFactorService.verify(secret, code)) {
        const err = unauthorized("2FA kodi noto'g'ri");
        err.code = '2fa_invalid';
        throw err;
      }
    }

    await user.update({ lastLoginAt: new Date(), lastLoginIp: ipAddress || null });

    const tokens = await AuthService.issueTokens(user, { ipAddress, userAgent });
    return { user: await AuthService.publicUser(user), ...tokens };
  }

  /**
   * Access + refresh tokenlar.
   */
  static async issueTokens(user, { ipAddress, userAgent } = {}) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.Role ? user.Role.name : null,
      fullName: user.fullName,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessTtl,
      issuer: config.jwt.issuer,
    });

    const refreshToken = jwt.sign(
      { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTtl, issuer: config.jwt.issuer }
    );

    const decoded = jwt.decode(refreshToken);
    await RefreshToken.create({
      userId: user.id,
      tokenHash: AuthService.hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
      userAgent: userAgent ? String(userAgent).slice(0, 250) : null,
      ipAddress: ipAddress || null,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh token bilan yangilash (rotatsiya: eski token bekor qilinadi).
   */
  static async refresh({ refreshToken, ipAddress, userAgent }) {
    if (!refreshToken) throw unauthorized('Refresh token kerak');

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, { issuer: config.jwt.issuer });
    } catch (e) {
      throw unauthorized('Refresh token yaroqsiz yoki muddati tugagan');
    }

    const stored = await RefreshToken.findOne({
      where: { tokenHash: AuthService.hashToken(refreshToken) },
    });
    if (!stored || stored.revokedAt) throw unauthorized('Refresh token bekor qilingan');
    if (new Date(stored.expiresAt) < new Date())
      throw unauthorized('Refresh token muddati tugagan');

    const user = await User.findByPk(decoded.sub, { include: [{ model: Role }] });
    if (!user || !user.isActive) throw unauthorized('Foydalanuvchi faol emas');

    // Rotatsiya
    await stored.update({ revokedAt: new Date() });

    const tokens = await AuthService.issueTokens(user, { ipAddress, userAgent });
    return { user: await AuthService.publicUser(user), ...tokens };
  }

  /**
   * Chiqish (refresh token bekor qilinadi).
   */
  static async logout({ refreshToken, userId }) {
    if (refreshToken) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { tokenHash: AuthService.hashToken(refreshToken) } }
      );
    }
    if (userId) {
      await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
    }
    return { success: true };
  }

  static hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  /**
   * Foydalanuvchini ochiq formatda qaytarish.
   */
  static async publicUser(user) {
    const roleName = user.Role ? user.Role.name : null;
    let permissions = [];
    if (roleName) {
      const { RolePermission } = require('../models');
      const { resolvePermissions } = require('../config/rbac');
      const rows = await RolePermission.findAll({ where: { roleId: user.roleId } });
      permissions = resolvePermissions(roleName, rows);
    }
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone || null,
      role: roleName,
      roleId: user.roleId,
      permissions,
      mustChangePassword: Boolean(user.mustChangePassword),
      lastLoginAt: user.lastLoginAt,
    };
  }
}

module.exports = AuthService;
