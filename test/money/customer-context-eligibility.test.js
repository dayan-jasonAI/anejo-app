import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestGet as trainingGet, onRequestPost as trainingPost } from '../../functions/api/hub/owner/team-training.js';
import { onRequestGet as knowledgeGet, onRequestPost as knowledgePost } from '../../functions/api/hub/owner/knowledge.js';
import { trainingContextReceipt } from '../../functions/_lib/training.js';
import { retrieve } from '../../functions/_lib/knowledge.js';

const request = (cookie, body) => new Request('https://example.test/api/hub/owner', {
  method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const call = async (handler, env, cookie, body) => {
  const response = await handler({ request: request(cookie, body), env });
  return { status: response.status, body: await response.json() };
};
const marketingCookie = 'anejo_sess=tok-marketing';

test('schema defaults internal; owner CAS grants, stale writes conflict, rule edits revoke', async t => {
  const env = ownerEnv(); t.after(() => env.DB.sqlite.close());
  const { DB } = env;
  DB.exec("INSERT INTO training_rules(id,text,created_at,updated_at) VALUES('r1','Saved owner rule',100,100)");
  DB.exec("INSERT INTO kb_documents(id,title,status,created_at,updated_at) VALUES('d1','Saved manual','ready',100,100)");
  assert.equal(DB.one("SELECT customer_eligible FROM training_rules WHERE id='r1'").customer_eligible, 0);
  assert.equal(DB.one("SELECT customer_eligible FROM kb_documents WHERE id='d1'").customer_eligible, 0);
  assert.throws(() => DB.exec("UPDATE training_rules SET customer_eligible=2 WHERE id='r1'"), /CHECK constraint/);

  let result = await call(trainingGet, env, marketingCookie);
  assert.equal(result.status, 200);
  assert.equal(result.body.can_manage_customer_context, false);
  assert.equal(result.body.rules[0].customer_eligible, 0);
  result = await call(trainingPost, env, marketingCookie, { op: 'set_customer_eligibility', id: 'r1', customer_eligible: true, expected_updated_at: 100 });
  assert.equal(result.status, 403);
  result = await call(trainingPost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'r1', customer_eligible: 1, expected_updated_at: 100 });
  assert.equal(result.status, 400);
  result = await call(trainingPost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'r1', customer_eligible: true, expected_updated_at: 100 });
  assert.equal(result.status, 200);
  assert.equal(result.body.customer_eligible, true);
  assert.ok(result.body.updated_at > 100);
  let saved = DB.one("SELECT * FROM training_rules WHERE id='r1'");
  assert.equal(saved.customer_eligible_by, 'stf_owner');
  assert.equal(saved.customer_eligible_at, result.body.updated_at);
  assert.equal(saved.customer_eligible_source_updated_at, 100);
  assert.deepEqual(DB.rows("SELECT action, actor, source_updated_at FROM customer_context_eligibility_audit WHERE source_id='r1'").map(row => ({ ...row })),
    [{ action: 'grant', actor: 'stf_owner', source_updated_at: 100 }]);
  assert.equal((await call(trainingPost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'r1', customer_eligible: false, expected_updated_at: 100 })).status, 409);
  assert.equal(DB.rows("SELECT id FROM customer_context_eligibility_audit WHERE source_id='r1'").length, 1);
  assert.equal(DB.one("SELECT customer_eligible FROM training_rules WHERE id='r1'").customer_eligible, 1);
  const receipt = await trainingContextReceipt(env, { audience: 'customer' });
  assert.match(receipt.text, /Saved owner rule/);
  assert.deepEqual(receipt.receipt.examples, []);
  assert.equal((await call(trainingPost, env, marketingCookie, { op: 'update_rule', id: 'r1', text: 'Edited owner rule' })).status, 200);
  saved = DB.one("SELECT * FROM training_rules WHERE id='r1'");
  assert.equal(saved.customer_eligible, 0);
  assert.equal(saved.customer_eligible_by, null);
  assert.deepEqual(DB.rows("SELECT action, actor FROM customer_context_eligibility_audit WHERE source_id='r1' ORDER BY id").map(row => ({ ...row })),
    [{ action: 'grant', actor: 'stf_owner' }, { action: 'revoke', actor: 'stf_m' }]);
  assert.ok(saved.updated_at > result.body.updated_at, 'text edit bumps source version even within the same millisecond');
  assert.equal((await call(trainingPost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'r1', customer_eligible: true, expected_updated_at: result.body.updated_at })).status, 409);
  assert.equal((await trainingContextReceipt(env, { audience: 'customer' })).text, '');
  assert.match((await trainingContextReceipt(env)).text, /Edited owner rule/);
});

