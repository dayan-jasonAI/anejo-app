// The holiday controls on the contracts desk, driven through the handlers the page actually calls.
//
// contracts.js carries its own lesson about why: roster ops once shipped after the account_id guard
// and were unreachable in production while a string-matching test reported them present. A match
// proves code is PRESENT, never that it is REACHABLE — so nothing here reads the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function call(env, method, body) {
  const mod = await import('../../functions/api/hub/owner/contracts.js');
  const { OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  const init = { method, headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  const request = new Request('https://anejo.test/api/hub/owner/contracts', init);
  const res = await (method === 'GET' ? mod.onRequestGet : mod.onRequestPost)({ request, env });
  return { status: res.status, body: await res.json() };
}

async function freshEnv() {
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv();
  env.DB.sqlite.prepare("UPDATE contract_accounts SET status = 'active' WHERE id = 'acct_dgp'").run();
  return env;
}

test('the owner chooses which holidays the kitchen closes, and the choice is what the notices read', async () => {
  const { loadHolidaySettings } = await import('../../functions/_lib/holiday_notices.js');
  const env = await freshEnv();

  const r = await call(env, 'POST', { op: 'save_holidays', kitchen_closed: ['thanksgiving', 'christmas_day', 'thanksgiving'], sms_enabled: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const s = await loadHolidaySettings(env);
  assert.deepEqual(s.kitchen_closed, ['thanksgiving', 'christmas_day'], 'saved, de-duplicated');
  assert.equal(s.sms_enabled, false);

  const g = await call(env, 'GET');
  assert.equal(g.body.ok, true);
  assert.equal(g.body.holidays.catalog.length, 14, 'the checklist offers all eleven federal holidays plus the extras, not only the next 90 days');
  assert.deepEqual(g.body.holidays.settings.kitchen_closed, ['thanksgiving', 'christmas_day']);
  assert.ok(Array.isArray(g.body.accounts), 'the contracts desk itself is still there');
});

test('an unknown holiday is refused and nothing is written', async () => {
  const { loadHolidaySettings } = await import('../../functions/_lib/holiday_notices.js');
  const env = await freshEnv();
  const r = await call(env, 'POST', { op: 'save_holidays', kitchen_closed: ['thanksgiving', 'cinco_de_mayo'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /cinco_de_mayo/);
  assert.deepEqual((await loadHolidaySettings(env)).kitchen_closed, [], 'a half-valid list is not half-saved');
});

test('a location’s ops email is set, normalised, refused when malformed, and cleared when blank', async () => {
  const env = await freshEnv();
  const db = env.DB.sqlite;
  const site = db.prepare("SELECT id FROM contract_sites WHERE account_id = 'acct_dgp' ORDER BY name LIMIT 1").get();
  const stored = () => db.prepare('SELECT ops_email FROM contract_sites WHERE id = ?').get(site.id).ops_email;

  let r = await call(env, 'POST', { op: 'edit_terms', account_id: 'acct_dgp', site_id: site.id, ops_email: '  Office@Clinic.Example ' });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(stored(), 'office@clinic.example');

  r = await call(env, 'POST', { op: 'edit_terms', account_id: 'acct_dgp', site_id: site.id, ops_email: 'not-an-email' });
  assert.notEqual(r.body.ok, true);
  assert.equal(stored(), 'office@clinic.example', 'a bad address never replaces a good one');

  r = await call(env, 'POST', { op: 'edit_terms', account_id: 'acct_dgp', ops_email: 'x@clinic.example' });
  assert.notEqual(r.body.ok, true, 'an ops email belongs to one location, never broadcast across the account');

  r = await call(env, 'POST', { op: 'edit_terms', account_id: 'acct_dgp', site_id: site.id, ops_email: '' });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(stored(), null, 'blank clears it — holiday email falls back to the billing inbox');
});
