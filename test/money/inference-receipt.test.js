import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { persistInferenceReceipt, INFERENCE_REQUEST_MAX_BYTES } from '../../functions/_lib/inference_receipt.js';
const body = { model: 'claude-example', max_tokens: 100, system: 'Approved brand rules', messages: [{ role: 'user', content: 'Plan a draft' }] };
const requestJson = JSON.stringify(body, null, 2);
const args = { surface: 'team_lead', requestJson };
const hash = text => createHash('sha256').update(text).digest('hex');

test('SQLite stores exact serialized request, hash and metadata without claiming provider execution', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  const components = { brand: { schema: 1, source: 'd1', documents: [{ id: 'brand1', updated_at: 123 }], read_status: 'ok', rendered_sha256: hash(body.system), original_chars: 20, supplied_chars: 20, truncated: false }, training: { read_status: 'unavailable', rules: [], reads: { rules: 'unavailable', examples: 'empty' } } };
  const result = await persistInferenceReceipt({ DB }, { ...args, components });
  assert.equal(result.persisted, true);
  const row = DB.one('SELECT * FROM inference_receipts WHERE id=?', result.receipt_id);
  assert.equal(row.request_json, requestJson);
  assert.equal(row.request_sha256, hash(requestJson));
  assert.deepEqual(JSON.parse(row.components_json), components);
  assert.equal(row.evidence_status, 'input_recorded');
  assert.equal(row.transport_status, 'unknown');
  assert.equal(row.model, body.model);
  assert.throws(() => DB.exec("UPDATE inference_receipts SET model='changed'"), /immutable/);
});
test('identical request attempts remain separate evidence records; unknown is not unavailable', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  const a = await persistInferenceReceipt({ DB }, { ...args, components: { menu: { read_status: 'unknown' } } });
  const b = await persistInferenceReceipt({ DB }, { ...args, components: { menu: { read_status: 'unavailable' } } });
  assert.notEqual(a.receipt_id, b.receipt_id);
  assert.equal(a.request_sha256, b.request_sha256);
  assert.equal(DB.rows('SELECT * FROM inference_receipts').length, 2);
});
test('headers, credentials and arbitrary metadata payloads are rejected before SQLite writes', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  const invalid = [
    { ...args, requestJson: JSON.stringify({ ...body, headers: { authorization: 'secret' } }) },
    { ...args, requestJson: JSON.stringify({ ...body, api_key: 'secret' }) },
    { ...args, requestJson: requestJson.replace('\"system\":', '\"system\":\"hidden earlier value\",\"system\":') },
    { ...args, requestJson: JSON.stringify({ ...body, messages: [{ role: 'user', content: 'Bearer abcdefgh12345' }] }) },
    { ...args, requestJson: JSON.stringify({ ...body, system: 'sk-ant-abcdefgh123456789' }) },
    { ...args, components: { brand: { headers: { authorization: 'secret' } } } },
    { ...args, components: { brand: { source: 'sk-proj-abcdefgh123456789' } } },
    { ...args, components: { brand: { text: 'arbitrary raw metadata' } } },
    { ...args, components: { arbitrary: { read_status: 'ok' } } },
    { ...args, components: { brand: { read_status: 'verified' } } },
  ];
  for (const input of invalid) {
    const result = await persistInferenceReceipt({ DB }, input);
    assert.equal(result.persisted, false);
    assert.equal('receipt_id' in result, false);
  }
  assert.equal(DB.rows('SELECT * FROM inference_receipts').length, 0);
});
test('request size uses UTF-8 bytes and unsupported shapes never create evidence', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  for (const input of [
    { ...args, surface: 'arbitrary' },
    { ...args, requestJson: '{invalid' },
    { ...args, requestJson: JSON.stringify({ ...body, system: '🍲'.repeat(INFERENCE_REQUEST_MAX_BYTES / 4) }) },
    { ...args, requestJson: JSON.stringify({ ...body, messages: [{ role: 'system', content: 'bad role' }] }) },
    { ...args, requestJson: JSON.stringify({ ...body, tools: [] }) },
    { ...args, components: { brand: { source_ids: ['x'.repeat(66000)] } } },
  ]) assert.equal((await persistInferenceReceipt({ DB }, input)).persisted, false);
  assert.equal(DB.rows('SELECT * FROM inference_receipts').length, 0);
});
test('storage failures and unconfirmed writes never yield persisted IDs or echoed error details', async () => {
  assert.equal((await persistInferenceReceipt({}, args)).reason, 'storage_unavailable');
  const failure = { prepare() { throw Error('private prompt or credential detail'); } };
  const result = await persistInferenceReceipt({ DB: failure }, args);
  assert.deepEqual(result, { ok: false, persisted: false, reason: 'storage_write_failed' });
  const unconfirmed = { prepare() { return { bind() { return this; }, async run() { return { success: false, meta: { changes: 1 } }; } }; } };
  assert.equal((await persistInferenceReceipt({ DB: unconfirmed }, args)).reason, 'storage_write_unconfirmed');
});
test('migration protects surface and request sizes even against direct invalid inserts', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  assert.throws(() => DB.sqlite.prepare("INSERT INTO inference_receipts (id,surface,model,request_json,request_sha256,components_json,created_at) VALUES ('x','unknown','m','{}',?,'{}',1)").run('a'.repeat(64)), /CHECK/);
});
