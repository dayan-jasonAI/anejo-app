// Studio content pipeline — extractJson tolerance (functions/api/hub/kitchen/studio/content.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../../functions/api/hub/kitchen/studio/content.js';

test('parses a bare JSON object', () => {
  assert.deepEqual(extractJson('{"a":1,"b":"x"}'), { a: 1, b: 'x' });
});

test('parses JSON wrapped in ```json fences + prose', () => {
  const text = 'Sure! Here is the content:\n```json\n{"caption_en":"Hi","caption_es":"Hola"}\n```\nHope that helps.';
  assert.deepEqual(extractJson(text), { caption_en: 'Hi', caption_es: 'Hola' });
});

test('handles nested braces correctly (balanced scan)', () => {
  assert.deepEqual(extractJson('noise {"a":{"b":2},"c":3} trailing'), { a: { b: 2 }, c: 3 });
});

test('returns null when there is no JSON object', () => {
  assert.equal(extractJson('just prose, no json here'), null);
});

test('returns null on malformed JSON', () => {
  assert.equal(extractJson('{"a": 1, oops}'), null);
});

test('returns null on empty / nullish input', () => {
  assert.equal(extractJson(''), null);
  assert.equal(extractJson(null), null);
  assert.equal(extractJson(undefined), null);
});
