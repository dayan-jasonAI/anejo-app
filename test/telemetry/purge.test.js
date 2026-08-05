// A purge erases one named person's history on request. The tests that matter are not "does it
// delete" but "can it ever delete something it must not", and "can it ever be aimed at the wrong
// person".
//
// Ruling 2026-08-05: staff read + request; the OWNER executes. Every subject in Añejo's
// activity_log is an employee and that log is also the EOD/shift evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import { purgeActorTelemetry, PURGE_EXCLUDED, PRIVACY_EVENTS } from '../../functions/_lib/purge.js';
import { NEVER_PRUNE } from '../../functions/_lib/retention.js';

const { onRequestPost: purgePost, onRequestGet: purgeGet } = await import('../../functions/api/hub/owner/purge.js');
const { onRequestGet: meGet } = await import('../../functions/api/hub/me/activity.js');

function harness() {
  const deletes = [];
  const inserts = [];
  const DB = makeD1([
    [/DELETE FROM activity_log/i, ({ sql, args }) => { deletes.push({ sql, args }); return 4; }],
    [/INSERT INTO activity_log/i, ({ args }) => { inserts.push(args); return 1; }],
    [/SELECT event, COUNT\(\*\) AS n FROM activity_log[\s\S]*NOT IN/i, () => [{ event: 'dashboard.viewed', n: 3 }, { event: 'shift.clocked_in', n: 1 }]],
    [/SELECT event, COUNT\(\*\) AS n FROM activity_log[\s\S]*event IN/i, () => [{ event: 'order.refunded', n: 2 }]],
    [/SELECT COUNT\(\*\) AS total/i, () => ({ total: 6, purgeable: 4 })],
    [/SELECT id, event, actor_role/i, () => []],
    [/privacy.purge_requested/i, () => null],
    [/privacy.purge_executed/i, () => null],
  ]);
  return { env: { DB }, deletes, inserts };
}

// --- the policy itself ------------------------------------------------------------------

test('the compliance trail is excluded from purge — every NEVER_PRUNE name', () => {
  for (const e of NEVER_PRUNE) {
    assert.ok(PURGE_EXCLUDED.includes(e), `${e} is a compliance record and must survive a purge`);
  }
  // Spot-check the ones that would hurt most to lose.
  for (const e of ['order.refunded', 'order.canceled', 'temp_log.recorded', 'expense.submitted']) {
    assert.ok(PURGE_EXCLUDED.includes(e));
  }
});

test('the purge record outlives the purge', () => {
  // §4.1 clause 3: record the purge in the trail that is kept. If these were purgeable, an
  // erasure would erase the evidence that it happened.
  for (const e of PRIVACY_EVENTS) assert.ok(PURGE_EXCLUDED.includes(e));
  assert.ok(PURGE_EXCLUDED.includes('privacy.purge_requested'));
  assert.ok(PURGE_EXCLUDED.includes('privacy.purge_executed'));
});

test('DRY RUN IS THE DEFAULT — a bare call deletes nothing', async () => {
  const { env, deletes } = harness();
  const res = await purgeActorTelemetry(env, { actorId: 'usr_1' });
  assert.equal(res.dry_run, true);
  assert.equal(res.deleted, 0);
  assert.equal(deletes.length, 0);
  assert.ok(res.purgeable > 0, 'but it still reports what it would remove');
  assert.ok(res.kept > 0, 'and what it would keep');
});

test('a missing actor is REFUSED, never interpreted as "everyone"', async () => {
  const { env, deletes } = harness();
  for (const bad of [undefined, null, '', 123, {}]) {
    const res = await purgeActorTelemetry(env, { actorId: bad, dryRun: false });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'no_actor');
  }
  assert.equal(deletes.length, 0, 'no unscoped DELETE may ever be issued');
});

test('an executed purge is scoped to one actor AND excludes protected names in the SQL', async () => {
  const { env, deletes } = harness();
  const res = await purgeActorTelemetry(env, { actorId: 'usr_7', dryRun: false });
  assert.equal(res.ok, true);
  assert.equal(deletes.length, 1);
  const { sql, args } = deletes[0];
  assert.match(sql, /actor_id = \?/, 'must be person-scoped');
  assert.match(sql, /event NOT IN/, 'exclusion must be IN THE SQL, not applied afterwards');
  assert.equal(args[0], 'usr_7');
  // Every excluded name is bound into that statement.
  for (const e of PURGE_EXCLUDED) assert.ok(args.includes(e), `${e} must be bound as an exclusion`);
});

