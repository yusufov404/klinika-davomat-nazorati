'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { normalizeEvent, parseEventTime } = require('../src/services/hikvision/events');
const { parseChallenge, buildAuthorization } = require('../src/services/hikvision/digest');

test('normalizeEvent: AccessControllerEvent ichidagi maydonlar', () => {
  const payload = {
    eventType: 'AccessControllerEvent',
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: {
      employeeNoString: '1042',
      name: 'Alisher Karimov',
      dateTime: '2026-01-05T08:01:00+05:00',
      serialNo: 998877,
      terminalSerialNo: 'DS-2CD3T46',
      currentVerifyMode: 'face',
    },
  };

  const ev = normalizeEvent(payload);
  assert.strictEqual(ev.accepted, true);
  assert.strictEqual(ev.employeeNo, '1042');
  assert.strictEqual(ev.name, 'Alisher Karimov');
  assert.strictEqual(ev.serialNo, '998877');
  assert.strictEqual(ev.terminalSerialNo, 'DS-2CD3T46');
  assert.strictEqual(ev.verifyMode, 'face');
  assert.strictEqual(ev.majorEventType, 5);
  assert.strictEqual(ev.subEventType, 75);
});

test('normalizeEvent: packetInfo ichidagi JSON', () => {
  const packetInfo = JSON.stringify({
    majorEventType: 5,
    subEventType: 75,
    AccessControllerEvent: { employeeNoString: '7', dateTime: '2026-01-05T09:00:00+05:00' },
  });
  const ev = normalizeEvent({ packetInfo });
  assert.strictEqual(ev.accepted, true);
  assert.strictEqual(ev.employeeNo, '7');
});

test("normalizeEvent: yuz tanishga tegishli bo'lmagan event rad etiladi", () => {
  const ev = normalizeEvent({ majorEventType: 5, subEventType: 1, employeeNoString: '1' });
  assert.strictEqual(ev.accepted, false);
  assert.ok(ev.rejectReason);
});

test('normalizeEvent: XML format', () => {
  const xml =
    '<EventNotificationAlert><eventType>AccessControllerEvent</eventType>' +
    '<majorEventType>5</majorEventType><subEventType>75</subEventType>' +
    '<AccessControllerEvent><employeeNoString>55</employeeNoString>' +
    '<dateTime>2026-01-05T10:00:00+05:00</dateTime></AccessControllerEvent></EventNotificationAlert>';
  const ev = normalizeEvent(xml);
  assert.strictEqual(ev.accepted, true);
  assert.strictEqual(ev.employeeNo, '55');
});

test("parseEventTime: timezone'siz vaqt Asia/Tashkent hisoblanadi", () => {
  const d = parseEventTime('2026-01-05T08:00:00');
  assert.strictEqual(d.toISOString(), '2026-01-05T03:00:00.000Z');
});

test('parseEventTime: timezone bilan', () => {
  const d = parseEventTime('2026-01-05T08:00:00+05:00');
  assert.strictEqual(d.toISOString(), '2026-01-05T03:00:00.000Z');
});

test('digest: challenge parse va Authorization header', () => {
  const header =
    'Digest realm="IP Camera(12345)", qop="auth", nonce="abc123", opaque="xyz", algorithm=MD5';
  const challenge = parseChallenge(header);
  assert.strictEqual(challenge.realm, 'IP Camera(12345)');
  assert.strictEqual(challenge.nonce, 'abc123');
  assert.strictEqual(challenge.qop, 'auth');

  const auth = buildAuthorization({
    username: 'admin',
    password: 'secret',
    method: 'POST',
    uri: '/ISAPI/AccessControl/AcsEvent?format=json',
    challenge,
    cnonce: 'fixedcnonce',
    nc: 1,
  });

  assert.ok(auth.startsWith('Digest '));
  assert.ok(auth.includes('username="admin"'));
  assert.ok(auth.includes('qop=auth'));
  assert.ok(auth.includes('nc=00000001'));
  assert.ok(auth.includes('cnonce="fixedcnonce"'));
});
