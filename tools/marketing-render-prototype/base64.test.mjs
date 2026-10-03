import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeBase64, encodeBase64Fallback } from './base64.mjs';

function check(bytes) {
  const original = bytes.slice();
  const expected = Buffer.from(bytes).toString('base64');
  assert.equal(encodeBase64Fallback(bytes), expected);
  assert.equal(encodeBase64(bytes), expected);
  assert.deepEqual(bytes, original, 'encoding must preserve the input');
}

test('all 256 byte values encode canonically', () => {
  check(Uint8Array.from({ length: 256 }, (_, index) => index));
});

test('empty input, modulo-three tails, and chunk boundaries', () => {
  for (const length of [0, 1, 2, 3, 4, 5, 6, 12286, 12287, 12288, 12289, 12290, 12291, 24575, 24576, 24577]) {
    check(Uint8Array.from({ length }, (_, index) => (index * 37 + 13) & 255));
  }
});

test('offset views encode only their visible bytes and preserve backing storage', () => {
  const backing = Uint8Array.from({ length: 12310 }, (_, index) => (index * 17) & 255);
  const original = backing.slice();
  for (const length of [0, 1, 2, 3, 12288, 12289, 12290]) {
    check(backing.subarray(7, 7 + length));
  }
  assert.deepEqual(backing, original);
});

test('five MiB input does not require argument expansion', () => {
  check(Uint8Array.from({ length: 5 * 1024 * 1024 }, (_, index) => (index * 31 + 7) & 255));
});

test('native method agrees with the fallback when available', {
  skip: typeof Uint8Array.prototype.toBase64 !== 'function',
}, () => {
  const bytes = Uint8Array.from({ length: 12290 }, (_, index) => index & 255);
  assert.equal(encodeBase64(bytes), Uint8Array.prototype.toBase64.call(bytes));
  check(bytes);
});

test('unsupported inputs are rejected consistently', () => {
  for (const input of [null, undefined, [], new Uint16Array(3), new ArrayBuffer(3)]) {
    assert.throws(() => encodeBase64(input), TypeError);
    assert.throws(() => encodeBase64Fallback(input), TypeError);
  }
});
