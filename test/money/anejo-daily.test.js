// Añejo Daily — the money path, end to end, against real SQLite with every migration applied.
//
// What these tests hold in place (owner decisions, 2026-09-10):
//   · one featured lunch per date at a $10 / $15 tier, sold from a per-date PUBLIC allocation (10)
//   · same-day until the Daily cutoff (default 11:00 AM ET), no $25 minimum, lunch, delivery only
//   · a portion is claimed atomically BEFORE Square; a failed checkout gives it back; a retried
//     checkout never consumes twice; the last portion cannot be sold twice
//   · institutional (DGP) headcount never consumes the public allocation, and the public endpoint
//     never carries an institutional name, headcount or contract detail
//   · delivery fee = max(base, driving miles × rate), falling back to the base fee
//   · every other product keeps every rule it had
//
// The clock is mocked (Date only) so cutoff tests do not depend on when the suite runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as checkout } from '../../functions/api/checkout.js';
import { onRequestPost as webhook } from '../../functions/api/webhooks/square.js';
import { onRequestGet as publicDailyGet } from '../../functions/api/daily.js';
import { onRequestGet as ownerDailyGet, onRequestPost as ownerDailyPost } from '../../functions/api/hub/owner/daily.js';
import { onRequestGet as kitchenSummary } from '../../functions/api/hub/kitchen/summary.js';
import { onRequestPost as ownerMenuPost } from '../../functions/api/hub/owner/menu.js';
import {
  setDay, dayView, claimPortions, releaseClaim, releaseHolds, claimTotals, cutoffPassed, productionFor, saveDailySettings, loadDailySettings,
  confirmClaimsForOrder,
} from '../../functions/_lib/daily.js';
import { mileageFee, dailyDeliveryFee, loadDeliverySettings, driveDistanceMeters } from '../../functions/_lib/delivery_fee.js';
import { resolveContractMeal, setContractMenuSlot } from '../../functions/_lib/contract.js';
import { loadMenu, publicCatalog } from '../../functions/_lib/menu.js';

const MON = '2026-09-14';                 // a Monday
const TUE = '2026-09-15';
const WED = '2026-09-16';
const et = (hhmm, date = MON) => Date.parse(`${date}T${hhmm}:00-04:00`);   // EDT

function clock(t, ms) { t.mock.timers.enable({ apis: ['Date'], now: ms }); }

