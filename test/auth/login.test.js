// Auth — identifier normalization (functions/_lib/login.js → normalizeIdentifier).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIdentifier } from '../../functions/_lib/login.js';

test('email is detected and lowercased + trimmed', () => {
  assert.deepEqual(normalizeIdentifier('  Chef@Anejo.TEST '), { kind: 'email', value: 'chef@anejo.test' });
});

test('phone keeps digits only', () => {
  assert.deepEqual(normalizeIdentifier('(561) 555-0102'), { kind: 'phone', value: '5615550102' });
});

test('phone tolerates a +1 country code', () => {
  assert.deepEqual(normalizeIdentifier('+1 561-928-5617'), { kind: 'phone', value: '15619285617' });
});

test('too-few digits is unknown', () => {
  assert.deepEqual(normalizeIdentifier('12345'), { kind: 'unknown', value: '12345' });
});

test('non-email text is unknown', () => {
  assert.deepEqual(normalizeIdentifier('marco'), { kind: 'unknown', value: 'marco' });
});

test('empty / null input is unknown', () => {
  assert.deepEqual(normalizeIdentifier(''), { kind: 'unknown', value: '' });
  assert.deepEqual(normalizeIdentifier(null), { kind: 'unknown', value: '' });
});