test('customer training fails closed on old schema/read failure and excludes examples', async t => {
  const env = ownerEnv(); t.after(() => env.DB.sqlite.close());
  const DB = env.DB;
  DB.exec("INSERT INTO training_rules(id,text,customer_eligible,created_at,updated_at) VALUES('r1','Customer text',1,1,1),('r2','Private text',0,1,2)");
  DB.exec("INSERT INTO training_examples(id,media_key,note,flag,created_at,updated_at) VALUES('e1','training/example','Private example','good',1,1)");
  const c = await trainingContextReceipt(env, { audience: 'customer' });
  assert.match(c.text, /Customer text/);
  assert.doesNotMatch(c.text, /Private text|Private example/);
  const broken = { DB: { prepare() { throw Error('no customer column'); } } };
  const unavailable = await trainingContextReceipt(broken, { audience: 'customer' });
  assert.equal(unavailable.text, '');
  assert.equal(unavailable.receipt.read_status, 'unavailable');
  assert.equal((await trainingContextReceipt(env, { audience: 'typo' })).text, '');
});

test('knowledge owner grant requires ready saved passage; customer retrieval uses current D1 state', async t => {
  const env = ownerEnv(); t.after(() => env.DB.sqlite.close());
  const DB = env.DB;
  DB.exec("INSERT INTO kb_documents(id,title,status,created_at,updated_at) VALUES('d1','Ready source','ready',100,100),('d2','Partial source','partial',100,100)");
  DB.exec("INSERT INTO kb_chunks(id,doc_id,ord,text,chars,embedded,created_at) VALUES('c1','d1',0,'Saved passage',13,1,100),('c2','d2',0,'Partial passage',15,1,100)");
  let result = await call(knowledgeGet, env, OWNER_COOKIE);
  assert.equal(result.body.can_manage_customer_context, true);
  assert.equal(result.body.items[0].customer_eligible, 0);
  result = await call(knowledgePost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'd2', customer_eligible: true, expected_updated_at: 100 });
  assert.equal(result.status, 409);
  result = await call(knowledgePost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'd1', customer_eligible: true, expected_updated_at: 100 });
  assert.equal(result.status, 200);
  let saved = DB.one("SELECT * FROM kb_documents WHERE id='d1'");
  assert.equal(saved.customer_eligible_by, 'stf_owner');
  assert.equal(saved.customer_eligible_at, result.body.updated_at);
  assert.equal(saved.customer_eligible_source_updated_at, 100);
  assert.deepEqual(DB.rows("SELECT action, actor, source_updated_at FROM customer_context_eligibility_audit WHERE source_id='d1'").map(row => ({ ...row })),
    [{ action: 'grant', actor: 'stf_owner', source_updated_at: 100 }]);
  assert.equal((await call(knowledgePost, env, OWNER_COOKIE, { op: 'set_customer_eligibility', id: 'd1', customer_eligible: false, expected_updated_at: 100 })).status, 409);
  assert.equal(DB.rows("SELECT id FROM customer_context_eligibility_audit WHERE source_id='d1'").length, 1);
  const ids = ['c1', 'c2'];
  env.AI = { run: async () => ({ data: [[1, 2]] }) };
  env.VECTORIZE = { query: async () => ({ matches: ids.map(id => ({ id, score: 0.9, metadata: { customer_eligible: true, title: 'Stale metadata' } })) }) };
  let rows = await retrieve(env, 'question', { audience: 'customer' });
  assert.deepEqual(rows.map(r => r.text), ['Saved passage']);
  DB.exec("UPDATE kb_documents SET status='partial' WHERE id='d1'");
  rows = await retrieve(env, 'question', { audience: 'customer' });
  assert.deepEqual(rows, []);
  DB.exec("UPDATE kb_documents SET status='ready', customer_eligible=0 WHERE id='d1'");
  assert.deepEqual(await retrieve(env, 'question', { audience: 'customer' }), []);
  assert.deepEqual(await retrieve(env, 'question', { audience: 'typo' }), []);
  assert.deepEqual((await retrieve(env, 'question')).map(r => r.text), ['Saved passage', 'Partial passage']);
});
