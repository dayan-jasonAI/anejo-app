import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadBrand } from '../../functions/_lib/brand_source.js';
import { trainingContextReceipt, trainingContext, formatTraining } from '../../functions/_lib/training.js';
const sha = text => createHash('sha256').update(text).digest('hex');
function env({ rules = [], examples = [], docs = [], fail = [] } = {}) {
  return { DB: { prepare(sql) { return { bind() { return this; }, async all() {
    const table = /FROM (\w+)/.exec(sql)[1];
    if (fail.includes(table)) throw Error('read unavailable');
    return { results: { training_rules: rules, training_examples: examples, docs }[table] };
  } }; } } };
}
test('training receipt identifies only actual retained nonempty rows and hashes exact string API output', async () => {
  const rules = [{ id: 'blank', text: ' ' }, { id: 'first', text: 'Real food', updated_at: 10 }, { id: 'excluded', text: 'x'.repeat(200) }];
  const e = env({ rules, examples: [{ id: 'example', note: 'warm', flag: 'good', updated_at: 11 }] });
  const cap = formatTraining({ rules: rules.slice(0, 2) }).text.length;
  const r = await trainingContextReceipt(e, { maxChars: cap });
  assert.deepEqual(r.receipt.rules, [{ id: 'first', updated_at: 10 }]);
  assert.deepEqual(r.receipt.examples, []);
  assert.equal(r.receipt.truncated, true);
  assert.equal(r.receipt.rendered_sha256, sha(r.text));
  assert.equal(await trainingContext(e, { maxChars: cap }), r.text);
});
test('training unavailable, partial and empty are distinguishable without fabricated empty-rule proof', async () => {
  assert.equal((await trainingContextReceipt(env())).receipt.read_status, 'empty');
  assert.equal((await trainingContextReceipt({})).receipt.read_status, 'unavailable');
  const partial = await trainingContextReceipt(env({ fail: ['training_rules'], examples: [{ id: 'photo', note: 'retain this' }] }));
  assert.equal(partial.receipt.read_status, 'partial');
  assert.equal(partial.receipt.reads.rules, 'unavailable');
  assert.deepEqual(partial.receipt.rules, []);
  assert.equal(partial.receipt.examples[0].id, 'photo');
});
test('tiny training budgets do not inject headers beyond budget or claim supplied rules', async () => {
  const r = await trainingContextReceipt(env({ rules: [{ id: 'one', text: 'one' }] }), { maxChars: 2 });
  assert.equal(r.text, '');
  assert.equal(r.receipt.supplied_chars, 0);
  assert.deepEqual(r.receipt.rules, []);
  assert.equal(r.receipt.truncated, true);
});
test('brand receipt preserves exact supplied document revisions and counts separators within cap', async () => {
  const e = env({ docs: [{ id: 'a', title: 'A', body: 'alpha', updated_at: 21 }, { id: 'b', title: 'B', body: 'beta', updated_at: 22 }] });
  const r = await loadBrand(e, { maxChars: 14 });
  assert.equal(r.text.length, 14);
  assert.deepEqual(r.receipt.documents.map(d => d.id), ['a', 'b']);
  assert.equal(r.receipt.documents[1].updated_at, 22);
  assert.equal(r.receipt.documents[1].supplied_chars, 1);
  assert.equal(r.receipt.truncated, true);
  assert.equal(r.receipt.rendered_sha256, sha(r.text));
});
test('brand failed read and empty read both retain fallback text with distinct explanations', async () => {
  const unavailable = await loadBrand(env({ fail: ['docs'] }));
  const empty = await loadBrand(env());
  assert.equal(unavailable.source, 'repo');
  assert.equal(unavailable.receipt.read_status, 'unavailable');
  assert.equal(unavailable.receipt.fallback_reason, 'live_read_unavailable');
  assert.equal(empty.receipt.read_status, 'empty');
  assert.equal(empty.receipt.fallback_reason, 'no_usable_live_text');
  assert.equal(unavailable.receipt.rendered_sha256, sha(unavailable.text));
});
test('brand receipt hashes only filtered approved content, and exposes section fallback', async () => {
  const e = env({ docs: [{ id: 'brand', updated_at: 42, body: '## 1. Identity\nApproved\n## Proposed Studio Brief Change\nNot approved\n## 8. Allergens\nCheck first' }] });
  const r = await loadBrand(e, { sections: [8] });
  assert.doesNotMatch(r.text, /Approved|Not approved/);
  assert.match(r.text, /Check first/);
  assert.equal(r.receipt.rendered_sha256, sha(r.text));
  assert.equal(r.receipt.section_fallback, false);
  assert.equal((await loadBrand(e, { sections: [99] })).receipt.section_fallback, true);
});
