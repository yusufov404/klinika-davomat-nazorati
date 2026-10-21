'use strict';

const crypto = require('crypto');
const base32 = require('base32.js');

/**
 * TOTP (RFC 6238) — 6 raqamli kod, SHA1, 30 soniya davomiylik.
 * Tashqi kutubxonasiz (node crypto + base32) — xavfsizlik uchun
 * `crypto.timingSafeEqual` ishlatiladi.
 */
class TwoFactorService {
  static ISSUER = 'Klinika Davomat';
  static PERIOD = 30;
  static DIGITS = 6;

  /**
   * Yangi maxfiy kalit yaratish (base32).
   */
  static generateSecret() {
    const bytes = crypto.randomBytes(20);
    return base32.encode(bytes).replace(/=+$/, '');
  }

  /**
   * otpauth:// URL (Google Authenticator, Aegis, Authy uchun).
   */
  static otpauthUrl(secret, account) {
    const label = encodeURIComponent(`${TwoFactorService.ISSUER}:${account}`);
    const params = new URLSearchParams({
      secret,
      issuer: TwoFactorService.ISSUER,
      algorithm: 'SHA1',
      digits: String(TwoFactorService.DIGITS),
      period: String(TwoFactorService.PERIOD),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /**
   * Joriy vaqt bo'yicha kod.
   */
  static currentCode(secret, counter = null) {
    const c = counter === null ? Math.floor(Date.now() / 1000 / TwoFactorService.PERIOD) : counter;
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(c, 0);
    const hmac = crypto.createHmac('sha1', base32.decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 10 ** TwoFactorService.DIGITS).padStart(TwoFactorService.DIGITS, '0');
  }

  /**
   * Kodni tekshirish (±1 oyna — telefon vaqti sekin bo'lishi mumkin).
   */
  static verify(secret, code, window = 1) {
    if (!secret || !code) return false;
    const clean = String(code).replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return false;

    const counter = Math.floor(Date.now() / 1000 / TwoFactorService.PERIOD);
    for (let i = -window; i <= window; i += 1) {
      const expected = TwoFactorService.currentCode(secret, counter + i);
      if (
        expected.length === clean.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Maxfiy kalitni shifrlash (bazada xom saqlanmasin).
   */
  static encrypt(secret) {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev', 'two-factor', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  static decrypt(value) {
    if (!value) return null;
    try {
      const [ivB64, tagB64, dataB64] = value.split(':');
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev', 'two-factor', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (e) {
      return null;
    }
  }

  /**
   * Backup (kodi) — foydalanuvchiga bir marta ko'rsatiladi.
   */
  static backupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i += 1) {
      codes.push(crypto.randomBytes(5).toString('hex').toUpperCase());
    }
    return codes;
  }
}

module.exports = TwoFactorService;
