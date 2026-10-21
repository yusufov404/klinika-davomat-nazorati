'use strict';

const crypto = require('crypto');
const config = require('../config');

const ALGO = 'aes-256-gcm';

function getKey() {
  const raw = config.encryptionKey;
  if (!raw || raw.length < 32) {
    throw new Error(
      "ENCRYPTION_KEY topilmadi yoki noto'g'ri. 32 baytli kalit (64 hex belgi) kerak. .env.example faylini ko'ring."
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Terminal parolini bazada shifrlangan holda saqlash.
 * @param {string} plain
 * @returns {string} "iv:tag:ciphertext:authTag" formatida
 */
function encrypt(plain) {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function decrypt(value) {
  if (!value) return null;
  try {
    const [ivB64, tagB64, dataB64] = value.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
