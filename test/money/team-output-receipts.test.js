import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { executeAction, onRequestPost } from '../../functions/api/hub/owner/team.js';
import { persistInferenceReceipt } from '../../functions/_lib/inference_receipt.js';
const request = () => new Request('https://example.test/api/hub/owner/team', { method: 'POST', headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Draft a VIDA post.' }) });
const action = { action: 'draft_posts', category: 'menu', brief_id: 'brief1', assets: [{ caption: 'Meet VIDA', intel_id: 'invented' }] };
function setup(t) {
  const env = ownerEnv(); t.after(() => env.DB.sqlite.close());
  env.DB.sqlite.prepare("INSERT INTO team_briefs(id,title,status,created_at,updated_at) VALUES ('brief1','Real brief','draft',1,1)").run();
  return env;
}
async function evidence(env, readStatus = 'ok') {
  const input_context = { supplied_brief_ids: ['brief1'], supplied_intel_ids: [], supplied_rule_ids: ['rule1'], components: { training: { read_status: readStatus, reads: { rules: readStatus, examples: 'empty' } } } };
  const inference_receipt = await persistInferenceReceipt(env, { surface: 'team_lead', requestJson: JSON.stringify({ model: 'test', max_tokens: 20, system: 'Context', messages: [{ role: 'user', content: 'Draft' }] }) });
  return { input_context, inference_receipt };
}
test('Lead output links persisted receipt and only supplied provenance; unknown training does not become empty evidence', async t => {
  const env = setup(t); const proof = await evidence(env);
  const result = await executeAction(env, action, proof);
  const post = env.DB.one('SELECT * FROM social_posts WHERE id=?', result.posts[0].id);
  assert.equal(post.inference_receipt_id, proof.inference_receipt.receipt_id);
  assert.ok(post.original_design_snapshot);
  const p = env.DB.one('SELECT * FROM post_provenance WHERE post_id=?', post.id);
  assert.equal(p.brief_id, 'brief1');
  assert.equal(p.intel_id, null);
  assert.deepEqual(JSON.parse(p.rule_ids), ['rule1']);
  const unknown = await executeAction(env, action, await evidence(env, 'unavailable'));
  assert.equal(env.DB.one('SELECT rule_ids FROM post_provenance WHERE post_id=?', unknown.posts[0].id).rule_ids, null);
});
test('existing-but-unsupplied brief and failed persistence cannot grant input provenance or clean trust evidence', async t => {
  const env = setup(t); const proof = await evidence(env);
  proof.input_context.supplied_brief_ids = [];
  const unknown = await executeAction(env, action, proof);
  assert.equal(env.DB.one('SELECT brief_id FROM post_provenance WHERE post_id=?', unknown.posts[0].id).brief_id, null);
  proof.inference_receipt = { persisted: false, ok: false, reason: 'storage_write_failed' };
  const failed = await executeAction(env, action, proof);
  const p = env.DB.one('SELECT * FROM social_posts WHERE id=?', failed.posts[0].id);
  assert.equal(p.inference_receipt_id, null);
  assert.equal(p.original_design_snapshot, null);
  assert.equal(failed.posts[0].inference_evidence, 'unverified');
});
test('FK rejection leaves created draft explicitly unverified instead of linking a fabricated receipt', async t => {
  const env = setup(t);
  // SQLite helper defaults foreign_keys according to migrations; explicitly enforce production contract.
  env.DB.exec('PRAGMA foreign_keys=ON');
  const proof = await evidence(env);
  proof.inference_receipt.receipt_id = 'inf_ffffffff';
  const result = await executeAction(env, action, proof);
  assert.equal(result.posts[0].inference_receipt_id, null);
  assert.equal(result.posts[0].inference_evidence, 'unverified');
});
test('route links final fallback receipt to draft and saved Lead message, records each observed attempt', async t => {
  const env = setup(t); env.ANTHROPIC_API_KEY = 'fake-not-real'; env.TEAM_LEAD_MODEL = 'missing';
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response(JSON.stringify({ error: { type: 'not_found_error' } }), { status: 404 });
    return new Response(JSON.stringify({ content: [{ text: '```json\n' + JSON.stringify(action) + '\n```' }] }), { status: 200 });
  };
  const response = await onRequestPost({ request: request(), env });
  const body = await response.json();
  assert.equal(body.reply.saved, true);
  const post = env.DB.one('SELECT inference_receipt_id FROM social_posts WHERE created_by=?', 'lead');
  assert.equal(post.inference_receipt_id, body.reply.inference_receipt_id);
  const message = env.DB.one("SELECT * FROM team_messages WHERE role='lead'");
  assert.equal(message.inference_receipt_id, post.inference_receipt_id);
  const outcome = JSON.parse(message.inference_outcome_json);
  assert.deepEqual(outcome.inference_attempts.map(a => a.observed_http_status), [404, 200]);
  assert.equal(outcome.inference_attempts[1].input_receipt.receipt_id, post.inference_receipt_id);
  assert.equal(env.DB.one('SELECT model FROM inference_receipts WHERE id=?', post.inference_receipt_id).model, 'claude-sonnet-5');
});
test('failed Lead transcript write is returned as saved=false and never claims a linked saved message', async t => {
  const env = setup(t);
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => {
    if (sql.includes('INSERT INTO team_messages') && sql.includes('inference_outcome_json')) throw Error('cannot save');
    return prepare(sql);
  };
  const body = await (await onRequestPost({ request: request(), env })).json();
  assert.equal(body.reply.saved, false);
  assert.equal(body.reply.inference_receipt_id, null);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM team_messages WHERE role='lead'").n, 0);
});

test('unavailable spend is reported distinctly from reached budget and makes no provider call', async t => {
  const env = setup(t); env.ANTHROPIC_API_KEY = 'fake-not-real';
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => { if (sql.includes('FROM ai_spend')) throw Error('ledger down'); return prepare(sql); };
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; });
  globalThis.fetch = async () => { assert.fail('No provider call with unreadable spending'); };
  const body = await (await onRequestPost({ request: request(), env })).json();
  assert.equal(body.degraded, 'budget_unavailable');
  assert.match(body.reply.body, /does not mean the weekly budget is used up/);
  assert.equal(body.spine.budget.spent_usd, null);
  assert.equal(body.spine.budget.remaining_usd, null);
  assert.equal(body.spine.budget.status, 'unavailable');
});
