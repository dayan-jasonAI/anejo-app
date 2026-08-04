// The client track rail is the only place an event name enters the system from outside the
// codebase. Before 2026-08-04 it accepted anything, which is a large part of how the HUB ended up
// with 57 events nobody had planned.
//
// These tests pin the two properties that make the fix trustworthy:
//   1. the allowlist cannot silently drift from the plan (it is generated, and staleness fails here)
//   2. an unknown name is refused AND recorded — a silent 400 would lose the evidence
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeD1 } from '../helpers/d1.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { onRequestPost } = await import('../../functions/api/hub/track.js');
const { isClientEventAllowed, CLIENT_ALLOWED } = await import('../../functions/_lib/track-allowlist.js');

test('track-allowlist.js is in sync with tracking-plan.yaml', () => {
  // If this fails someone edited the plan without regenerating. That is the whole point: the plan
  // is the source of truth and the committed artifact must match it before anything deploys.
  execFileSync('node', [join(ROOT, 'scripts', 'gen-track-allowlist.mjs'), '--check'], { stdio: 'pipe' });
});

test('allowlist admits the five real client events and nothing else', () => {
  for (const name of ['dashboard.viewed', 'app.installed', 'customer.viewed', 'customer.login_link_sent', 'lead.converted']) {
    assert.equal(isClientEventAllowed(name), true, `${name} should be allowed`);
  }
  assert.equal(CLIENT_ALLOWED.length, 5);
  // Server-only names must NOT be postable from a browser.
  for (const name of ['order.refunded', 'shift.clocked_in', 'automation.run', 'track.rejected']) {
    assert.equal(isClientEventAllowed(name), false, `${name} must not be client-postable`);
  }
  for (const junk of ['', 'nope', null, undefined, 42, {}, 'dashboard.viewed ']) {
    assert.equal(isClientEventAllowed(junk), false);
  }
});

// --- endpoint behaviour -------------------------------------------------------------------

function harness() {
  const rows = [];
  const DB = makeD1([[/INSERT INTO activity_log/i, ({ args }) => { rows.push(args); return 1; }]]);
  const SESSIONS = {
    async get(k) {
      return k === 'session:tok'
        ? JSON.stringify({ type: 'staff', uid: 'usr_1', role: 'owner', team: 'front_office', la: Date.now(), created: Date.now() })
        : null;
    },
    async put() {}, async delete() {},
  };
  return { env: { DB, SESSIONS }, rows };
}

const post = (event, env) => onRequestPost({
  request: new Request('https://anejocateringco.com/api/hub/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'anejo_sess=tok' },
    body: JSON.stringify({ event, properties: {} }),
  }),
  env,
});

test('an allowlisted event is captured', async () => {
  const { env, rows } = harness();
  const res = await post('dashboard.viewed', env);
  assert.equal(res.status, 200);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], 'dashboard.viewed');   // (id, event, ...)
});

test('an unknown event is REFUSED and RECORDED, not silently dropped', async () => {
  const { env, rows } = harness();
  const res = await post('totally.madeup', env);
  assert.equal(res.status, 400);

  // The refusal must leave a trail carrying the attempted name — otherwise a name someone
  // forgot to allowlist just disappears and nobody finds out for months.
  assert.equal(rows.length, 1, 'the rejection itself must be recorded');
  assert.equal(rows[0][1], 'track.rejected');
  assert.equal(rows[0][4], 'system');             // actor_type
  assert.match(rows[0][6], /totally\.madeup/);    // properties JSON
});

test('a hostile event name is length-capped before it is stored', async () => {
  const { env, rows } = harness();
  const res = await post('x.' + 'a'.repeat(5000), env);
  assert.equal(res.status, 400);
  const props = JSON.parse(rows[0][6]);
  assert.ok(props.attempted.length <= 120, 'attempted name must be capped');
});
