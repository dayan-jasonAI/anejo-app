// The Añejo Marketing Team, after Añejo Daily (2026-09-10).
//
// Three things were wrong with the team and this file is the guarantee that they stay fixed:
//
//   1. IT WAS BOWL-ONLY. The weekly planner filtered the live catalog to `kind === 'bowl'` and
//      skipped the whole run when no bowl was on sale, so the traditional plates, the croquetas,
//      the catering trays, La Cajita, the drinks and Añejo Daily could not be promoted by a team
//      that could not see them.
//   2. IT STATED STALE OPERATIONS. "Next-day orders until 8 PM ET", a fossilised 6 PM cutoff,
//      "wholesale for venues" — sentences typed once and true only on the day they were typed.
//   3. IT NOW TOUCHES THE INSTITUTIONAL DESK. Mon-Wed, Añejo Daily is the SAME meal definition the
//      office & clinic contract eats. That is the entire overlap marketing is allowed. A caption
//      that names the account, states its headcount, or talks about patients must be stopped by
//      CODE, not by a paragraph in a prompt.
//
// And the rule that outranks all three: NOTHING PUBLISHES ITSELF. Owner approval is unchanged, and
// every trust lane — including the three new ones — sits at auto_publish = 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSqliteD1, ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';

import {
  productFamilies, renderFamilies, orderingFacts, renderOrderingFacts,
  dailyMarketingContext, renderDailyContext, marketingContext, renderMarketingContext,
  anythingSellable, briefSection, FAMILIES,
} from '../../functions/_lib/marketing_context.js';
import { deterministicFlags } from '../../functions/_lib/governance.js';
import { TRUST_CATEGORIES, autoPublishCategories } from '../../functions/_lib/trust_ledger.js';
import { RELAUNCH_SEQUENCE, ASSET_KINDS, pinnedNow, staleBowlOnlyDrafts } from '../../functions/_lib/relaunch.js';
import { onRequestPost as socialPost } from '../../functions/api/hub/owner/social.js';

const MC = readFileSync(new URL('../../functions/_lib/marketing_context.js', import.meta.url), 'utf8');
const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const LEAD = readFileSync(new URL('../../functions/_lib/team_lead.js', import.meta.url), 'utf8');
const ANA = readFileSync(new URL('../../functions/_lib/ana_social.js', import.meta.url), 'utf8');
const RELAUNCH = readFileSync(new URL('../../functions/_lib/relaunch.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0104_anejo_daily.sql', import.meta.url), 'utf8');

const t = Date.now();

// One row per family, so a grouping bug shows up as a MISSING FAMILY rather than as a subtly
// wrong count. The ids are the real scheme the September menu was generated from
// (scripts/menu-2026-09/generate.mjs): `traditional_<base>`, `catering_<base>-<n>`, and anything
// with 'cajita' in it is La Cajita whichever way it is packaged.
function seedCatalog(DB) {
  // The migrations carry the REAL September catalog (hundreds of SKUs), which is excellent for the
  // storefront tests and useless for counting families. Cleared first so every assertion below is
  // about rows this test put there.
  DB.sqlite.exec('DELETE FROM menu_items');
  const rows = [
    ['vida', 'bowl', 'VIDA', 1999, 'Fresh tuna mango bowl', 'bowl_vida.jpg', 'available'],
    ['fuego', 'bowl', 'FUEGO', 2299, 'Steak bowl', 'bowl_fuego.jpg', 'sold_out'],
    ['fit_gold', 'drink', 'Gold Vitality', 999, 'Cold-pressed', null, 'available'],
    ['traditional_lechon', 'addon', 'Roast pork — 6 oz', 900, 'Lechón asado', 'menu-launch/food-lechon.webp', 'available'],
    ['traditional_croqueta-jamon', 'addon', 'Ham croqueta', 250, '', 'menu-launch/croqueta.webp', 'available'],
    ['catering_lechon-25', 'addon', 'Roast pork — 25 servings', 18000, 'Tray', 'menu-launch/food-lechon.webp', 'available'],
    ['catering_cajita-10', 'addon', 'La Cajita — 10 cajitas', 16000, 'Boxes', 'menu-launch/cajitas-collection.webp', 'available'],
    ['daily_wed_lechon', 'daily', "Wednesday's lechón plate", 1000, 'Lechón, congrí, salad', 'menu-launch/food-lechon.webp', 'available'],
  ];
  for (const [id, kind, name, cents, desc, img, avail] of rows) {
    DB.sqlite.prepare(
      `INSERT INTO menu_items (id, kind, name, price_cents, description, image, availability, active, sort, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,1,1,?,?)`
    ).run(id, kind, name, cents, desc, img, avail, t, t);
  }
}

