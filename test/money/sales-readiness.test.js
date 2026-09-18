// Buyer requirements + Añejo readiness: the check that would have caught, before the first email,
// that an AHCA adult day care needs a dietitian-signed menu and an issued license certificate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, seedProspect, OWNER } from '../helpers/sales-fixture.js';
import { OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import {
  READINESS_ITEMS, BUYER_REQUIREMENTS, mergeReadiness, loadReadiness, setReadiness, buyerChecklist, readinessSummary,
} from '../../functions/_lib/sales/requirements.js';
import { onRequestGet as salesGet, onRequestPost as salesPost } from '../../functions/api/hub/owner/sales/index.js';

const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, { ...init, headers: { 'Content-Type': 'application/json', Cookie: OWNER_COOKIE, ...(init.headers || {}) } });

test('every requirement points at a readiness item that exists, with a reason and a source', () => {
  for (const [cat, def] of Object.entries(BUYER_REQUIREMENTS)) {
    for (const it of def.items) {
      assert.ok(READINESS_ITEMS[it.readiness], `${cat} → ${it.readiness}`);
      assert.ok(it.why && it.why.length > 20, `${cat}/${it.readiness} explains why`);
      assert.ok(it.source, `${cat}/${it.readiness} names its source`);
      assert.ok(['required', 'conditional', 'expected'].includes(it.level));
    }
  }
  for (const [k, v] of Object.entries(READINESS_ITEMS)) assert.ok(v.default && v.default.status && v.default.note, `${k} has a verified default`);
});

test('the defaults are honest: nothing unverified is marked ready', () => {
  const r = mergeReadiness(null);
  for (const k of ['food_manager_certification', 'w9', 'auto_liability_coi', 'dbpr_risk_level_3']) assert.equal(r[k].status, 'unknown', k);
  assert.equal(r.dbpr_license_certificate.status, 'in_progress', 'the license was not issued on 9/18');
  assert.equal(r.dietitian_signed_menu.status, 'in_progress');
  assert.equal(r.doea_caterer_list.status, 'missing');
  assert.equal(r.inspection_report.status, 'ready');
});

test('an adult day care shows the two gaps that stalled the Boca Raton deal', () => {
  const c = buyerChecklist('adult_day', mergeReadiness(null));
  assert.equal(c.verdict, 'gaps');
  const blocking = c.blocking.map((b) => b.readiness);
  assert.ok(blocking.includes('dietitian_signed_menu'));
  assert.ok(blocking.includes('dbpr_license_certificate'));
  assert.ok(c.items.some((i) => i.readiness === 'doea_caterer_list' && i.level === 'conditional'), 'the Elder Affairs caterer list is flagged when the center is in the food program');
  assert.ok(c.ask_first.some((q) => /Adult Care Food Program/.test(q)));
  assert.match(c.verdict_text, /not ready/);
});

test('once the documents are in, the same buyer reads ready (conditional items become questions)', () => {
  const r = mergeReadiness(Object.fromEntries(Object.keys(READINESS_ITEMS).map((k) => [k, { status: 'ready', note: 'on file' }])));
  const c = buyerChecklist('adult_day', r);
  assert.equal(c.blocking.length, 0);
  assert.equal(c.verdict, 'ready');
  const partial = mergeReadiness({ ...Object.fromEntries(Object.keys(READINESS_ITEMS).map((k) => [k, { status: 'ready' }])), doea_caterer_list: { status: 'missing' } });
  assert.equal(buyerChecklist('adult_day', partial).verdict, 'ask_first');
});

test('residential treatment asks for seven-day service; an office asks only for vendor basics', () => {
  const r = mergeReadiness(null);
  const res = buyerChecklist('residential_care', r);
  assert.ok(res.blocking.some((b) => b.readiness === 'seven_day_service'));
  const office = buyerChecklist('medical_office', r);
  assert.ok(!office.items.some((i) => i.readiness === 'dietitian_signed_menu'));
  assert.ok(office.items.some((i) => i.readiness === 'w9'));
});

test('the summary ranks blockers by how many open prospects they hold up', () => {
  const s = readinessSummary(mergeReadiness(null), { adult_day: 10, addiction_treatment: 3, medical_office: 2 });
  assert.equal(s.top_blockers[0].prospects >= 10, true);
  const lic = s.top_blockers.find((b) => b.key === 'dbpr_license_certificate');
  assert.equal(lic.prospects, 15, 'every category needs the license certificate');
});

test('the owner updates readiness; bad keys and statuses are refused', async () => {
  const { env } = await readyEnv();
  const ok = await setReadiness(env, 'w9', { status: 'ready', note: 'Signed 9/19, in Drive' }, OWNER);
  assert.equal(ok.ok, true);
  assert.equal((await loadReadiness(env)).w9.status, 'ready');
  assert.equal((await loadReadiness(env)).w9.is_default, false);
  assert.equal((await setReadiness(env, 'nope', { status: 'ready' }, OWNER)).ok, false);
  assert.equal((await setReadiness(env, 'w9', { status: 'done' }, OWNER)).ok, false);
  const onlyNote = await setReadiness(env, 'w9', { note: 'moved' }, OWNER);
  assert.equal(onlyNote.item.status, 'ready', 'a note-only save keeps the status');
});

test('API: detail carries the buyer checklist, the readiness view and op work, the dashboard surfaces blockers', async () => {
  const { env, cfg } = await readyEnv();
  const { orgId } = await seedProspect(env, cfg, { name: 'Sunny Days Adult Day Care', website: 'https://sunnydaysadc.org/' });
  env.DB.sqlite.prepare("UPDATE sales_organizations SET business_category = 'adult_day' WHERE id = ?").run(orgId);

  const det = await (await salesGet({ env, request: req(`/api/hub/owner/sales?view=detail&id=${orgId}`) })).json();
  assert.equal(det.ok, true);
  assert.equal(det.buyer_checklist.category, 'adult_day');
  assert.equal(det.buyer_checklist.verdict, 'gaps');

  const rv = await (await salesGet({ env, request: req('/api/hub/owner/sales?view=readiness') })).json();
  assert.equal(rv.ok, true);
  assert.ok(rv.items.length >= 15);
  assert.ok(rv.summary.top_blockers.length > 0);
  assert.ok(rv.categories.some((c) => c.category === 'adult_day' && c.open_prospects === 1));

  const set = await salesPost({ env, request: req('/api/hub/owner/sales', { method: 'POST', body: JSON.stringify({ op: 'set_readiness', key: 'dietitian_signed_menu', status: 'ready', note: 'Signed by X, FL LD/N 123' }) }) });
  assert.equal(set.status, 200);
  const bad = await salesPost({ env, request: req('/api/hub/owner/sales', { method: 'POST', body: JSON.stringify({ op: 'set_readiness', key: 'w9', status: 'maybe' }) }) });
  assert.equal(bad.status, 400);

  const dash = await (await salesGet({ env, request: req('/api/hub/owner/sales') })).json();
  assert.ok(dash.readiness.top_blockers.some((b) => b.key === 'dbpr_license_certificate'));
  assert.ok(!dash.readiness.top_blockers.some((b) => b.key === 'dietitian_signed_menu'), 'a saved readiness item stops blocking');
});
