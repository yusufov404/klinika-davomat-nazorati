'use strict';

const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../middlewares/errorHandler');
const { authenticate } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimit');
const AuthService = require('../services/auth.service');
const { badRequest } = require('../utils/errors');
const { User, Role, RefreshToken } = require('../models');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(1, 'Login kiritilishi shart'),
  password: z.string().min(1, 'Parol kiritilishi shart'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

/**
 * Parol kuchliligi tekshiruvi.
 * Kamida 8 belgi, katta/kichik harf, raqam va maxsus belgi.
 */
function validatePasswordStrength(password) {
  const errors = [];
  if (password.length < 8) errors.push('kamida 8 ta belgi');
  if (!/[a-z]/.test(password)) errors.push('kichik harf');
  if (!/[A-Z]/.test(password)) errors.push('katta harf');
  if (!/\d/.test(password)) errors.push('raqam');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('maxsus belgi');
  return errors;
}

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await AuthService.login({
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.ok(result);
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const data = refreshSchema.parse(req.body);
    if (!data.refreshToken) throw badRequest('refreshToken kerak');
    const result = await AuthService.refresh({
      refreshToken: data.refreshToken,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.ok(result);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const result = await AuthService.logout({
      refreshToken: req.body && req.body.refreshToken,
      userId: req.user ? req.user.id : null,
    });
    res.ok(result);
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user.id, { include: [{ model: Role }] });
    res.ok(await AuthService.publicUser(user));
  })
);

/**
 * POST /api/auth/password — o'z parolini o'zgartirish.
 */
router.post(
  '/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        currentPassword: z.string().min(1, 'Joriy parol kiritilishi shart'),
        newPassword: z.string().min(8, 'Yangi parol kamida 8 ta belgi'),
        confirmPassword: z.string().min(1, 'Parolni tasdiqlang'),
      })
      .refine((d) => d.newPassword === d.confirmPassword, {
        message: 'Yangi parollar mos kelmadi',
        path: ['confirmPassword'],
      })
      .parse(req.body);

    const user = await User.findByPk(req.user.id);
    if (!user) throw badRequest('Foydalanuvchi topilmadi');

    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) throw badRequest("Joriy parol noto'g'ri");

    if (data.currentPassword === data.newPassword) {
      throw badRequest('Yangi parol joriy paroldan farq qilishi kerak');
    }

    const weak = validatePasswordStrength(data.newPassword);
    if (weak.length) {
      throw badRequest(`Parol quyi boshi: ${weak.join(', ')} talab qilinadi`);
    }

    await user.update({
      passwordHash: await bcrypt.hash(data.newPassword, 12),
      mustChangePassword: false,
    });

    // Barcha eski sessiyalarni bekor qilamiz (xavfsizlik)
    await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id } });

    res.ok({
      changed: true,
      message: "Parol o'zgartirildi. Boshqa qurilmadan kirish uchun qayta login qiling.",
    });
  })
);

/**
 * PUT /api/auth/profile — o'z profilini yangilash (ism, telefon).
 */
router.put(
  '/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        fullName: z.string().min(3).max(200).optional(),
        phone: z.string().max(30).nullish(),
      })
      .parse(req.body || {});

    const user = await User.findByPk(req.user.id);
    if (!user) throw badRequest('Foydalanuvchi topilmadi');

    await user.update({
      fullName: data.fullName !== undefined ? data.fullName : user.fullName,
      phone: data.phone !== undefined ? data.phone : user.phone,
    });

    const fresh = await User.findByPk(user.id, { include: [{ model: Role }] });
    res.ok(await AuthService.publicUser(fresh));
  })
);

/**
 * GET /api/auth/sessions — faol sessiyalar (kirish tarixi).
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessions = await RefreshToken.findAll({
      where: { userId: req.user.id, revokedAt: null },
      order: [['createdAt', 'DESC']],
      limit: 20,
    });

    res.list(
      sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: s.ipAddress === req.ip,
      }))
    );
  })
);

/**
 * DELETE /api/auth/sessions — boshqa sessiyalarni bekor qilish.
 */
router.delete(
  '/sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const deleted = await RefreshToken.destroy({
      where: { userId: req.user.id, revokedAt: null },
    });
    res.ok({ revoked: deleted });
  })
);

module.exports = router;
module.exports.validatePasswordStrength = validatePasswordStrength;