const setSetting = (DB, k, v) => DB.sqlite
  .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
  .run(k, v, t);

// ---------------------------------------------------------------------------
// 1. The team is no longer bowl-only
// ---------------------------------------------------------------------------

test('the catalog reaches marketing as PRODUCT FAMILIES, not a bowl shelf', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  const fams = await productFamilies({ DB });
  const by = Object.fromEntries(fams.map((f) => [f.key, f]));

  // Every family the owner names exists, and the non-bowl ones are populated from real rows.
  assert.deepEqual(fams.map((f) => f.key),
    ['daily', 'traditional', 'catering', 'cajita', 'fit', 'drinks', 'institutional']);
  assert.equal(by.traditional.items.length, 2, 'the lechón plate and the croqueta');
  assert.equal(by.catering.items.length, 1, 'the 25-serving tray');
  assert.equal(by.cajita.items.length, 1);
  assert.equal(by.daily.items.length, 1);
  assert.equal(by.fit.items.length, 2);

  // FIRST MATCH WINS: traditional_/catering_ rows carry kind 'addon', so without it they would be
  // counted a second time under "Drinks & add-ons" and that family would stop meaning drinks.
  assert.equal(by.drinks.items.length, 1, 'only the drink — no traditional/catering leakage');
  assert.deepEqual(by.drinks.items.map((i) => i.id), ['fit_gold']);

  // Availability survives the regrouping: a sold-out bowl is SHOWN and marked, never dropped.
  const fuego = by.fit.items.find((i) => i.name === 'FUEGO');
  assert.equal(fuego.available, false);
  assert.equal(by.fit.on_sale, 1);
  assert.match(renderFamilies(fams), /FUEGO \(\$22\.99\) — OFF SALE right now, do not promote it/);
});

test('the rendered catalog names every line — a planner reading it cannot think Añejo is a bowl shop', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  const text = renderFamilies(await productFamilies({ DB }));
  for (const label of ['Añejo Daily', 'Traditional Cuban', 'Catering & Events', 'La Cajita', 'Añejo Fit', 'Drinks & add-ons', 'Institutional']) {
    assert.ok(text.includes(label), `${label} is in the rendered catalog`);
  }
  assert.match(text, /Roast pork — 25 servings \(\$180\.00\)/, 'a catering tray, by name and real price');
  assert.match(text, /Ham croqueta \(\$2\.50\)/);
});

test('the planner skips only when NOTHING is sellable — not when the bowls are off', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  // Take every bowl off sale. The croquetas, the tray, the cajitas and the drink are still on.
  DB.sqlite.prepare("UPDATE menu_items SET availability='sold_out' WHERE kind='bowl'").run();
  const fams = await productFamilies({ DB });
  assert.equal(fams.find((f) => f.key === 'fit').on_sale, 0);
  assert.equal(anythingSellable(fams), true, 'a week with no bowls is still a week with plenty to say');

  DB.sqlite.prepare("UPDATE menu_items SET availability='sold_out'").run();
  assert.equal(anythingSellable(await productFamilies({ DB })), false, 'and an empty menu is still an empty menu');
});

test('the planner and the Team Lead read ONE catalog, and it is this one', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /const ctx = await marketingContext\(env\)/);
  assert.match(planner, /renderMarketingContext\(ctx\)/);
  assert.match(planner, /if \(!anythingSellable\(ctx\.families\)\)/);
  assert.match(LEAD, /const families = await productFamilies\(env, \{ menu, daily \}\)/);
  assert.match(LEAD, /renderFamilies\(spine\.families\.filter/);
  // The identity sentence the owner objected to.
  assert.ok(!/made-to-order bowl kitchen/.test(AUTO), 'the "bowl kitchen" self-description is gone');
  assert.match(AUTO, /a CUBAN CATERING COMPANY in Palm Beach County/);
});

