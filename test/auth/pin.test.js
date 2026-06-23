// Auth — PIN credential helpers (functions/_lib/pin.js). PBKDF2 via WebCrypto (global in Node 20+).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSalt,
  hashPin,
  verifyPin,
  validPinFormat,
  validPinEntry,
  randomPin,
} from '../../functions/_lib/pin.js';

test('hashPin is deterministic for the same pin + salt', async () => {
  const salt = 'fixed-salt';
  const a = await hashPin('123456', salt);
  const b = await hashPin('123456', salt);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/, 'hash is 256-bit hex');
});

test('hashPin changes with the salt (no rainbow reuse)', async () => {
  assert.notEqual(await hashPin('123456', 's1'), await hashPin('123456', 's2'));
});

test('hashPin changes with the pin', async () => {
  const salt = newSalt();
  assert.notEqual(await hashPin('111111', salt), await hashPin('222222', salt));
});

test('verifyPin accepts the correct pin and rejects wrong ones', async () => {
  const salt = newSalt();
  const hash = await hashPin('654321', salt);
  assert.equal(await verifyPin('654321', salt, hash), true);
  assert.equal(await verifyPin('000000', salt, hash), false);
});

test('verifyPin fails closed on missing salt/hash', async () => {
  assert.equal(await verifyPin('123456', '', ''), false);
  assert.equal(await verifyPin('123456', 'salt', ''), false);
});

test('validPinFormat enforces 6–10 digits (set-time policy)', () => {
  assert.equal(validPinFormat('123456'), true);
  assert.equal(validPinFormat('1234567890'), true);
  assert.equal(validPinFormat('12345'), false, 'too short');
  assert.equal(validPinFormat('12345678901'), false, 'too long');
  assert.equal(validPinFormat('12a456'), false, 'non-digit');
  assert.equal(validPinFormat(123456), false, 'non-string');
});

test('validPinEntry tolerates legacy 4-digit PINs (entry-time)', () => {
  assert.equal(validPinEntry('1234'), true);
  assert.equal(validPinEntry('123'), false);
  assert.equal(validPinEntry('1234567890'), true);
});

test('newSalt returns hex of the requested byte length', () => {
  assert.match(newSalt(16), /^[0-9a-f]{32}$/);
  assert.match(newSalt(8), /^[0-9a-f]{16}$/);
});

test('randomPin always produces a zero-padded 6-digit string', () => {
  for (let i = 0; i < 50; i++) assert.match(randomPin(), /^[0-9]{6}$/);
});