function makeEnv(extra = {}) {
  const env = ownerEnv({ SQUARE_ACCESS_TOKEN: 'test-only', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox', ...extra });
  const t = Date.now();
  const ins = env.DB.sqlite.prepare(
    // OR REPLACE: the migrations already seed the live launch menu (traditional_fria among it).
    `INSERT OR REPLACE INTO menu_items (id, kind, name, name_es, price_cents, description, image, sort, active, created_at, updated_at, availability, unit_cost_cents, group_key)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  ins.run('daily_ropa', 'daily', 'Ropa Vieja Lunch', 'Almuerzo de Ropa Vieja', 1500, 'Ropa vieja, white rice, black beans, maduros', 'menu-launch/ropa.webp', 1, 1, t, t, 'available', 610, null);
  ins.run('daily_pollo', 'daily', 'Pollo Asado Lunch', 'Almuerzo de Pollo Asado', 1000, 'Pollo asado, congrí, yuca', null, 2, 1, t, t, 'available', 420, null);
  ins.run('daily_odd', 'daily', 'Odd Price Lunch', null, 1250, null, null, 3, 1, t, t, 'available', null, null);
  ins.run('drink_materva', 'drink', 'Materva', 'Materva', 399, null, null, 1, 1, t, t, 'available', 120, 'cuban');
  ins.run('drink_water', 'drink', 'Still Water', 'Agua', 250, null, null, 2, 1, t, t, 'available', null, 'hydrate');
  ins.run('traditional_fria', 'addon', 'Ensalada Fría', 'Ensalada Fría', 550, '6 oz', null, 1, 1, t, t, 'available', 200, null);
  return env;
}

function stubFetch(t, { fail = false, meters = null } = {}) {
  const calls = [];
  let n = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: init && init.body ? JSON.parse(init.body) : null });
    if (u.includes('/v2/online-checkout/payment-links')) {
      if (fail) return new Response(JSON.stringify({ errors: [{ detail: 'Square is down' }] }), { status: 500 });
      n += 1;
      return new Response(JSON.stringify({ payment_link: { id: 'pl_' + n, order_id: 'sq_' + n, url: 'https://square.link/u/' + n } }), { status: 200 });
    }
    if (u.includes('computeRoutes')) {
      return new Response(JSON.stringify(meters == null ? {} : { routes: [{ distanceMeters: meters }] }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
  return calls;
}
const squareCalls = (calls) => calls.filter((c) => c.url.includes('payment-links'));

const ADDRESS = { street: '123 Main St', city: 'Delray Beach', zip: '33444' };
const CONTACT = { first_name: 'Ana', email: 'ana@example.com' };
function post(body, ip = '10.0.0.1') {
  return new Request('https://anejo.test/api/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body),
  });
}
const dailyBody = (over = {}) => ({
  items: [{ id: 'daily_ropa', qty: 1 }], daily: { date: MON }, checkout_key: 'key-' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12),
  fulfillment: { mode: 'scheduled' }, address: ADDRESS, contact: CONTACT, ...over,
});
const call = async (env, body, ip) => { const res = await checkout({ env, request: post(body, ip) }); return { status: res.status, data: await res.json() }; };

async function schedule(env, date, meal = 'daily_ropa', allocation = 10, extra = {}) {
  const r = await setDay(env, { date, menu_item_id: meal, allocation, by: 'test', ...extra });
  assert.equal(r.ok, true, r.error);
}

// ---------------------------------------------------------------- checkout rules

test('a $15 Añejo Daily lunch checks out same-day, under the $25 minimum, with the Daily reference and a held portion', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const calls = stubFetch(t);
  const r = await call(env, dailyBody());
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.url, 'https://square.link/u/1');
  const sq = squareCalls(calls)[0].body.order;
  assert.equal(sq.reference_id, 'web-daily');
  assert.equal(sq.line_items[0].base_price_money.amount, 1500);
  assert.equal(sq.service_charges[0].amount_money.amount, 500);      // $5 floor
  assert.match(sq.note, /AÑEJO DAILY/);
  const o = env.DB.one('SELECT * FROM orders');
  assert.equal(o.status, 'pending');
  assert.equal(o.delivery_date, MON);
  assert.equal(o.delivery_window, 'lunch');
  assert.equal(o.fulfillment_mode, 'scheduled');
  assert.equal(o.subtotal_cents, 1500);
  const line = JSON.parse(o.items)[0];
  assert.equal(line.unit_cost_cents, 610);                             // cost snapshot
  const c = env.DB.one('SELECT * FROM daily_claims');
  assert.equal(c.status, 'held');
  assert.equal(c.order_id, o.id);
  assert.equal(c.payment_url, 'https://square.link/u/1');
  assert.equal((await dayView(env, MON)).remaining, 9);
});

test('a $10 Daily plus a packaged drink checks out, and the drink carries its own cost snapshot', async (t) => {
  clock(t, et('10:15'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_pollo');
  stubFetch(t);
  const r = await call(env, dailyBody({ items: [{ id: 'daily_pollo', qty: 1 }, { id: 'drink_materva', qty: 2 }] }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const o = env.DB.one('SELECT * FROM orders');
  assert.equal(o.subtotal_cents, 1000 + 2 * 399);
  const lines = JSON.parse(o.items);
  assert.deepEqual(lines.map((l) => [l.id, l.unit_cost_cents]), [['daily_pollo', 420], ['drink_materva', 120]]);
  // Drinks do not consume the Daily allocation.
  assert.equal((await dayView(env, MON)).remaining, 9);
});

test('an unknown cost stays NULL on the order line — never a fake zero', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  stubFetch(t);
  await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 1 }, { id: 'drink_water', qty: 1 }] }));
  const lines = JSON.parse(env.DB.one('SELECT items FROM orders').items);
  assert.equal(lines[1].unit_cost_cents, null);
});

test('the $25 minimum still applies to every non-Daily order', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  const r = await call(env, { items: [{ id: 'drink_materva', qty: 1 }], fulfillment: { mode: 'scheduled' }, delivery: { date: WED, window: 'lunch' }, address: ADDRESS, contact: CONTACT });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Order minimum/);
});

test('Traditional still requires 48 hours notice — the Daily exemption does not leak', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  const r = await call(env, { items: [{ id: 'traditional_fria', qty: 10 }], fulfillment: { mode: 'scheduled' }, delivery: { date: TUE, window: 'lunch' }, address: ADDRESS, contact: CONTACT });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /48 hours/);
});

test('mixed carts: Daily + a non-drink item is refused; two different Daily meals are refused', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const calls = stubFetch(t);
  const a = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 1 }, { id: 'traditional_fria', qty: 10 }] }));
  assert.equal(a.status, 409);
  assert.match(a.data.error, /only be combined with drinks/);
  const b = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 1 }, { id: 'daily_pollo', qty: 1 }] }));
  assert.equal(b.status, 409);
  assert.equal(squareCalls(calls).length, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM daily_claims').n, 0);
});

test('a Daily cart sent as on_demand is still handled as Daily (not the bowl window)', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  stubFetch(t);
  const r = await call(env, dailyBody({ fulfillment: { mode: 'on_demand' }, mode: 'on_demand' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(env.DB.one('SELECT fulfillment_mode FROM orders').fulfillment_mode, 'scheduled');
});

test('a meal that is not that date\'s Daily cannot be bought through the Daily path', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa');
  stubFetch(t);
  const r = await call(env, dailyBody({ items: [{ id: 'daily_pollo', qty: 1 }] }));
  assert.equal(r.status, 409);
  assert.match(r.data.error, /not Añejo Daily on this date/);
  // And nothing scheduled at all:
  const r2 = await call(env, dailyBody({ daily: { date: TUE } }));
  assert.equal(r2.status, 409);
});

// ---------------------------------------------------------------- cutoff

test('cutoff: 10:59 AM ET is open, 11:00 AM ET is closed (default)', async (t) => {
  assert.equal(cutoffPassed(MON, '11:00', new Date(et('10:59'))), false);
  assert.equal(cutoffPassed(MON, '11:00', new Date(et('11:00'))), true);
  assert.equal(cutoffPassed(TUE, '11:00', new Date(et('23:00'))), false);   // tomorrow stays open
  assert.equal(cutoffPassed(MON, '11:00', new Date(et('09:00', TUE))), true); // yesterday is closed
  clock(t, et('11:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const calls = stubFetch(t);
  const r = await call(env, dailyBody());
  assert.equal(r.status, 409);
  assert.match(r.data.error, /closed at 11:00 AM/);
  assert.equal(squareCalls(calls).length, 0);
  assert.equal((await dayView(env, MON)).status, 'closed');
});

test('cutoff: the owner setting moves it, and a per-date override wins over the setting', async (t) => {
  clock(t, et('10:45'));
  const env = makeEnv();
  await schedule(env, MON);
  await schedule(env, TUE);
  const s = await saveDailySettings(env, { cutoff_time: '10:30' }, 'owner');
  assert.equal(s.ok, true);
  assert.equal((await dayView(env, MON)).status, 'closed');
  assert.equal((await dayView(env, MON)).cutoff_label, '10:30 AM');
  await schedule(env, MON, 'daily_ropa', 10, { cutoff_time: '10:50' });
  assert.equal((await dayView(env, MON)).status, 'open');
  assert.equal((await saveDailySettings(env, { cutoff_time: '11 am' })).ok, false);   // malformed refused
  assert.equal((await loadDailySettings(env)).cutoff_time, '10:30');
});

test('a malformed stored cutoff falls back to 11:00, never to "always open"', async (t) => {
  clock(t, et('11:30'));
  const env = makeEnv();
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('daily.cutoff_time', 'noon', 1), ('daily.tiers', 'abc', 1), ('daily.default_allocation', '-4', 1)");
  const s = await loadDailySettings(env);
  assert.equal(s.cutoff_time, '11:00');
  assert.deepEqual(s.tiers, [1000, 1500]);
  assert.equal(s.default_allocation, 10);
});

// ---------------------------------------------------------------- allocation

test('10 of 10 sold → sold out, server-side, and the count never goes negative', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  for (let i = 0; i < 10; i++) {
    const c = await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'k-bulk-' + i });
    assert.equal(c.ok, true);
  }
  const v = await dayView(env, MON);
  assert.equal(v.remaining, 0);
  assert.equal(v.status, 'sold_out');
  const calls = stubFetch(t);
  const r = await call(env, dailyBody());
  assert.equal(r.status, 409);
  assert.match(r.data.error, /sold out/);
  assert.equal(squareCalls(calls).length, 0);
  const over = await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'k-over' });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'sold_out');
  assert.equal((await claimTotals(env, MON)).held, 10);
});

test('a quantity larger than what is left is refused, not partially filled', async (t) => {
  // This is about the ALLOCATION, not the per-order cap (tested separately) — lift the cap so the
  // request reaches the capacity check it is here to exercise.
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 2);
  await saveDailySettings(env, { max_per_order: 5 }, 'owner');
  stubFetch(t);
  const r = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 3 }] }));
  assert.equal(r.status, 409);
  assert.match(r.data.error, /Only 2/);
});

test('the last portion cannot be sold twice — two simultaneous checkouts, exactly one wins', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 1);
  const calls = stubFetch(t);
  const [a, b] = await Promise.all([call(env, dailyBody(), '10.0.0.2'), call(env, dailyBody(), '10.0.0.3')]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(squareCalls(calls).length, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM daily_claims WHERE status = 'held'").n, 1);
  assert.equal((await dayView(env, MON)).remaining, 0);
});

test('the guarded claim itself is race-proof: 25 concurrent claims on 10 portions → exactly 10', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'race-' + i })));
  assert.equal(results.filter((r) => r.ok).length, 10);
  assert.equal(env.DB.one("SELECT SUM(qty) n FROM daily_claims WHERE status = 'held'").n, 10);
});

test('a failed Square checkout gives the portion back', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 1);
  stubFetch(t, { fail: true });
  const r = await call(env, dailyBody());
  assert.equal(r.status, 502);
  assert.equal(env.DB.one('SELECT status FROM daily_claims').status, 'released');
  const v = await dayView(env, MON);
  assert.equal(v.remaining, 1);
  assert.equal(v.status, 'open');
});

test('a retried checkout (same key) returns the same Square link and never consumes twice', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const calls = stubFetch(t);
  const body = dailyBody({ checkout_key: 'retry-key-1234567890' });
  const first = await call(env, body);
  const second = await call(env, body);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.data.url, first.data.url);
  assert.equal(second.data.reused, true);
  assert.equal(squareCalls(calls).length, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM daily_claims').n, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM orders').n, 1);
  assert.equal((await dayView(env, MON)).remaining, 9);
});

test('a retry after a failed Square call can re-claim with the same key — through the same capacity check', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 1);
  const first = await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'again-1' });
  await releaseClaim(env, first.claim_id);
  // Someone else takes the freed portion before the retry…
  assert.equal((await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'other-1' })).ok, true);
  // …so the retry is sold out, not a second copy of the last portion.
  const retry = await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'again-1' });
  assert.equal(retry.ok, false);
  assert.equal(retry.code, 'sold_out');
});

test('an abandoned hold stops counting when it expires — nothing has to clean it up', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 1);
  assert.equal((await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 1, checkoutKey: 'hold-1' })).ok, true);
  assert.equal((await dayView(env, MON)).remaining, 0);
  t.mock.timers.setTime(et('09:31'));
  assert.equal((await dayView(env, MON)).remaining, 1);
});

test('allocation is per date: selling Monday out leaves Tuesday untouched', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 2);
  await schedule(env, TUE, 'daily_pollo', 10);
  await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 2, checkoutKey: 'mon-all' });
  assert.equal((await dayView(env, MON)).status, 'sold_out');
  const tue = await dayView(env, TUE);
  assert.equal(tue.remaining, 10);
  assert.equal(tue.status, 'open');
  stubFetch(t);
  const r = await call(env, dailyBody({ items: [{ id: 'daily_pollo', qty: 1 }], daily: { date: TUE } }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(env.DB.one('SELECT delivery_date FROM orders').delivery_date, TUE);
});

// ---------------------------------------------------------------- payment → sold

async function payWebhook(env, squareOrderId) {
  const body = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { order_id: squareOrderId, status: 'COMPLETED', buyer_email_address: 'ana@example.com' } } } });
  return webhook({ env, request: new Request('https://anejo.test/api/webhooks/square', { method: 'POST', body }) });
}

test('payment confirms the held portion; a webhook retry changes nothing', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  stubFetch(t);
  await call(env, dailyBody());
  const res = await payWebhook(env, 'sq_1');
  assert.equal(res.status, 200);
  assert.equal(env.DB.one('SELECT status FROM orders').status, 'paid');
  assert.equal(env.DB.one('SELECT status FROM daily_claims').status, 'confirmed');
  await payWebhook(env, 'sq_1');
  const tot = await claimTotals(env, MON);
  assert.deepEqual(tot, { sold: 1, held: 0 });
  // A confirmed portion never expires back into the allocation.
  t.mock.timers.setTime(et('10:30'));
  assert.equal((await dayView(env, MON)).remaining, 9);
});

test('a payment that lands after its hold lapsed and the portion resold is kept AND alerts the owner', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON, 'daily_ropa', 1);
  stubFetch(t);
  await call(env, dailyBody());
  t.mock.timers.setTime(et('09:45'));                                   // hold lapsed
  const other = await call(env, dailyBody(), '10.0.0.9');               // someone else buys it
  assert.equal(other.status, 200);
  await payWebhook(env, 'sq_2');
  await payWebhook(env, 'sq_1');                                        // the late payer
  assert.deepEqual(await claimTotals(env, MON), { sold: 2, held: 0 });
  const alert = env.DB.one("SELECT * FROM alerts WHERE alert_type = 'daily_oversold'");
  assert.ok(alert, 'oversold alert raised');
  assert.match(alert.title, /oversold/);
});

// ---------------------------------------------------------------- institutional vs public

function seedContract(env, { mealId = 'daily_ropa', headcount = 30 } = {}) {
  const t = Date.now();
  env.DB.exec(`INSERT INTO contract_accounts (id, name, status, created_at, updated_at) VALUES ('acct_test', 'Dr Garcia Pediatrics', 'active', ${t}, ${t})`);
  env.DB.exec(`INSERT INTO contract_sites (id, account_id, name, delivery_days, active, created_at, updated_at) VALUES ('site_test', 'acct_test', 'Delray Clinic', 'mon,tue,wed', 1, ${t}, ${t})`);
  env.DB.sqlite.prepare(`INSERT INTO orders (id, items, delivery_date, delivery_window, status, contract_site_id, headcount, customer_name, created_at, updated_at)
    VALUES ('octr_site_test_${MON}', ?, ?, 'lunch', 'paid', 'site_test', ?, 'DGP · Delray Clinic', ?, ?)`)
    .run(JSON.stringify([{ id: 'contract_lunch', name: 'Ropa Vieja Lunch', qty: headcount, meal_id: mealId }]), MON, headcount, t, t);
}

test('institutional headcount never consumes the public allocation', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  seedContract(env, { headcount: 30 });
  const v = await dayView(env, MON);
  assert.equal(v.allocation, 10);
  assert.equal(v.remaining, 10);
});

test('production groups the shared meal: institutional committed + public sold, unsold buffer kept separate', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  seedContract(env, { headcount: 30 });
  await saveDailySettings(env, { max_per_order: 5 }, 'owner');   // two portions in one order
  stubFetch(t);
  await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 2 }] }));
  await payWebhook(env, 'sq_1');
  await call(env, dailyBody(), '10.0.0.5');                             // held, not yet paid
  const rows = await productionFor(env, MON);
  // The migrations seed the real contract account, whose own site shows up as "count not in yet".
  const mine = rows.filter((x) => x.meal_id === 'daily_ropa');
  assert.equal(mine.length, 1, 'one meal, one production row — institutional and public together');
  const r = mine[0];
  assert.equal(r.meal_id, 'daily_ropa');
  assert.equal(r.institutional_committed, 30);
  assert.equal(r.public_sold, 2);
  assert.equal(r.public_held, 1);
  assert.equal(r.public_unsold, 7);
  assert.equal(r.required_now, 32, 'unsold allocation is never added to what must be cooked');

  const res = await kitchenSummary({ env, request: new Request(`https://anejo.test/api/hub/kitchen/summary?date=${MON}`, { headers: { Cookie: 'anejo_sess=tok-kitchen' } }) });
  assert.equal(res.status, 200);
  const k = await res.json();
  assert.equal(k.production.find((x) => x.meal_id === 'daily_ropa').required_now, 32);
  // Orders are not merged: the contract order and the public order stay separate rows.
  assert.equal(k.order_count, 2);
});

test('the public Daily endpoint carries no institutional name, headcount or contract data', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  await schedule(env, MON);
  await schedule(env, TUE, 'daily_pollo');
  seedContract(env, { headcount: 37 });
  const res = await publicDailyGet({ env, request: new Request('https://anejo.test/api/daily') });
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const d = await res.json();
  assert.equal(d.today.item.name, 'Ropa Vieja Lunch');
  assert.equal(d.today.remaining, 10);
  assert.equal(d.next.date, TUE);
  assert.equal(d.today.item.price_cents, 1500);
  const text = JSON.stringify(d);
  for (const secret of ['Garcia', 'Pediatrics', 'DGP', 'Delray Clinic', '37', 'institutional', 'contract', 'held', 'sold']) {
    assert.equal(text.includes(secret), false, `public payload leaked "${secret}"`);
  }
  const groups = Object.fromEntries(d.drinks.map((x) => [x.id, x.group]));
  assert.equal(groups.drink_materva, 'cuban');
  assert.equal(groups.drink_water, 'hydrate');
  assert.equal(d.drinks.some((x) => x.id.startsWith('daily_') || x.id.startsWith('traditional_')), false, 'only drinks are offered as upsells');
});

test('the institutional rotating menu can point at the shared meal, and the contract order carries it', async (t) => {
  clock(t, et('08:00'));
  const env = makeEnv();
  seedContract(env);
  const set = await setContractMenuSlot(env, { account_id: 'acct_test', rotation_week: 1, dow: 1, menu_item_id: 'daily_ropa' });
  assert.equal(set.ok, true, set.error);
  const again = await setContractMenuSlot(env, { account_id: 'acct_test', rotation_week: 1, dow: 1, menu_item_id: 'daily_pollo' });
  assert.equal(again.ok, true);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM contract_menu').n, 1, 'one slot, updated in place');
  const m = await resolveContractMeal(env, { id: 'acct_test', name: 'Dr Garcia Pediatrics' }, MON);
  assert.deepEqual(m, { name: 'Pollo Asado Lunch', meal_id: 'daily_pollo' });
  const tue = await resolveContractMeal(env, { id: 'acct_test', name: 'Dr Garcia Pediatrics' }, TUE);
  assert.equal(tue.meal_id, null);
  assert.match(tue.name, /Dr Lunch — /);                               // unchanged default for an empty slot
});

// ---------------------------------------------------------------- owner controls

const ownerReq = (body) => new Request('https://anejo.test/api/hub/owner/daily', { method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('owner: a meal off the Daily tiers cannot be scheduled; the tiers are owner data', async (t) => {
  clock(t, et('08:00'));
  const env = makeEnv();
  const bad = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'daily_odd' }) });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /not one of the Daily tiers/);
  const notDaily = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'drink_materva' }) });
  assert.equal(notDaily.status, 400);
  await ownerDailyPost({ env, request: ownerReq({ op: 'save_settings', tiers: '1000,1250,1500' }) });
  const ok = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'daily_odd' }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).view.allocation, 10, 'default allocation is 10');
});