// ---------------------------------------------------------------------------
// 2. No stale ordering facts — every hour comes from a setting
// ---------------------------------------------------------------------------

test('the stated cutoffs come from the owner settings, and move when he moves them', async () => {
  const DB = makeSqliteD1();
  setSetting(DB, 'ops.order_by_hour', '20');
  setSetting(DB, 'ops.area_label', 'Palm Beach County');
  setSetting(DB, 'daily.cutoff_time', '10:30');
  const f = await orderingFacts({ DB });

  assert.equal(f.scheduled_order_by, '8 PM the day before', 'the dial reads 20, so the sentence reads 8 PM');
  assert.equal(f.daily_cutoff_label, '10:30 AM', "and Añejo Daily's own, separate cutoff is read too");
  assert.equal(f.delivery_only, true);

  const text = renderOrderingFacts(f);
  assert.match(text, /ordered by 8 PM the day before/);
  assert.match(text, /Añejo Daily is ordered the SAME DAY until 10:30 AM ET/);
  assert.match(text, /DELIVERY ONLY — Añejo has no pickup/);

  // Move both dials; the sentences must move with them.
  setSetting(DB, 'ops.order_by_hour', '18');
  setSetting(DB, 'daily.cutoff_time', '11:00');
  const f2 = await orderingFacts({ DB });
  assert.equal(f2.scheduled_order_by, '6 PM the day before');
  assert.equal(f2.daily_cutoff_label, '11:00 AM');
});

test('no fossilised hour survives anywhere in the marketing path', () => {
  // The three sentences that were actually published or shipped, by name.
  assert.ok(!/Next-day orders until 8 PM ET/.test(LEAD), "the Team Lead's hard-coded 8 PM is gone");
  assert.ok(!/6:00 PM the day before/.test(ANA), "Aña's fossilised 6 PM is gone");
  assert.ok(!/wholesale for venues/.test(ANA), 'the "Añejo Bites is wholesale" claim is gone');
  // And the Team Lead now carries the live block instead.
  assert.match(LEAD, /const ordering = await orderingFacts\(env\)/);
  assert.match(LEAD, /renderOrderingFacts\(spine\.ordering\)/);
  // DELIVERY ONLY is TRUE and stays. test/money/ana-social.test.js pins the no-pickup language;
  // this is the second lock, on the shared context every other surface reads.
  assert.match(ANA, /DELIVERY ONLY \(no pickup\)/);
  assert.match(MC, /DELIVERY ONLY — Añejo has no pickup\. Never offer one\./);
});

// ---------------------------------------------------------------------------
// 3. Añejo Daily reaches marketing — scrubbed
// ---------------------------------------------------------------------------

test('marketing sees the Daily dish, price, allocation, remainder and cutoff — and nothing else', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  setSetting(DB, 'daily.cutoff_time', '11:00');
  // A Wednesday, so the institutional alignment flag is exercised.
  const date = '2026-09-16';
  DB.sqlite.prepare(
    `INSERT INTO daily_schedule (service_date, menu_item_id, allocation, status, created_at, updated_at)
     VALUES (?,?,?,'active',?,?)`
  ).run(date, 'daily_wed_lechon', 10, t, t);
  DB.sqlite.prepare(
    `INSERT INTO daily_claims (id, service_date, menu_item_id, qty, status, expires_at, created_at, updated_at)
     VALUES ('dcl_1',?,?,3,'confirmed',0,?,?)`
  ).run(date, 'daily_wed_lechon', t, t);

  // 08:00 ET on that Wednesday — before the 11:00 cutoff.
  const ctx = await dailyMarketingContext({ DB }, { nowDate: new Date('2026-09-16T12:00:00Z') });
  assert.equal(ctx.scheduled, true);
  assert.equal(ctx.today.name, "Wednesday's lechón plate");
  assert.equal(ctx.today.price_usd, 10);
  assert.equal(ctx.today.allocation, 10);
  assert.equal(ctx.today.remaining, 7, 'three confirmed portions are gone');
  assert.equal(ctx.today.cutoff_label, '11:00 AM');
  assert.equal(ctx.today.status, 'open');
  assert.equal(ctx.today.sold_out, false);
  assert.equal(ctx.today.institutional_aligned, true, 'Wednesday shares the meal definition');

  // THE SCRUB: the object carries no institutional shape at all — no account, no headcount, not
  // even the sold/held split the owner's own view has.
  const asJson = JSON.stringify(ctx);
  for (const leak of ['account', 'headcount', 'contract', 'patient', 'clinic', 'held', 'sold"']) {
    assert.ok(!asJson.toLowerCase().includes(leak), `the Daily marketing context leaks no "${leak}"`);
  }

  const text = renderDailyContext(ctx);
  assert.match(text, /orders close 11:00 AM ET/);
  assert.match(text, /never name an account, a headcount, a patient or a clinic/);
});

