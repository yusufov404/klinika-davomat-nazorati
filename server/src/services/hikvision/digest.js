'use strict';

const crypto = require('crypto');

/**
 * HTTP Digest Authentication (RFC 2617), MD5 va MD5-sess / SHA-256 qo'llab-quvvatlaydi.
 * Hikvision terminallarining standart autentifikatsiyasi shu.
 */

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * "Digest realm="IP Camera(…)", nonce="abc", qop="auth", algorithm=MD5" -> obyekt
 */
function parseChallenge(header) {
  if (!header || !/^Digest\s/i.test(header.trim())) return null;
  const body = header.trim().replace(/^Digest\s+/i, '');
  const out = {};
  const re = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,]*))/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out[m[1].toLowerCase()] = (m[2] !== undefined ? m[2] : m[3]).trim();
  }
  return out;
}

function hashFor(algorithm, str) {
  return /sha-?256/i.test(algorithm || '') ? sha256(str) : md5(str);
}

/**
 * Authorization headerini yasash.
 *
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.password
 * @param {string} opts.method
 * @param {string} opts.uri  masalan "/ISAPI/AccessControl/UserInfo/Record?format=json"
 * @param {object} opts.challenge  parseChallenge natijasi
 * @param {string} [opts.bodyHash]  entity body bo'lsa
 * @param {string} [opts.cnonce]
 * @param {number} [opts.nc]
 * @returns {string} "Digest ..."
 */
function buildAuthorization({
  username,
  password,
  method,
  uri,
  challenge,
  bodyHash,
  cnonce,
  nc = 1,
}) {
  const realm = challenge.realm || '';
  const nonce = challenge.nonce || '';
  const opaque = challenge.opaque;
  const qopRaw = challenge.qop || '';
  const algorithm = challenge.algorithm || 'MD5';
  const qop = /auth(-int)?/i.test(qopRaw) ? (/auth-int/i.test(qopRaw) ? 'auth-int' : 'auth') : null;

  const ha1 = hashFor(algorithm, `${username}:${realm}:${password}`);
  const ha2 =
    qop === 'auth-int'
      ? hashFor(algorithm, `${method}:${uri}:${bodyHash || md5('')}`)
      : hashFor(algorithm, `${method}:${uri}`);

  let response;
  const params = [`username="${username}"`, `realm="${realm}"`, `nonce="${nonce}"`, `uri="${uri}"`];

  if (qop) {
    const n = String(nc).padStart(8, '0');
    const c = cnonce || crypto.randomBytes(8).toString('hex');
    response = hashFor(algorithm, `${ha1}:${nonce}:${n}:${c}:${qop}:${ha2}`);
    params.push(`qop=${qop}`, `nc=${n}`, `cnonce="${c}"`);
  } else {
    response = hashFor(algorithm, `${ha1}:${nonce}:${ha2}`);
  }

  params.push(`response="${response}"`);
  if (opaque) params.push(`opaque="${opaque}"`);
  if (challenge.algorithm) params.push(`algorithm=${challenge.algorithm}`);

  return `Digest ${params.join(', ')}`;
}

module.exports = { parseChallenge, buildAuthorization, md5, sha256 };
