// Google Places is NOT an approved production prospect source in this release: its terms restrict
// storing Places content beyond place IDs, and a prospect CRM persists organizations. These tests
// pin that a configured key alone can never trigger it — scheduled, owner-initiated, or direct —
// while CSV import keeps working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, setting, reload, stubFetch } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { setFlag, flagsFrom, LOCKED_FLAGS } from '../../functions/_lib/sales/config.js';
import { discoverOrganizations, providerStatus, usableDiscoveryProvider } from '../../functions/_lib/sales/discovery.js';
import { runDiscoveryTick, runSalesJob } from '../../functions/_lib/sales/jobs.js';
import { onRequestPost as salesPost } from '../../functions/api/hub/owner/sales/index.js';

const KEYED = { GOOGLE_PLACES_API_KEY: 'k-live', GOOGLE_MAPS_API_KEY: 'k-maps' };

test('Places approval is a LOCKED flag: false in code, refused by the settings API, ignored if written to the table', async () => {
  const { env } = await readyEnv({ extraEnv: KEYED });
  assert.equal(LOCKED_FLAGS['sales.places_persistence_approved'], false);
  const r = await setFlag(env, 'sales.places_persistence_approved', true, 'stf_owner');
  assert.equal(r.ok, false);
  assert.equal(r.locked, true);
  assert.match(r.error, /not approved as a production prospect source/);
  assert.equal(flagsFrom(new Map([['sales.places_persistence_approved', 'true']]))['sales.places_persistence_approved'], false);
});

test('scheduled discovery with a key configured AND discovery switched on still never calls Places', async () => {
  const { env } = await readyEnv({ extraEnv: KEYED });
  setting(env, 'sales.discovery_enabled', 'true');
  const cfg = await reload(env);
  assert.equal(cfg.flags['sales.discovery_enabled'], true);
  const f = stubFetch();
  let called = 0;
  try {
    const r = await runDiscoveryTick(env, { cfg, fetchImpl: async () => { called++; return new Response('{}'); } });
    assert.equal(r.not_configured, true);
    assert.match(r.skipped, /not approved/);
    const job = await runSalesJob(env, 'discovery', { cfg, fetchImpl: async () => { called++; return new Response('{}'); } });
    assert.equal(job.outcome, 'skipped');
    assert.equal(called, 0, 'the provider was never called');
    assert.equal(f.calls.length, 0, 'no network at all');
  } finally { f.restore(); }
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations').length, 0);
});

test('the owner’s "discover now" is refused too, with the reason', async () => {
  const { env } = await readyEnv({ extraEnv: KEYED });
  const res = await salesPost({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify({ op: 'discover_now' }),
  }) });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /not approved/);
});

test('the provider boundary itself refuses Places without an explicit approval', async () => {
  let called = 0;
  const r = await discoverOrganizations(KEYED, { query: 'x', fetchImpl: async () => { called++; return new Response('{}'); } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_approved');
  assert.equal(called, 0);
});

test('the Hub is told Places is configured but NOT approved, and CSV is the approved production source', async () => {
  const { cfg } = await readyEnv({ extraEnv: KEYED });
  const list = providerStatus(KEYED, cfg.flags);
  const places = list.find((p) => p.key === 'google_places');
  assert.equal(places.configured, true);
  assert.equal(places.approved, false);
  assert.equal(places.usable, false);
  assert.equal(places.production_status, 'not_approved');
  assert.match(places.note, /NOT APPROVED/);
  const csv = list.find((p) => p.key === 'csv');
  assert.equal(csv.usable, true);
  assert.equal(usableDiscoveryProvider(KEYED, cfg.flags), null);
  for (const k of ['samhsa_findtreatment', 'ahca_healthfinder']) {
    const s = list.find((p) => p.key === k);
    assert.equal(s.usable, false, `${k} is a recommendation, not an integration`);
    assert.equal(s.production_status, 'recommended_not_integrated');
  }
});

test('an AHCA FloridaHealthFinder adult-day-care export imports as-is, licensed beds included', async () => {
  const { env } = await readyEnv();
  const csv = 'File Number,Facility name,Street Address,City,Zip,Phone Number,Licensed Beds\n'
    + '12345,Sunrise Adult Day Care Center,100 Main St,Delray Beach,33444,(561) 555-0101,60\n';
  const res = await salesPost({ env, request: new Request('https://anejocateringco.com/api/hub/owner/sales', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE }, body: JSON.stringify({ op: 'import_csv', csv }),
  }) });
  const r = await res.json();
  assert.equal(r.ok, true, r.error);
  assert.equal(r.created, 1);
  const org = env.DB.one('SELECT name, street, city, zip, phone, employee_or_capacity_hint, business_category FROM sales_organizations');
  assert.equal(org.name, 'Sunrise Adult Day Care Center');
  assert.equal(org.employee_or_capacity_hint, '60');
  assert.equal(org.business_category, 'adult_day');
});