test('a sold-out Daily is reported sold out, so nothing invites an order for it', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  const date = '2026-09-16';
  DB.sqlite.prepare(
    `INSERT INTO daily_schedule (service_date, menu_item_id, allocation, status, created_at, updated_at)
     VALUES (?,?,?,'active',?,?)`
  ).run(date, 'daily_wed_lechon', 2, t, t);
  DB.sqlite.prepare(
    `INSERT INTO daily_claims (id, service_date, menu_item_id, qty, status, expires_at, created_at, updated_at)
     VALUES ('dcl_x',?,?,2,'confirmed',0,?,?)`
  ).run(date, 'daily_wed_lechon', t, t);
  const ctx = await dailyMarketingContext({ DB }, { nowDate: new Date('2026-09-16T12:00:00Z') });
  assert.equal(ctx.today.remaining, 0);
  assert.equal(ctx.today.sold_out, true);
  assert.match(renderDailyContext(ctx), /SOLD OUT — do not invite orders/);
});

test('no marketing path can reach institutional production — structurally', () => {
  // productionFor() is the function that adds institutional headcount to the public allocation.
  // publicDaily() is the scrubbed view. Marketing reads the second and must never learn the first.
  assert.match(MC, /publicDaily/);
  // Comment lines are stripped: these files EXPLAIN the boundary, and quoting the forbidden name
  // in the explanation is what makes the boundary readable. It is the CODE that must not call it.
  const codeOf = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const [name, src] of [['marketing_context.js', MC], ['automations.js', AUTO], ['team_lead.js', LEAD], ['relaunch.js', RELAUNCH]]) {
    const code = codeOf(src);
    assert.ok(!/productionFor/.test(code), `${name} does not call productionFor`);
    assert.ok(!/contract_orders|resolveContractMeal|contract_accounts/.test(code), `${name} reads no contract table`);
  }
});

// ---------------------------------------------------------------------------
// 4. The privacy wall: code stops the leak, not a prompt
// ---------------------------------------------------------------------------

const flagsFor = (caption, extra = {}) =>
  deterministicFlags(caption, { priceCents: new Set([1000, 1999]), orderByHour: 18, ...extra });

test('a caption naming a contract account is FLAGGED before the owner ever sees it', () => {
  const names = ['Delray Gastro Partners'];
  const flags = flagsFor('Proud to feed Delray Gastro Partners every Wednesday.', { contractNames: names });
  assert.ok(flags.some((f) => f.type === 'privacy' && /contract account/.test(f.detail)));

  // Case and punctuation do not get it past.
  assert.ok(flagsFor('delray gastro partners loved it!', { contractNames: names })
    .some((f) => f.type === 'privacy'));
  // And an unrelated caption is not flagged — a guard that fires on everything gets ignored.
  assert.deepEqual(flagsFor('Lunch today is $10.00. anejocateringco.com/order', { contractNames: names }), []);
});

