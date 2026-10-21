'use strict';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const badRequest = (msg, details) => new AppError(msg, 400, 'bad_request', details);
const unauthorized = (msg = 'Autentifikatsiya talab qilinadi') =>
  new AppError(msg, 401, 'unauthorized');
const forbidden = (msg = "Ruxsat yo'q") => new AppError(msg, 403, 'forbidden');
const notFound = (msg = 'Topilmadi') => new AppError(msg, 404, 'not_found');
const conflict = (msg, details) => new AppError(msg, 409, 'conflict', details);
const tooMany = (msg = "Juda ko'p urinish") => new AppError(msg, 429, 'too_many_requests');

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany };
