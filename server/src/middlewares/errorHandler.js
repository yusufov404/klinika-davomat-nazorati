'use strict';

const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');
const logger = require('../config/logger');

/**
 * Xatolarni qayta ishlash va (500 xatolar uchun) bazaga yozish.
 */
function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'validation_error',
        message: "Ma'lumotlar to'g'ri emas",
        details: err.issues.map((i) => ({
          field: i.path.join('.') || i.path[0],
          message: i.message,
        })),
      },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, err.stack);
    }
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err && err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      success: false,
      error: { code: 'conflict', message: "Bunday ma'lumot mavjud" },
    });
  }

  if (err && err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      error: { code: 'validation_error', message: err.message },
    });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'bad_request', message: "JSON formati noto'g'ri" },
    });
  }

  logger.error('Kutilmagan xato:', err && err.stack ? err.stack : err);

  // Xatoni bazaga yozamiz (xato kuzatuvi)
  try {
    const ErrorTracking = require('../services/errorTracking.service');
    ErrorTracking.capture(err, {
      path: req.originalUrl,
      method: req.method,
      userId: req.user ? req.user.id : null,
      ip: req.ip,
    }).catch(() => {});
  } catch (e) {
    /* xato kuzatuvida muammo bo'lsa — original xato qaytariladi */
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'internal_error',
      message: 'Server ichki xatosi',
      requestId: req.requestId,
    },
  });
}

function notFound(req, res) {
  return res.status(404).json({
    success: false,
    error: { code: 'not_found', message: `Endpoint topilmadi: ${req.method} ${req.originalUrl}` },
  });
}

/**
 * async handler xatolarini catch qilish uchun.
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, notFound, asyncHandler };