// --- the endpoint ----------------------------------------------------------------------

const ownerSessions = {
  async get(k) {
    return k === 'session:own'
      ? JSON.stringify({ type: 'staff', uid: 'usr_owner', role: 'owner', team: 'front_office', la: Date.now(), created: Date.now() })
      : k === 'session:kit'
        ? JSON.stringify({ type: 'staff', uid: 'usr_kitchen', role: 'kitchen', team: 'kitchen', la: Date.now(), created: Date.now() })
        : null;
  },
  async put() {}, async delete() {},
};

const post = (body, env, tok = 'own') => purgePost({
  request: new Request('https://anejocateringco.com/api/hub/owner/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `anejo_sess=${tok}` },
    body: JSON.stringify(body),
  }),
  env,
});

test('STEP-UP: a wrong confirmation is refused and deletes nothing', async () => {
  const { env, deletes } = harness();
  env.SESSIONS = ownerSessions;
  for (const confirm of [undefined, '', true, 'yes', 'usr_WRONG']) {
    const res = await post({ staff_id: 'usr_7', confirm }, env);
    assert.equal(res.status, 400, `confirm=${String(confirm)} must be refused`);
  }
  assert.equal(deletes.length, 0, 'a failed step-up must not fall through to a delete');
});

test('STEP-UP: the exact staff id executes, and records the erasure', async () => {
  const { env, deletes, inserts } = harness();
  env.SESSIONS = ownerSessions;
  const res = await post({ staff_id: 'usr_7', confirm: 'usr_7' }, env);
  assert.equal(res.status, 200);
  assert.equal(deletes.length, 1);
  // The purge is itself recorded, attributed to the executor, keyed to the subject.
  const rec = inserts.find((a) => a[1] === 'privacy.purge_executed');
  assert.ok(rec, 'privacy.purge_executed must be written');
  assert.equal(rec[2], 'usr_7', 'keyed to the subject so request/execute pair up');
  assert.match(rec[6], /executed_by/);
});

test('GET can never delete — it is a preview, whatever it is asked', async () => {
  const { env, deletes } = harness();
  env.SESSIONS = ownerSessions;
  // Including the shapes someone might expect to "just do it".
  for (const q of ['?staff_id=usr_7', '?staff_id=usr_7&confirm=usr_7', '?staff_id=usr_7&apply=1', '?staff_id=usr_7&dry_run=false']) {
    const res = await purgeGet({
      request: new Request('https://anejocateringco.com/api/hub/owner/purge' + q, { headers: { cookie: 'anejo_sess=own' } }),
      env,
    });
    assert.equal(res.status, 200);
  }
  assert.equal(deletes.length, 0, 'no GET may ever issue a DELETE');
});

test('a non-owner cannot execute a purge', async () => {
  const { env, deletes } = harness();
  env.SESSIONS = ownerSessions;
  const res = await post({ staff_id: 'usr_7', confirm: 'usr_7' }, env, 'kit');
  assert.ok(res.status === 401 || res.status === 403, `kitchen staff got ${res.status}`);
  assert.equal(deletes.length, 0);
});

test('self-read is scoped to the SESSION and cannot be aimed at someone else', async () => {
  const { env } = harness();
  env.SESSIONS = ownerSessions;
  // Even with a hostile query string, the actor bound is the session's own id.
  const res = await meGet({
    request: new Request('https://anejocateringco.com/api/hub/me/activity?actor_id=usr_someone_else&staff_id=usr_someone_else', {
      headers: { cookie: 'anejo_sess=kit' },
    }),
    env,
  });
  assert.equal(res.status, 200);
  const seen = env.DB.calls.filter((c) => /FROM activity_log/i.test(c.sql));
  assert.ok(seen.length > 0);
  for (const c of seen) {
    assert.ok(c.args.includes('usr_kitchen'), 'must query the session identity');
    assert.ok(!c.args.includes('usr_someone_else'), 'must never bind an id from the request');
  }
});