test('owner: allocation cannot go below what is sold or held; the dish cannot change after sales; cancel is refused with sales', async (t) => {
  clock(t, et('08:00'));
  const env = makeEnv();
  await schedule(env, MON);
  await claimPortions(env, { dateStr: MON, mealId: 'daily_ropa', qty: 3, checkoutKey: 'three' });
  const low = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'daily_ropa', allocation: 2 }) });
  assert.equal(low.status, 400);
  const swap = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'daily_pollo', allocation: 10 }) });
  assert.equal(swap.status, 400);
  assert.match((await swap.json()).error, /cannot change after orders/);
  const cancel = await ownerDailyPost({ env, request: ownerReq({ op: 'cancel_day', date: MON }) });
  assert.equal(cancel.status, 400);
  const raise = await ownerDailyPost({ env, request: ownerReq({ op: 'set_day', date: MON, menu_item_id: 'daily_ropa', allocation: 12 }) });
  assert.equal(raise.status, 200);
  assert.equal((await dayView(env, MON)).remaining, 9);
});

test('owner: the desk is owner-only and reports production + mileage status', async (t) => {
  clock(t, et('08:00'));
  const env = makeEnv();
  await schedule(env, MON);
  const denied = await ownerDailyGet({ env, request: new Request('https://anejo.test/api/hub/owner/daily', { headers: { Cookie: 'anejo_sess=tok-marketing' } }) });
  assert.equal(denied.status, 403);
  const res = await ownerDailyGet({ env, request: new Request('https://anejo.test/api/hub/owner/daily', { headers: { Cookie: OWNER_COOKIE } }) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.days.length, 14);
  assert.equal(d.days[0].view.item.id, 'daily_ropa');
  assert.equal(d.delivery.status.active, false);
  assert.ok(d.meals.find((m) => m.id === 'daily_odd' && m.tier_ok === false));
});

test('owner menu: a Daily meal must be priced at a tier; unit cost saves, is logged, and blank means unknown', async (t) => {
  clock(t, et('08:00'));
  const env = makeEnv();
  const req = (body) => new Request('https://anejo.test/api/hub/owner/menu', { method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const bad = await ownerMenuPost({ env, request: req({ op: 'create_item', id: 'daily_bistec', kind: 'daily', name: 'Bistec Lunch', price_cents: 1299 }) });
  assert.equal(bad.status, 400);
  const good = await ownerMenuPost({ env, request: req({ op: 'create_item', id: 'daily_bistec', kind: 'daily', name: 'Bistec Lunch', price_cents: 1500, unit_cost_cents: 575 }) });
  assert.equal(good.status, 200);
  assert.equal(env.DB.one("SELECT unit_cost_cents FROM menu_items WHERE id='daily_bistec'").unit_cost_cents, 575);
  const upd = await ownerMenuPost({ env, request: req({ op: 'update_item', id: 'drink_materva', unit_cost_cents: 135, group_key: 'cuban' }) });
  assert.equal(upd.status, 200);
  assert.ok(env.DB.one("SELECT * FROM menu_price_log WHERE item_id='drink_materva' AND field='unit_cost_cents'"));
  const clear = await ownerMenuPost({ env, request: req({ op: 'update_item', id: 'drink_materva', unit_cost_cents: '' }) });
  assert.equal(clear.status, 200);
  assert.equal(env.DB.one("SELECT unit_cost_cents FROM menu_items WHERE id='drink_materva'").unit_cost_cents, null);
  const wrongGroup = await ownerMenuPost({ env, request: req({ op: 'update_item', id: 'traditional_fria', group_key: 'cuban' }) });
  assert.equal(wrongGroup.status, 400);
});

test('catalog: Daily meals never appear in the general catalog; drinks carry kind + group', async () => {
  const env = makeEnv();
  const cat = publicCatalog(await loadMenu(env));
  const all = [...cat.bowls, ...cat.drinks, ...cat.addons].map((x) => x.id);
  assert.equal(all.some((id) => id.startsWith('daily_')), false);
  const materva = cat.drinks.find((d) => d.id === 'drink_materva');
  assert.equal(materva.kind, 'drink');
  assert.equal(materva.group, 'cuban');
});

// ---------------------------------------------------------------- delivery fee

test('fee formula: under the floor → $5; over → the mileage charge; bad inputs → the base', () => {
  assert.deepEqual(mileageFee({ baseCents: 500, rateCents: 70, miles: 3 }), { fee_cents: 500, basis: 'floor', charge_cents: 210 });
  assert.deepEqual(mileageFee({ baseCents: 500, rateCents: 70, miles: 12.4 }), { fee_cents: 868, basis: 'mileage', charge_cents: 868 });
  assert.equal(mileageFee({ baseCents: 500, rateCents: 70, miles: NaN }).fee_cents, 500);
  assert.equal(mileageFee({ baseCents: 500, rateCents: null, miles: 50 }).fee_cents, 500);
  assert.equal(mileageFee({ baseCents: 'x', rateCents: 70, miles: 1 }).fee_cents, 500);
});

test('fee: measured driving distance above the floor is charged; one-way vs round-trip is explicit', async () => {
  const env = makeEnv({ GOOGLE_MAPS_API_KEY: 'k', KITCHEN_ORIGIN_LAT: '26.46', KITCHEN_ORIGIN_LNG: '-80.07' });
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.mileage_rate_cents', '70', 1), ('delivery.distance_policy', 'one_way', 1)");
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ routes: [{ distanceMeters: 16093.44 }] })); };
  const f = await dailyDeliveryFee(env, null, { lat: 26.5, lng: -80.1 }, { fetchImpl });
  assert.deepEqual([f.fee_cents, f.basis, f.miles, f.policy], [700, 'mileage', 10, 'one_way']);
  assert.equal(sent[0].intermediates, undefined);
  env.DB.exec("UPDATE app_settings SET value = 'round_trip' WHERE key = 'delivery.distance_policy'");
  await dailyDeliveryFee(env, null, { lat: 26.5, lng: -80.1 }, { fetchImpl });
  assert.equal(sent[1].intermediates.length, 1, 'round trip = kitchen → customer → kitchen');
  assert.deepEqual(sent[1].origin, sent[1].destination);
});

test('fee: no distance (no key, no origin, no geocode, API failure) → the base fee, never a guess', async () => {
  const noKey = makeEnv();
  noKey.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.mileage_rate_cents', '70', 1), ('delivery.distance_policy', 'one_way', 1)");
  assert.equal((await dailyDeliveryFee(noKey, null, { lat: 26.5, lng: -80.1 })).fee_cents, 500);
  const keyed = makeEnv({ GOOGLE_MAPS_API_KEY: 'k', KITCHEN_ORIGIN_LAT: '26.46', KITCHEN_ORIGIN_LNG: '-80.07' });
  keyed.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.mileage_rate_cents', '70', 1), ('delivery.distance_policy', 'one_way', 1)");
  assert.equal((await dailyDeliveryFee(keyed, null, null)).fee_cents, 500);
  const boom = async () => { throw new Error('network'); };
  const f = await dailyDeliveryFee(keyed, null, { lat: 26.5, lng: -80.1 }, { fetchImpl: boom });
  assert.equal(f.fee_cents, 500);
  assert.equal(f.basis, 'base');
  assert.equal(await driveDistanceMeters(keyed, { lat: 'x', lng: 1 }, { lat: 1, lng: 1 }, { fetchImpl: boom }), null);
});

test('fee: malformed delivery settings fall back safely, and bad owner input is refused', async () => {
  const env = makeEnv({ DELIVERY_FEE_USD: '5' });
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.base_fee_cents', 'five', 1), ('delivery.mileage_rate_cents', '-3', 1), ('delivery.distance_policy', 'crow_flies', 1)");
  assert.deepEqual(await loadDeliverySettings(env), { base_fee_cents: 500, mileage_rate_cents: null, distance_policy: 'off' });
  const r = await ownerDailyPost({ env, request: ownerReq({ op: 'save_delivery', base_fee_cents: 5.5, distance_policy: 'crow_flies' }) });
  assert.equal(r.status, 400);
});

test('fee in checkout: a Daily order pays the mileage fee; a regular order keeps the flat fee', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv({ GOOGLE_MAPS_API_KEY: 'k', KITCHEN_ORIGIN_LAT: '26.46', KITCHEN_ORIGIN_LNG: '-80.07' });
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.mileage_rate_cents', '70', 1), ('delivery.distance_policy', 'one_way', 1)");
  await schedule(env, MON);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, _init) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('geocode')) {
      return new Response(JSON.stringify({ status: 'OK', results: [{ formatted_address: '123 Main St, Delray Beach, FL 33444, USA', geometry: { location: { lat: 26.5, lng: -80.1 }, location_type: 'ROOFTOP' }, address_components: [{ types: ['street_number'], short_name: '123' }, { types: ['route'], short_name: 'Main St' }, { types: ['locality'], short_name: 'Delray Beach' }, { types: ['postal_code'], short_name: '33444' }] }] }));
    }
    if (u.includes('computeRoutes')) return new Response(JSON.stringify({ routes: [{ distanceMeters: 20921.472 }] }));   // 13 mi
    if (u.includes('payment-links')) return new Response(JSON.stringify({ payment_link: { id: 'pl', order_id: 'sq', url: 'https://square.link/u/x' } }));
    return new Response('{}');
  });
  const r = await call(env, dailyBody());
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const o = env.DB.one('SELECT fee_cents FROM orders');
  assert.equal(o.fee_cents, 910, '13 mi × 70¢');
});

// ---------------------------------------------------------------- the review's findings, pinned
//
// Every test below exists because an adversarial read of this branch found a way to lose money,
// leak a customer's details, or leave the owner unable to fix their own day. Each one is the
// smallest reproduction of that finding.

test('one crafted request cannot take the whole day: the per-order cap is enforced server-side', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  await schedule(env, MON, 'daily_ropa', 10);

  // The storefront offers one portion. A request for all ten is refused by the server, not just
  // by the page — otherwise a single POST holds the day for 30 minutes for free.
  const greedy = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 10 }] }));
  assert.equal(greedy.status, 409);
  assert.match(greedy.data.error, /one lunch per order/i);
  assert.equal((await claimTotals(env, MON)).held, 0, 'nothing was reserved');

  // The owner can raise it, and then that many go through.
  await saveDailySettings(env, { max_per_order: 3 }, 'owner');
  const three = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 3 }] }));
  assert.equal(three.status, 200);
  assert.equal((await claimTotals(env, MON)).held, 3);
  const four = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 4 }] }));
  assert.equal(four.status, 409);
  assert.match(four.data.error, /limited to 3 per order/i);
});

test('a checkout key is not a bearer token: a stranger presenting it gets no Square link', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  await schedule(env, MON);

  const key = 'kkkkkkkkkkkkkkkkkkkk';
  const first = await call(env, dailyBody({ checkout_key: key, contact: { first_name: 'Ana', email: 'ana@example.com', phone: '5615550100' } }));
  assert.equal(first.status, 200);
  const link = first.data.url;

  // The same buyer, retrying, gets their own link back.
  const retry = await call(env, dailyBody({ checkout_key: key, contact: { first_name: 'Ana', email: 'ANA@example.com' } }));
  assert.equal(retry.status, 200);
  assert.equal(retry.data.url, link, 'the same person retrying is the same checkout');
  assert.equal(retry.data.reused, true);

  // SOMEONE ELSE with that key gets nothing. The link opens a Square page carrying Ana's name and
  // phone number, so handing it over on a guessed key would hand over her details with it.
  const stranger = await call(env, dailyBody({ checkout_key: key, contact: { first_name: 'Mallory', email: 'mallory@example.com' } }), '10.0.0.9');
  assert.equal(stranger.status, 409);
  assert.equal(stranger.data.url, undefined, "another person's payment link is never returned");
  assert.equal((await claimTotals(env, MON)).held, 1, 'and no second portion was consumed either');
});