test('an institutional headcount is flagged; the public Daily allocation is NOT', () => {
  assert.ok(flagsFor('We deliver lunch for 40 employees every weekday.')
    .some((f) => f.type === 'privacy' && /headcount/.test(f.detail)));
  assert.ok(flagsFor('Our weekly headcount just went up again.')
    .some((f) => f.type === 'privacy'));
  // THE LINE THAT MUST NOT MOVE: Añejo Daily's whole proposition is a small public allocation.
  // "Only 10 portions today" is the product, not a leak.
  assert.deepEqual(flagsFor('Only 10 portions today — anejocateringco.com/order'), []);
  assert.deepEqual(flagsFor('10 plates, one dish, $10.00. anejocateringco.com/order'), []);
});

test('patient and clinic wording is flagged — the service is describable, its customers are not', () => {
  for (const bad of [
    'Feeding the clinic team again today',
    'Our patients love Wednesday',
    'Lunch at the dialysis center',
  ]) {
    assert.ok(flagsFor(bad).some((f) => f.type === 'privacy'), `flagged: ${bad}`);
  }
  // The generic, allowed framing passes.
  assert.deepEqual(flagsFor('The same dish our weekday office meal service is eating. anejocateringco.com/order'), []);
});

test('the wall is armed on the ONE door every generated draft goes through', () => {
  const GOV = readFileSync(new URL('../../functions/_lib/governance.js', import.meta.url), 'utf8');
  // auditDraft loads the names itself rather than trusting a caller to pass them — a guard the
  // caller has to remember to arm is a guard that will one day not be armed.
  assert.match(GOV, /const contractNames = await contractAccountNames\(env\)/);
  assert.match(GOV, /deterministicFlags\(caption, \{ priceCents: menuPriceCents\(menu\), orderByHour, contractNames \}\)/);
  assert.match(GOV, /SELECT name FROM contract_accounts/);
  // Deterministic checks run on EVERY draft, including the ones the model call refuses.
  assert.match(GOV, /verdict: 'flag'/);
});

test('the planner prompt itself also forbids it — belt as well as braces', () => {
  // The prompt is assembled by string concatenation, so the sentence is split across source
  // lines; matched in two halves rather than pinning where the join happens to fall.
  assert.match(AUTO, /NEVER name an institutional customer, a headcount, a clinic, /);
  assert.match(AUTO, /or a patient — the office & clinic meal service may only be described in the generic terms above\./);
  assert.match(LEAD, /THE INSTITUTIONAL DESK IS NOT YOURS TO WRITE ABOUT IN SPECIFICS/);
});

// ---------------------------------------------------------------------------
// 5. Owner approval is unchanged, and auto-publish stays off
// ---------------------------------------------------------------------------

test('the three new trust lanes exist, are seeded, and are OFF', async () => {
  assert.ok(['daily', 'traditional', 'cajita'].every((c) => TRUST_CATEGORIES.includes(c)));
  const DB = makeSqliteD1();                       // every migration applied, 0104 included
  const rows = DB.rows('SELECT category, approved_clean, auto_publish FROM trust_ledger ORDER BY category');
  assert.equal(rows.length, TRUST_CATEGORIES.length, 'every lane in code is a lane in the database');
  for (const r of rows) {
    assert.equal(r.auto_publish, 0, `${r.category} is not auto-publishing`);
    assert.equal(r.approved_clean, 0, `${r.category} has earned nothing yet`);
  }
  assert.equal((await autoPublishCategories({ DB })).size, 0, 'nothing publishes unattended');
  // And the migration cannot be the thing that turns one on.
  assert.ok(!/auto_publish[^)]*VALUES[^;]*, 1,/.test(MIG));
});

test('nothing in this work publishes, schedules or sends', () => {
  for (const [name, src] of [['marketing_context.js', MC], ['relaunch.js', RELAUNCH]]) {
    assert.ok(!/publishSocialPost|instagram_messaging|sendDirectMessage|replyToComment/.test(src),
      `${name} cannot reach a publish or send path`);
  }
  // The relaunch sequence is DATA the owner may choose to run — it writes no post.
  assert.ok(!/INSERT INTO social_posts/.test(RELAUNCH), 'relaunch prep creates no drafts');
});

// ---------------------------------------------------------------------------
// 6. Relaunch prep: data, asset honesty, and archiving without destroying evidence
// ---------------------------------------------------------------------------

