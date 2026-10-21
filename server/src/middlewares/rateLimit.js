'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Login uchun rate limit.
 * Faqat XATO urinishlar hisobga olinadi (muvaffaqiyatli kirishlar hisoblanmaydi) —
 * aks holda kun davomida ko'p kirish qiladigan xodimlar bloklanib qoladi.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'too_many_requests', message: "Juda ko'p xato urinish. Biroz kutib turing." },
  },
});

/**
 * Umumiy API limit.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'too_many_requests', message: "Juda ko'p so'rov" },
  },
});

/**
 * Terminal push endpoint - juda ko\'p event kelmasligi uchun yumshoq limit.
 */
const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false,
  message: { success: false, error: { code: 'too_many_requests', message: 'Limit' } },
});

module.exports = { loginLimiter, apiLimiter, eventLimiter };
