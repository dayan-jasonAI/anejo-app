// Training that goes out of date, driven through the handlers the HUB actually calls.
//
// The event this pins: on 2026-09-15 the kitchen gained a hard gate — two photos before Mark ready —
// and the cook was never told. Her training_completions row said "completed", so nothing prompted
// her and the owner's compliance view showed her green. Everything below is a way that can happen
// again: a NULL version treated as current, a POST that records no version, a role with nothing new
// being nagged anyway, or "never trained" and "trained before the change" collapsing into one badge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';

const KITCHEN_COOKIE = 'anejo_sess=tok-kitchen';
const MKT_COOKIE = 'anejo_sess=tok-marketing';

async function status(env, cookie, query = '') {
  const mod = await import('../../functions/api/hub/training/status.js');
  const request = new Request(`https://anejo.test/api/hub/training/status${query}`, { headers: { Cookie: cookie } });
  const res = await mod.onRequestGet({ request, env });
  return { status: res.status, body: await res.json() };
}

async function complete(env, cookie, body) {
  const mod = await import('../../functions/api/hub/training/complete.js');
  const request = new Request('https://anejo.test/api/hub/training/complete', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await mod.onRequestPost({ request, env });
  return { status: res.status, body: await res.json() };
}

async function ownerStatus(env) {
  const mod = await import('../../functions/api/hub/owner/training-status.js');
  const request = new Request('https://anejo.test/api/hub/owner/training-status', { headers: { Cookie: OWNER_COOKIE } });
  const res = await mod.onRequestGet({ request, env });
  return { status: res.status, body: await res.json() };
}

// A completion row exactly as the pre-versioning code wrote one: no version column value at all.
function trainedBeforeVersioning(env, staffId, module, at = 1_750_000_000_000) {
  env.DB.sqlite.prepare(
    'INSERT INTO training_completions (id, staff_id, module, lang, completed_at) VALUES (?,?,?,?,?)'
  ).run(`tc_${staffId}_${module}`, staffId, module, 'es', at);
}

test('a kitchen completion from before the change reads as DUE, and stops being due once the current version is recorded', async () => {
  const env = ownerEnv();
  trainedBeforeVersioning(env, 'stf_k', 'kitchen');

  let r = await status(env, KITCHEN_COOKIE);
  assert.equal(r.status, 200);
  assert.equal(r.body.module, 'kitchen');
  assert.equal(r.body.state, 'outdated', 'a NULL version is the pre-versioning generation, not "whatever is current"');
  assert.equal(r.body.due, true);
  assert.equal(r.body.prompt, true, 'she is stopped at sign-in');
  assert.equal(r.body.completed_version, '2026-06-23-baseline');
  assert.equal(r.body.current_version, '2026-09-16-photo-gate');

  const done = await complete(env, KITCHEN_COOKIE, { module: 'kitchen', lang: 'es' });
  assert.equal(done.body.ok, true);

  r = await status(env, KITCHEN_COOKIE);
  assert.equal(r.body.state, 'current');
  assert.equal(r.body.due, false);
  assert.equal(r.body.prompt, false, 'the gate must not fire again once she has done it');
  assert.equal(r.body.update, null, 'nothing is owed…');
  assert.ok(r.body.module_update, '…but the new procedure is still readable on the training page');
});

test('a staffer who has never trained is due, and is named as never trained rather than out of date', async () => {
  const env = ownerEnv();
  const r = await status(env, KITCHEN_COOKIE);
  assert.equal(r.body.state, 'never');
  assert.equal(r.body.due, true);
  assert.equal(r.body.prompt, true);
  assert.equal(r.body.completed_at, null);
});

test('POST records WHICH version was completed — the whole point of the column', async () => {
  const env = ownerEnv();
  const r = await complete(env, KITCHEN_COOKIE, { module: 'kitchen', lang: 'es' });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.version, '2026-09-16-photo-gate');

  const row = env.DB.sqlite.prepare("SELECT version, lang, updated_at, completed_at FROM training_completions WHERE staff_id='stf_k' AND module='kitchen'").get();
  assert.equal(row.version, '2026-09-16-photo-gate');
  assert.equal(row.lang, 'es');
  assert.ok(row.updated_at > 0, 'the row stamps when it last changed');

  // Re-completing the same module updates the same row rather than creating a second one.
  await complete(env, KITCHEN_COOKIE, { module: 'kitchen', lang: 'en' });
  const n = env.DB.sqlite.prepare("SELECT COUNT(*) c FROM training_completions WHERE staff_id='stf_k' AND module='kitchen'").get().c;
  assert.equal(n, 1);
});

test('the status endpoint carries the what-changed lines in BOTH languages — the cook reads Spanish', async () => {
  const env = ownerEnv();
  trainedBeforeVersioning(env, 'stf_k', 'kitchen');
  const r = await status(env, KITCHEN_COOKIE);

  const u = r.body.update;
  assert.ok(u, 'a due staffer is told what changed');
  assert.match(u.headline.en, /two photos/i);
  assert.match(u.headline.es, /dos fotos/i);
  assert.equal(u.changes.length, 3, 'the two photos, the lock on Mark Ready, and the prep clock');
  for (const c of u.changes) {
    assert.ok(c.en && c.es, 'every line is bilingual');
    assert.notEqual(c.en, c.es, 'and the Spanish is actually Spanish, not the English copied across');
  }
  // The three things that actually shipped, named in the language she works in.
  const es = u.changes.map((c) => c.es).join(' ');
  assert.match(es, /envase abierto/, 'the food inside the open container');
  assert.match(es, /envase cerrado/, 'then the container closed');
  assert.match(es, /Marcar Listo queda bloqueado/, 'Mark Ready is locked until both are saved');
  assert.match(es, /cuenta regresiva/, 'and the prep countdown that shipped with it');
});

test('a role with no update is never prompted — trained long ago or not at all', async () => {
  const env = ownerEnv();
  // Trained before versioning existed: nothing changed for marketing, so nothing is owed.
  trainedBeforeVersioning(env, 'stf_m', 'marketing');
  let r = await status(env, MKT_COOKIE);
  assert.equal(r.body.state, 'current', 'a baseline completion is still current when the baseline is current');
  assert.equal(r.body.due, false);
  assert.equal(r.body.prompt, false);
  assert.equal(r.body.module_update, null);

  // And never trained at all: the owner still sees the gap, but she is not blocked out of her work
  // by a card with nothing to read on it.
  env.DB.sqlite.prepare("DELETE FROM training_completions WHERE staff_id='stf_m'").run();
  r = await status(env, MKT_COOKIE);
  assert.equal(r.body.state, 'never');
  assert.equal(r.body.due, true, 'the owner is owed this');
  assert.equal(r.body.prompt, false, 'but there is no new material to stop her with');
});

test('browsing another role’s tutorial never raises a gate for a module you do not work under', async () => {
  const env = ownerEnv();
  const r = await status(env, MKT_COOKIE, '?module=kitchen');
  assert.equal(r.body.module, 'kitchen');
  assert.equal(r.body.own_module, 'marketing');
  assert.ok(r.body.module_update, 'she can read what changed in the kitchen');
  assert.equal(r.body.prompt, false, 'but she is not stopped by the kitchen’s gate');
});

test('the owner sees out-of-date as its own state, separate from never trained', async () => {
  const env = ownerEnv();
  trainedBeforeVersioning(env, 'stf_k', 'kitchen');       // trained, before the photo gate
  trainedBeforeVersioning(env, 'stf_m', 'marketing');     // trained, nothing changed since
  // stf_owner has no row at all.

  const r = await ownerStatus(env);
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.body.items.map((i) => [i.role, i]));

  assert.equal(by.kitchen.state, 'outdated');
  assert.ok(by.kitchen.completed_at, 'she really was trained — the date must survive');
  assert.match(by.kitchen.update_headline.en, /two photos/i, 'and the owner reads WHY she is behind');

  assert.equal(by.marketing.state, 'current');
  assert.equal(by.owner.state, 'never');

  assert.equal(r.body.total, 3);
  assert.equal(r.body.done, 1, 'out of date does not count as done');
  assert.equal(r.body.outdated, 1);
  assert.equal(r.body.never, 1);
  assert.deepEqual(r.body.modules_with_updates, ['kitchen']);

  // Most urgent first: never trained, then out of date, then current.
  assert.deepEqual(r.body.items.map((i) => i.state), ['never', 'outdated', 'current']);
});