test('the relaunch running order is the owner\'s, in his order, with the pinned three', () => {
  assert.deepEqual(RELAUNCH_SEQUENCE.map((e) => e.title), [
    'What is Añejo?', 'Catering & Events', 'La Cajita', 'Croquetas', 'Traditional Cuban',
    'Ensalada Fría', 'Office & Clinic Meal Service', 'Añejo Fit', 'Añejo Daily',
  ]);
  // La Cajita stands in for Añejo Daily until Daily is actually live — pinning a post for
  // something nobody can order yet is an advert for a disappointment.
  assert.deepEqual(pinnedNow({ dailyLive: false }).map((e) => e.key),
    ['what_is_anejo', 'catering_events', 'la_cajita']);
  assert.deepEqual(pinnedNow({ dailyLive: true }).map((e) => e.key),
    ['what_is_anejo', 'catering_events', 'anejo_daily']);
});

test('asset provenance is carried on every entry: a generated image is never documentary', () => {
  assert.equal(ASSET_KINDS.documentary.generated_allowed, false);
  assert.equal(ASSET_KINDS.designed.generated_allowed, true);
  for (const e of RELAUNCH_SEQUENCE) {
    assert.ok(ASSET_KINDS[e.asset], `${e.key} declares a known asset kind`);
    assert.ok(e.asset_note, `${e.key} says WHY`);
  }
  // A post whose subject is a claim about real food must be a real photograph.
  for (const key of ['traditional_cuban', 'croquetas', 'la_cajita', 'anejo_daily', 'anejo_fit']) {
    assert.equal(RELAUNCH_SEQUENCE.find((e) => e.key === key).asset, 'documentary', `${key} needs a real photo`);
  }
  // The office & clinic entry is the one that must be generic — and it says so.
  const inst = RELAUNCH_SEQUENCE.find((e) => e.key === 'office_clinic');
  assert.match(inst.asset_note, /No client name, no headcount, no clinic, no patient/);
  assert.match(inst.prompt, /never a customer, a headcount, or a location/);
});

test('stale bowl-only drafts are SURFACED, and the archive is a status change — never a delete', async () => {
  const DB = makeSqliteD1();
  seedCatalog(DB);
  const mk = (id, caption) => DB.sqlite.prepare(
    `INSERT INTO social_posts (id, platform, caption, public_token, status, source, created_at, updated_at)
     VALUES (?,'instagram',?,?,'draft','planner',?,?)`
  ).run(id, caption, 'tok_' + id, t, t);
  mk('sp_bowl', 'VIDA is back on the menu today.');
  mk('sp_mixed', 'VIDA, and a Ham croqueta on the side.');
  mk('sp_tray', 'Roast pork — 25 servings for your next gathering.');

  const families = await productFamilies({ DB });
  const stale = await staleBowlOnlyDrafts({ DB }, { families });
  const ids = stale.map((s) => s.id);
  assert.ok(ids.includes('sp_bowl'), 'a bowl-only draft is surfaced');
  assert.ok(!ids.includes('sp_mixed'), 'a draft that also names a croqueta is NOT stale');
  assert.ok(!ids.includes('sp_tray'), 'and neither is a catering draft');
  assert.match(stale.find((s) => s.id === 'sp_bowl').reason, /Names only Añejo Fit bowls/);
});