test('a link, once minted, keeps its claim — a late payment on the old link is still counted', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  const calls = stubFetch(t);
  await schedule(env, MON);

  const key = 'latepay-key-000000';
  const first = await call(env, dailyBody({ checkout_key: key }));
  assert.equal(first.status, 200);
  const firstOrder = (await env.DB.prepare("SELECT id FROM orders WHERE status='pending' ORDER BY created_at DESC LIMIT 1").first()).id;

  // The customer sits on the Square page until the hold lapses, then comes back to the same tab
  // and pays again. Reclaiming the key here used to move the claim onto a NEW order id, so when
  // they paid the OLD link the webhook found no claim: money taken, food owed, portion resold.
  t.mock.timers.setTime(et('09:45'));
  const again = await call(env, dailyBody({ checkout_key: key }));
  assert.equal(again.status, 200);
  assert.equal(again.data.url, first.data.url, 'they get their ORIGINAL link back, not a second one');
  assert.equal(again.data.reused, true);
  assert.equal(squareCalls(calls).length, 1, 'and Square was never asked for a second link');

  // They pay the original link. It is confirmed against the order it was always attached to.
  const claim = await env.DB.prepare('SELECT order_id, payment_url FROM daily_claims WHERE checkout_key = ?').bind(key).first();
  assert.equal(claim.order_id, firstOrder);
  assert.equal(claim.payment_url, first.data.url);
  const res = await confirmClaimsForOrder(env, firstOrder);
  assert.equal(res.confirmed, 1, 'the portion is counted against the order that was paid');
  assert.equal((await claimTotals(env, MON)).sold, 1);
});

