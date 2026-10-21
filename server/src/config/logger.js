'use strict';

/**
 * Strukturali logger.
 * - ishlab chiqishda: o'qilishi qulay
 * - ishlab chiqarishda: JSON qatorlar (log agregatorlar uchun)
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 2;
const asJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

/** So'nggi so'rov identifikatori (request id) */
let currentRequestId = null;
const setRequestId = (id) => {
  currentRequestId = id;
};
const getRequestId = () => currentRequestId;

function write(level, args) {
  if ((LEVELS[level] ?? 2) > current) return;

  if (asJson) {
    const payload = {
      time: new Date().toISOString(),
      level,
      requestId: currentRequestId,
      msg: args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' '),
    };
    // eslint-disable-next-line no-console
    console[level === 'debug' ? 'log' : level](JSON.stringify(payload));
    return;
  }

  const prefix = currentRequestId ? ` [${currentRequestId.slice(0, 8)}]` : '';
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level](
    `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)}${prefix}`,
    ...args
  );
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

const logger = {
  error: (...args) => write('error', args),
  warn: (...args) => write('warn', args),
  info: (...args) => write('info', args),
  debug: (...args) => write('debug', args),
  setRequestId,
  getRequestId,
  child: (bindings) => ({
    error: (...args) => write('error', [bindings, ...args]),
    warn: (...args) => write('warn', [bindings, ...args]),
    info: (...args) => write('info', [bindings, ...args]),
    debug: (...args) => write('debug', [bindings, ...args]),
  }),
};

module.exports = logger;
