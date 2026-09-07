import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCateringDB, seedUpload } from './catering-outbox-fixture.js';
import { onRequestPost } from '../../functions/api/leads.js';
import { drainCateringOutbox } from '../../functions/_lib/catering-request.js';
import { onRequestPost as retry } from '../../functions/api/admin/catering-outbox.js';

const body = {
  request_id: '1c482f5c-98e6-44d6-b998-1998b5e8de79', kind: 'catering',
  name: 'Synthetic Test', email: 'test@example.test', guests: 20,
  menu_options: ['Individual Cajitas'], event_date: '2026-12-25', event_type: 'Holiday', location: '33401',
};
const post = (DB, patch = {}, env = {}) => onRequestPost({ env: { DB, ...env }, request: new Request('https://anejocateringco.com/api/leads', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, ...patch }),
}) });
const count = (DB, table) => DB.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('real SQL: identical replay and simultaneous submissions produce one lead and outbox pair', async () => {
  const DB = makeCateringDB();
  const results = await Promise.all([post(DB), post(DB)]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  const receipts = await Promise.all(results.map((r) => r.json()));
  assert.equal(receipts[0].id, receipts[1].id);
  assert.equal(count(DB, 'leads'), 1);
  assert.equal(count(DB, 'catering_requests'), 1);
  assert.equal(count(DB, 'catering_notification_outbox'), 2);
  assert.equal((await post(DB, { guests: 21 })).status, 409);
  assert.equal(count(DB, 'leads'), 1);
});

test('real SQL: claimed upload retry succeeds but racing distinct requests cannot steal or orphan files', async () => {
  const DB = makeCateringDB(); seedUpload(DB);
  const batch = DB.batch.bind(DB);
  let waiting = 0;
  let release;
  const bothValidated = new Promise((resolve) => { release = resolve; });
  DB.batch = async (statements) => {
    if (++waiting === 2) release();
    await bothValidated;
    return batch(statements);
  };
  const patch = { upload_session_id: 'cup_0123456789abcdefabcd' };
  const results = await Promise.all([post(DB, patch), post(DB, { ...patch, request_id: 'another-request-unique-12345' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const first = await results[0].json();
  const replay = await (await post(DB, patch)).json();
  assert.equal(replay.id, first.id);
  assert.equal(replay.attachments.linked, true);
  assert.equal(count(DB, 'leads'), 1);
  assert.equal(DB.sqlite.prepare('SELECT lead_id FROM catering_attachments').get().lead_id, first.id);
});

test('real SQL: failure inserting outbox rolls back lead and attachment claim together', async () => {
  const DB = makeCateringDB(); seedUpload(DB);
  DB.sqlite.exec(`CREATE TRIGGER fail_outbox BEFORE INSERT ON catering_notification_outbox BEGIN SELECT RAISE(ABORT,'injected outage'); END;`);
  const response = await post(DB, { upload_session_id: 'cup_0123456789abcdefabcd' });
  assert.equal(response.status, 503);
  assert.equal(count(DB, 'leads'), 0);
  assert.equal(count(DB, 'catering_requests'), 0);
  assert.equal(DB.sqlite.prepare('SELECT claimed_lead_id FROM catering_upload_sessions').get().claimed_lead_id, null);
  assert.equal(DB.sqlite.prepare('SELECT lead_id FROM catering_attachments').get().lead_id, null);
});

test('real SQL: a changed file set between validation and commit is rejected, not silently linked', async () => {
  const DB = makeCateringDB(); seedUpload(DB);
  const batch = DB.batch.bind(DB);
  DB.batch = async (statements) => {
    DB.sqlite.prepare(`INSERT INTO catering_attachments (id,session_id,slot,r2_key,filename,content_type,byte_size,created_at)
      VALUES ('cat_other','cup_0123456789abcdefabcd',2,'other/key','other.pdf','application/pdf',100,?)`).run(Date.now());
    return batch(statements);
  };
  assert.equal((await post(DB, { upload_session_id: 'cup_0123456789abcdefabcd' })).status, 409);
  assert.equal(count(DB, 'leads'), 0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM catering_attachments WHERE lead_id IS NOT NULL').get().n, 0);
});

test('real SQL: provider outage persists retries; concurrent drains lease only one send; provider key is stable', async () => {
  const DB = makeCateringDB();
  const original = globalThis.fetch;
  const calls = [];
  let fail = true;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, key: init.headers['Idempotency-Key'], signal: init.signal, body: init.body });
    if (fail) throw new Error('synthetic timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, json: async () => ({ id: 'synthetic_provider_receipt' }) };
  };
  try {
    const env = { DB, RESEND_API_KEY: 'fake-test-key' };
    assert.equal((await post(DB, {}, env)).status, 200);
    const pending = DB.sqlite.prepare("SELECT * FROM catering_notification_outbox WHERE channel='email'").get();
    assert.equal(pending.status, 'pending');
    assert.equal(pending.attempts, 1);
    assert.equal(count(DB, 'leads'), 1);
    DB.sqlite.exec("UPDATE catering_notification_outbox SET next_attempt_at=0 WHERE channel='email'");
    fail = false;
    await Promise.all([drainCateringOutbox(env), drainCateringOutbox(env)]);
    assert.equal(calls.length, 2, 'one failed first attempt plus exactly one successful retry');
    assert.equal(calls[0].key, calls[1].key);
    assert.equal(calls[0].body, calls[1].body);
    assert.ok(calls[0].signal instanceof AbortSignal);
    assert.equal(DB.sqlite.prepare("SELECT status FROM catering_notification_outbox WHERE channel='email'").get().status, 'accepted');
  } finally { globalThis.fetch = original; }
});

test('real SQL: expired lease resumes, but ambiguous email older than provider window is retained for review', async () => {
  const DB = makeCateringDB(); await post(DB);
  DB.sqlite.prepare(`UPDATE catering_notification_outbox SET status='leased',lease_until=0,next_attempt_at=0,
    first_attempt_at=? WHERE channel='email'`).run(Date.now() - 24 * 3600000);
  const output = await drainCateringOutbox({ DB });
  assert.equal(output.needs_review, 1);
  assert.equal(DB.sqlite.prepare("SELECT status FROM catering_notification_outbox WHERE channel='email'").get().status, 'needs_review');
  assert.equal(count(DB, 'leads'), 1);
});

test('retry endpoint rejects anonymous callers and accepts the existing cron credential', async () => {
  const DB = makeCateringDB();
  const request = (key) => new Request('https://anejocateringco.com/api/admin/catering-outbox', { method: 'POST', headers: key ? { 'X-Cron-Key': key } : {} });
  assert.equal((await retry({ request: request(), env: { DB } })).status, 401);
  assert.equal((await retry({ request: request('wrong'), env: { DB, CRON_KEY: 'correct' } })).status, 401);
  assert.equal((await retry({ request: request('correct'), env: { DB, CRON_KEY: 'correct' } })).status, 200);
});
