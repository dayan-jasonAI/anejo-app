// The owner's second complaint about the Intel Bench: "there is a questions queue but there is
// no way to input an answer." Before this file, GET /api/hub/owner/intel returned status +
// answer_intel_id for every queued question but never the answer TEXT — a "done" badge with
// nothing behind it, indistinguishable in the UI from a badge that just hadn't loaded yet. And
// POST could only file a NEW question; there was no way to close one out by hand.
//
// This exercises functions/api/hub/owner/intel.js end to end (real requireRole, a fake D1/KV),
// not just source pins — the whole point is that the answer actually round-trips through the
// GET response, which a source-pin test cannot prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/owner/intel.js';
import { makeD1, makeKV } from '../helpers/d1.js';

function ownerEnv(routes = []) {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', email: 'dayan@anejocateringco.com', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([
      [/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })],
      [/FROM market_intel WHERE kind=\?/, () => null], // no standing briefs in these tests
      ...routes,
    ]),
  };
}
const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, {
  headers: { Cookie: 'anejo_sess=tok', 'Content-Type': 'application/json' }, ...init,
});
const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) });

test('GET is owner-gated', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await onRequestGet({ request: req('/api/hub/owner/intel'), env });
  assert.equal(res.status, 401);
});

test('POST is owner-gated', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await onRequestPost({ request: post('/api/hub/owner/intel', { question: 'x' }), env });
  assert.equal(res.status, 401);
});

test('GET attaches the answer body/sources/timestamp to a done question, not just its id', async () => {
  const env = ownerEnv([
    [/FROM intel_requests ORDER BY created_at DESC/, () => [
      { id: 'ir_1', question: 'What do meal-plan subscriptions cost nearby?', status: 'done', requested_by: 'owner', answer_intel_id: 'mi_1', created_at: 1000, updated_at: 2000 },
      { id: 'ir_2', question: 'Still pending', status: 'pending', requested_by: 'owner', answer_intel_id: null, created_at: 1500, updated_at: 1500 },
    ]],
    [/FROM market_intel WHERE id IN/, () => [
      { id: 'mi_1', title: 'What do meal-plan subscriptions cost nearby?', body: 'Nobody comparable charges this much — the price needs a value story.', sources_json: '["https://example.com"]', created_at: 1900 },
    ]],
  ]);
  const res = await onRequestGet({ request: req('/api/hub/owner/intel'), env });
  const data = await res.json();
  assert.equal(data.ok, true);

  const done = data.requests.find((r) => r.id === 'ir_1');
  assert.ok(done.answer, 'the done question carries its answer object');
  assert.match(done.answer.body, /value story/);
  assert.deepEqual(done.answer.sources, ['https://example.com']);
  assert.equal(done.answer.created_at, 1900);

  const pending = data.requests.find((r) => r.id === 'ir_2');
  assert.equal(pending.answer, null, 'a question with no answer_intel_id must not carry a stale/borrowed answer');
});

test('POST with a question (no request_id) files a new pending question — unchanged behavior', async () => {
  const inserted = [];
  const env = ownerEnv([
    [/^INSERT INTO intel_requests/, ({ args }) => { inserted.push(args); return 1; }],
  ]);
  const res = await onRequestPost({ request: post('/api/hub/owner/intel', { question: 'What are people asking for?' }), env });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.status, 'pending');
  assert.equal(inserted.length, 1);
});

test('POST with request_id + answer files a manual answer: market_intel row + request flipped to done', async () => {
  const miInserts = [];
  const updates = [];
  const env = ownerEnv([
    [/^SELECT id, question, status FROM intel_requests WHERE id=\?/, () => ({ id: 'ir_9', question: 'What do competitors charge?', status: 'pending' })],
    [/^INSERT INTO market_intel/, ({ args }) => { miInserts.push(args); return 1; }],
    [/^UPDATE intel_requests SET status='done'/, ({ args }) => { updates.push(args); return 1; }],
  ]);
  const res = await onRequestPost({
    request: post('/api/hub/owner/intel', { request_id: 'ir_9', answer: 'I checked myself — nobody nearby charges this much.' }),
    env,
  });
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.status, 'done');
  assert.ok(data.intel_id, 'a new market_intel id was minted for the manual answer');

  assert.equal(miInserts.length, 1, 'the manual answer is stored exactly like a researched one — one market_intel row');
  const [id, kind, title, body, sourcesJson] = miInserts[0];
  assert.equal(kind, 'adhoc');
  assert.equal(title, 'What do competitors charge?', 'titled from the original question, so it reads next to it');
  assert.match(body, /nobody nearby charges this much/);
  assert.equal(sourcesJson, null, 'no sources — a manual answer must not claim it was researched');

  assert.equal(updates.length, 1);
  assert.equal(updates[0][0], id, 'the request row points at the SAME intel id that was just inserted');
});

test('POST with request_id but a blank answer is rejected — no empty market_intel row', async () => {
  const env = ownerEnv([]);
  const res = await onRequestPost({ request: post('/api/hub/owner/intel', { request_id: 'ir_9', answer: '   ' }), env });
  assert.equal(res.status, 400);
});

test('POST with request_id for a question that no longer exists 404s cleanly', async () => {
  const env = ownerEnv([
    [/^SELECT id, question, status FROM intel_requests WHERE id=\?/, () => null],
  ]);
  const res = await onRequestPost({ request: post('/api/hub/owner/intel', { request_id: 'ir_gone', answer: 'anything' }), env });
  assert.equal(res.status, 404);
});