test('the owner can hand back unpaid holds, and paid portions are never touched', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  await schedule(env, MON, 'daily_ropa', 3);

  // One paid, two abandoned in checkout — the day now reads sold out with one portion sold.
  const paid = await call(env, dailyBody({ checkout_key: 'paid-key-0000000000' }));
  const paidOrder = (await env.DB.prepare("SELECT id FROM orders WHERE status='pending' ORDER BY created_at DESC LIMIT 1").first()).id;
  await confirmClaimsForOrder(env, paidOrder);
  await call(env, dailyBody({ checkout_key: 'aband-key-000000001' }), '10.0.0.2');
  await call(env, dailyBody({ checkout_key: 'aband-key-000000002' }), '10.0.0.3');
  assert.equal(paid.status, 200);
  assert.deepEqual(await claimTotals(env, MON), { sold: 1, held: 2 });
  assert.equal((await dayView(env, MON)).status, 'sold_out');

  // Before this existed the owner was stuck: setDay refuses an allocation below sold+held, and
  // cancelDay refuses a day with anything held.
  const r = await releaseHolds(env, { date: MON, by: 'owner' });
  assert.equal(r.ok, true);
  assert.equal(r.released, 2);
  assert.deepEqual(await claimTotals(env, MON), { sold: 1, held: 0 }, 'the paid portion survives');
  const view = await dayView(env, MON);
  assert.equal(view.status, 'open');
  assert.equal(view.remaining, 2);
});

test('a Daily cannot be sold on a day the business does not deliver', async (t) => {
  clock(t, et('09:00', '2026-09-20'));   // a Sunday
  const env = makeEnv();
  stubFetch(t);
  // The owner's operating settings: Monday–Saturday, no Sunday.
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('ops.delivery_days', '1,2,3,4,5,6', 1)");
  await schedule(env, '2026-09-20');

  const res = await call(env, dailyBody({ items: [{ id: 'daily_ropa', qty: 1 }], daily: { date: '2026-09-20' } }));
  assert.equal(res.status, 409);
  assert.match(res.data.error, /do not deliver on that day/i);
  assert.equal((await claimTotals(env, '2026-09-20')).held, 0);
});

test('an implausible route distance is not trusted, and never becomes an enormous fee', async () => {
  const env = makeEnv({ GOOGLE_MAPS_API_KEY: 'k', KITCHEN_ORIGIN_LAT: '26.46', KITCHEN_ORIGIN_LNG: '-80.07' });
  env.DB.exec("INSERT INTO app_settings (key, value, updated_at) VALUES ('delivery.mileage_rate_cents', '70', 1), ('delivery.distance_policy', 'one_way', 1)");
  const settings = await loadDeliverySettings(env);

  // 3,000 miles. A geocode that landed in another state, or a malformed response — either way it
  // is a wrong answer, and charging $2,100 for a lunch delivery on the strength of it is worse
  // than charging the base fee.
  const silly = await dailyDeliveryFee(env, settings, { lat: 26.5, lng: -80.1 }, {
    fetchImpl: async () => new Response(JSON.stringify({ routes: [{ distanceMeters: 4828032 }] })),
  });
  assert.equal(silly.fee_cents, 500);
  assert.equal(silly.basis, 'base');
  assert.match(silly.reason, /outside the delivery area/i);

  // A real one still prices normally.
  const real = await dailyDeliveryFee(env, settings, { lat: 26.5, lng: -80.1 }, {
    fetchImpl: async () => new Response(JSON.stringify({ routes: [{ distanceMeters: 20921.472 }] })),   // 13 mi
  });
  assert.equal(real.fee_cents, 910);
  assert.equal(real.basis, 'mileage');
});

test('the public payload does not publish how many portions have been sold today', async (t) => {
  clock(t, et('09:00'));
  const env = makeEnv();
  stubFetch(t);
  await schedule(env, MON, 'daily_ropa', 10);
  await call(env, dailyBody());

  const d = await (await publicDailyGet({ env })).json();
  assert.equal(d.today.remaining, 9);
  // `allocation` beside `remaining` would make the subtraction an anonymously pollable count of
  // today's sales. No storefront surface uses it.
  assert.equal(d.today.allocation, undefined);
  assert.equal(d.today.sold, undefined);
  assert.equal(d.today.held, undefined);
});
