'use strict';

const crypto = require('crypto');
const logger = require('../config/logger');

/**
 * So'rov konteksti: request id, kirish logi, javob vaqtini o'lchash.
 */
function requestContext(req, res, next) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  req.startedAt = Date.now();
  logger.setRequestId(requestId);
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - req.startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms` +
        (req.user ? ` user=${req.user.username}` : '')
    );

    // Metrikalar
    try {
      const MetricsService = require('../services/metrics.service');
      MetricsService.increment('http_requests_total', {
        method: req.method,
        status: res.statusCode,
        route: req.route ? req.route.path : 'unknown',
      });
      MetricsService.observe('request_duration_seconds', duration / 1000, {
        method: req.method,
        route: req.route ? req.route.path : 'unknown',
      });
    } catch (e) {
      /* metrika yozilmasa asosiy so'rovga xil bo'lmaydi */
    }
  });

  next();
}

module.exports = { requestContext };
