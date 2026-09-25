import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { DEFAULT_MAX_CHARS } from '../../functions/_lib/training.js';
import { leadReply, buildSpine, FALLBACK_MODEL } from '../../functions/_lib/team_lead.js';

function fixture(t) {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  DB.sqlite.prepare("INSERT INTO docs (id,doc_type,title,body,created_at,updated_at) VALUES ('brand','brand','Standards','Approved original brand',1,1)").run();
  DB.sqlite.prepare("INSERT INTO training_rules (id,text,created_at,updated_at) VALUES ('rule','Use the real emblem',1,1)").run();
  DB.sqlite.prepare("INSERT INTO team_briefs (id,title,objective,status,created_at,updated_at) VALUES ('brief1','Launch','Use authentic food','draft',1,1)").run();
  return { DB, ANTHROPIC_API_KEY: 'not-a-real-provider-key' };
}
const answer = () => new Response(JSON.stringify({ content: [{ text: 'Prepared draft direction.' }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
function stubFetch(t, fn) { const original = globalThis.fetch; globalThis.fetch = fn; t.after(() => { globalThis.fetch = original; }); }

test('Team Lead persists identical transmitted bytes before pending response and retains pre-call source revisions', async t => {
  const env = fixture(t);
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let sent;
  stubFetch(t, async (_url, init) => { sent = init.body; started(); return pending; });
  const work = leadReply(env, { message: 'Plan the launch.' });
  await ready;
  const existing = env.DB.one('SELECT * FROM inference_receipts');
  assert.equal(existing.request_json, sent);
  env.DB.exec("UPDATE docs SET body='Changed AFTER send',updated_at=2 WHERE id='brand'; UPDATE training_rules SET text='Changed rule AFTER send',updated_at=2 WHERE id='rule'");
  release(answer());
  const result = await work;
  assert.equal(result.ok, true);
  assert.equal(result.input_receipt.persisted, true);
  assert.equal(result.inference_receipt.receipt_id, result.input_receipt.receipt_id);
  assert.ok(result.input_context.supplied_brief_ids.includes('brief1'));
  assert.deepEqual(result.input_context.supplied_rule_ids, ['rule']);
  assert.deepEqual(result.input_context.supplied_intel_ids, []);
  const row = env.DB.one('SELECT * FROM inference_receipts WHERE id=?', result.input_receipt.receipt_id);
  assert.equal(row.request_sha256, createHash('sha256').update(sent).digest('hex'));
  const components = JSON.parse(row.components_json);
  assert.equal(components.brand.documents[0].updated_at, 1);
  assert.equal(components.training.rules[0].updated_at, 1);
  assert.match(JSON.parse(sent).system, /Use the real emblem/);
  assert.match(JSON.parse(sent).system, /\[brief_id: brief1\]/);
  assert.equal(components.briefs.documents.find(d => d.id === 'brief1').updated_at, 1);
  assert.doesNotMatch(JSON.parse(sent).system, /Changed AFTER|Changed rule AFTER/);
  assert.equal(row.transport_status, 'unknown');
  assert.equal(result.inference_attempts[0].observed_http_status, 200);
});
test('model fallback records each distinct exact request and reports answering input receipt', async t => {
  const env = fixture(t); env.TEAM_LEAD_MODEL = 'missing-model';
  const sent = [];
  stubFetch(t, async (_url, init) => {
    sent.push(init.body);
    return sent.length === 1 ? new Response(JSON.stringify({ error: { type: 'not_found_error', message: 'model unavailable' } }), { status: 404 }) : answer();
  });
  const result = await leadReply(env, { message: 'Help plan.' });
  assert.equal(result.ok, true);
  assert.equal(result.model, FALLBACK_MODEL);
  assert.equal(result.inference_attempts.length, 2);
  for (let i = 0; i < 2; i++) {
    const attempt = result.inference_attempts[i];
    const row = env.DB.one('SELECT * FROM inference_receipts WHERE id=?', attempt.input_receipt.receipt_id);
    assert.equal(row.request_json, sent[i]);
    assert.equal(row.model, i === 0 ? 'missing-model' : FALLBACK_MODEL);
    assert.equal(attempt.observed_http_status, i === 0 ? 404 : 200);
  }
  assert.equal(result.input_receipt.receipt_id, result.inference_attempts[1].input_receipt.receipt_id);
});
test('receipt storage failure permits a reply while explicitly preserving unverified evidence', async t => {
  const env = fixture(t);
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => { if (/INSERT INTO inference_receipts/.test(sql)) throw Error('migration unavailable'); return prepare(sql); };
  stubFetch(t, async () => answer());
  const result = await leadReply(env, { message: 'Plan.' });
  assert.equal(result.ok, true);
  assert.equal(result.input_receipt.persisted, false);
  assert.equal('receipt_id' in result.input_receipt, false);
  assert.equal(result.inference_attempts[0].input_receipt.reason, 'storage_write_failed');
});
test('spine retains source read failures and actual training truncation metadata', async t => {
  const env = fixture(t);
  env.DB.sqlite.prepare("INSERT INTO training_rules (id,text,created_at,updated_at) VALUES ('too_big',?,2,2)").run('x'.repeat(5000));
  const retained = await buildSpine(env);
  assert.equal(retained.input_components.training.truncated, false);
  assert.ok(retained.input_components.training.rules.some(rule => rule.id === 'too_big'), 'a 5000-character rule fits the current shared cap');
  env.DB.sqlite.prepare("UPDATE training_rules SET text=? WHERE id='too_big'").run('x'.repeat(DEFAULT_MAX_CHARS + 1));
  const spine = await buildSpine(env);
  assert.equal(spine.input_components.training.truncated, true);
  assert.ok(spine.input_components.training.supplied_chars <= DEFAULT_MAX_CHARS);
  assert.deepEqual(spine.input_components.training.rules, []);
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => { if (/FROM docs|FROM training_rules|FROM training_examples/.test(sql)) throw Error('unavailable'); return prepare(sql); };
  const failed = await buildSpine(env);
  assert.equal(failed.input_components.brand.read_status, 'unavailable');
  assert.equal(failed.input_components.brand.source, 'repo');
  assert.equal(failed.input_components.training.read_status, 'unavailable');
});