test('archiving a stale draft keeps the evidence: status changes, the row stays', async () => {
  const env = ownerEnv();
  env.DB.sqlite.prepare(
    `INSERT INTO social_posts (id, platform, caption, public_token, status, source, created_at, updated_at)
     VALUES ('sp_old','instagram','VIDA is back','tok_old','draft','planner',?,?)`
  ).run(t, t);

  const call = (body) => socialPost({
    request: new Request('https://x/api/hub/owner/social', {
      method: 'POST', headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  });

  const r = await (await call({ op: 'archive', id: 'sp_old' })).json();
  assert.equal(r.ok, true);
  assert.equal(r.status, 'archived');
  const row = env.DB.one("SELECT status, caption FROM social_posts WHERE id='sp_old'");
  assert.equal(row.status, 'archived', 'a status change');
  assert.equal(row.caption, 'VIDA is back', 'and the words are still there to read');

  // Reversible — an archive nobody can undo is a delete with better manners.
  const back = await (await call({ op: 'unarchive', id: 'sp_old' })).json();
  assert.equal(back.status, 'draft');
  assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='sp_old'").status, 'draft');
});

test('an archived draft is inert everywhere — it cannot publish or schedule itself', () => {
  const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
  // Every state transition guards on the status it expects, so 'archived' matches nothing.
  assert.match(API, /SET status='archived', scheduled_at=NULL/);
  assert.match(API, /WHERE id=\? AND status='archived'/, 'and only an archived row un-archives');
  assert.ok(!/DELETE FROM social_posts WHERE id=\? AND status='archived'/.test(API), 'archiving is never a delete');
});

// ---------------------------------------------------------------------------
// 7. The .webp → JPEG bridge, and the honesty label that rides with it
// ---------------------------------------------------------------------------

test('a draft records WHICH approved catalog photo it is about', () => {
  assert.match(MIG, /ALTER TABLE social_posts ADD COLUMN catalog_image TEXT/);
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  // Validated against the ids the model was ACTUALLY shown — an invented id records nothing.
  assert.match(planner, /const catalogItem = catalog\.get\(item && item\.catalog_item\) \|\| null/);
  assert.match(planner, /const catalogImage = \(catalogItem && catalogItem\.image\) \|\| null/);
  assert.match(AUTO, /"catalog_item": string\|null/);
});

test('the JPEG derivative is made in the browser and the canonical asset is untouched', () => {
  // No transcoder exists server-side in this stack; the browser has a real 2D compositor.
  assert.match(PAGE, /function jpegFromImage/);
  assert.match(PAGE, /c\.toDataURL\('image\/jpeg', 0\.92\)/);
  assert.match(PAGE, /data-catalogimg/);
  // It goes through the EXISTING JPEG upload route — the JPEG-only rule is met, not weakened.
  assert.match(PAGE, /\/api\/hub\/owner\/social-upload/);
  assert.match(PAGE, /origin: 'catalog_jpeg'/);
  const INSTA = readFileSync(new URL('../../functions/_lib/instagram.js', import.meta.url), 'utf8');
  assert.match(INSTA, /export const JPEG_ONLY = \/\\\.jpe\?g\$\/i;/, 'the JPEG-only rule is intact');
});

test('a catalog image is labelled an illustration, never a photograph of a delivered order', () => {
  const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
  // Only a value from the fixed list is stored; anything else is NULL ("not recorded").
  assert.match(API, /\['ai_generated', 'catalog_jpeg', 'owner_photo'\]\.includes\(originRaw\) \? originRaw : null/);
  // And the owner sees which is which on the thumbnail, the same way a generated slide is badged.
  assert.match(PAGE, /m\.origin === 'catalog_jpeg'/);
  assert.match(PAGE, /never caption it as a photo of a delivered order/);
});

// ---------------------------------------------------------------------------
// 8. The brand brief stays the source of truth
// ---------------------------------------------------------------------------

test('family descriptions are the owner\'s own words from the brief, not a second copy of them', () => {
  const traditional = FAMILIES.find((f) => f.key === 'traditional');
  assert.equal(traditional.blurb_heading, '### B. Añejo Traditional');
  const section = briefSection('### B. Añejo Traditional');
  assert.match(section, /Lunch and dinner plates, Cuban sandwiches and tacos/);
  assert.ok(!/### C\./.test(section), 'one section, not the rest of the document');
  // automations.js no longer keeps its own copy of the slicing.
  assert.match(AUTO, /return briefSection\('## 3\. Our three product lines'\);/);
});

test('everything renders together without a live database — degraded, not broken', async () => {
  const ctx = await marketingContext({});          // no DB at all
  const text = renderMarketingContext(ctx);
  assert.match(text, /Cuban catering company/);
  assert.match(text, /DELIVERY ONLY/);
  assert.match(text, /a rolling daily cutoff, not a weekly one/);
  assert.ok(!/undefined/.test(text), 'no undefined leaks into a prompt');
});
