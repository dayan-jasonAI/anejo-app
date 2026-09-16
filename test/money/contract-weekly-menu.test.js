// The weekly office menu: the owner sets it, orders and invoices follow it, offices never see a price.
//
// Driven through the real handlers on a real SQLite database with every migration applied (0111
// included), for the reason contracts.js records about its roster ops: a source match proves code is
// PRESENT, never that a request can REACH it.
//
// Every dish and price below is an obvious fixture. The real menu is the owner's to write.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/contracts.js';
import {
  submitHeadcount, ownerSetHeadcount, generateInvoice, siteContext, menuForDate,
  rotationWeekFor, isIsoMonday, mondayOf,
} from '../../functions/_lib/contract.js';

// 2026-09-14 is a Monday. America/New_York is UTC-4 in September, so 12:00Z is 08:00 ET: a delivery
// morning, before the 09:00 soft cutoff (no rush) and the 10:45 hard cutoff.
const MON_0921_8AM = Date.parse('2026-09-21T12:00:00Z');
const MON_0921_830 = Date.parse('2026-09-21T12:30:00Z');
const TUE_0922_8AM = Date.parse('2026-09-22T12:00:00Z');
const MON_0928_8AM = Date.parse('2026-09-28T12:00:00Z');

function seed(env) {
  const t = Date.now();
  const db = env.DB.sqlite;
  db.prepare("INSERT INTO contract_accounts (id, name, status, created_at, updated_at) VALUES ('acct_t','Testco Clinics','active',?,?)").run(t, t);
  const site = db.prepare(
    `INSERT INTO contract_sites (id, account_id, name, street, city, state, zip, delivery_days, delivery_window,
       price_per_lunch_cents, delivery_fee_cents, cutoff_time, rush_fee_cents, intake_token, active, created_at, updated_at)
     VALUES (?, 'acct_t', ?, '1 Test St', 'Testville', 'FL', '00000', ?, 'lunch', ?, ?, '09:00', 1500, ?, 1, ?, ?)`
  );
  site.run('site_a', 'Site A', 'mon,tue,wed,thu,fri,sat,sun', 600, 2500, 'tok_a', t, t);
  site.run('site_b', 'Site B', 'mon,wed', 700, 2000, 'tok_b', t, t);
  return env;
}

async function call(env, body, cookie = OWNER_COOKIE) {
  const request = new Request('https://anejo.test/api/hub/owner/contracts', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await onRequestPost({ request, env });
  return { status: res.status, body: await res.json() };
}

const saveMenu = (env, weeks, rows, extra = {}) => call(env, { op: 'menu_save', account_id: 'acct_t', weeks, rows, ...extra });
const submit = (env, token, count, nowMs) => submitHeadcount(env, { token, count, nowMs, name: 'Office', verified: 1, sendReceipt: false });
const ledger = (env, site, date) => env.DB.one('SELECT * FROM contract_orders WHERE site_id = ? AND service_date = ?', site, date);
const menuRows = (env) => env.DB.rows("SELECT * FROM contract_menu WHERE account_id = 'acct_t' ORDER BY rotation_week, dow");
const termsEvents = (env) => env.DB.rows("SELECT * FROM contract_terms_events WHERE account_id = 'acct_t' ORDER BY created_at, event");

// ---------------------------------------------------------------- the Monday rotation

test('the rotation flips on MONDAY: a Sunday and the next Monday are different weeks', () => {
  assert.equal(rotationWeekFor('2026-09-20', '2026-09-14', 2), 1, 'Sunday is still week 1');
  assert.equal(rotationWeekFor('2026-09-21', '2026-09-14', 2), 2, 'Monday starts week 2');
  assert.equal(rotationWeekFor('2026-09-28', '2026-09-14', 2), 1, 'and the rotation wraps');
});

test('a Thursday does NOT flip the week (the old epoch count did)', () => {
  assert.equal(rotationWeekFor('2026-09-16', '2026-09-14', 2), rotationWeekFor('2026-09-17', '2026-09-14', 2), 'Wed and Thu share a week');
  assert.equal(rotationWeekFor('2026-09-23', '2026-09-14', 2), rotationWeekFor('2026-09-24', '2026-09-14', 2));
});

test('dates before the anchor are week 1, and the date helpers are strict', () => {
  assert.equal(rotationWeekFor('2026-08-31', '2026-09-14', 4), 1);
  assert.equal(isIsoMonday('2026-09-14'), true);
  assert.equal(isIsoMonday('2026-09-15'), false, 'a Tuesday');
  assert.equal(isIsoMonday('2026-02-30'), false, 'not a date');
  assert.equal(isIsoMonday('14/09/2026'), false);
  assert.equal(mondayOf('2026-09-20'), '2026-09-14', 'a Sunday belongs to the week that began the Monday before');
});

test('a saved rotation resolves each date to its own week’s dish', async () => {
  const env = seed(ownerEnv());
  const r = await saveMenu(env, 2, [
    { rotation_week: 1, dow: 1, item_name: 'Test dish A' },
    { rotation_week: 2, dow: 1, item_name: 'Test dish B' },
    { rotation_week: 1, dow: 4, item_name: 'Test dish T1' },
    { rotation_week: 2, dow: 4, item_name: 'Test dish T2' },
    { rotation_week: 1, dow: 7, item_name: 'Test dish S1' },
  ], { rotation_start_date: '2026-09-14' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const dish = async (date) => ((await menuForDate(env, 'acct_t', date)).row || {}).item_name || null;
  assert.equal(await dish('2026-09-17'), 'Test dish T1', 'Thursday of week 1');
  assert.equal(await dish('2026-09-20'), 'Test dish S1', 'Sunday is still week 1');
  assert.equal(await dish('2026-09-21'), 'Test dish B', 'Monday is week 2');
  assert.equal(await dish('2026-09-24'), 'Test dish T2', 'Thursday stays in the week its Monday started');
  assert.equal(await dish('2026-09-22'), null, 'no dish set for that day');
});

// ---------------------------------------------------------------- save + audit

test('menu_save writes the menu, anchors the rotation and records who changed what', async () => {
  const env = seed(ownerEnv());
  const r = await saveMenu(env, 2, [
    { rotation_week: 1, dow: 1, item_name: 'Test dish A', item_name_es: 'Plato de prueba A', notes: 'Test note' },
    { rotation_week: 2, dow: 1, item_name: 'Test dish B', price_per_lunch_cents: 750 },
  ], { rotation_start_date: '2026-09-14', note: 'test save' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.saved, true);
  assert.equal(r.body.slots_changed, 2);
  assert.equal(r.body.prices_changed, 1);

  const rows = menuRows(env);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].item_name_es, 'Plato de prueba A');
  assert.equal(rows[0].price_per_lunch_cents, null, 'no price typed = the location price applies');
  assert.equal(rows[1].price_per_lunch_cents, 750);
  assert.equal(rows[1].updated_by, 'owner@test.example');
  const acct = env.DB.one("SELECT rotation_weeks, rotation_start_date FROM contract_accounts WHERE id = 'acct_t'");
  assert.deepEqual({ ...acct }, { rotation_weeks: 2, rotation_start_date: '2026-09-14' });

  const ev = termsEvents(env);
  assert.deepEqual(ev.map((e) => e.event).sort(), ['menu_price_changed', 'menu_updated']);
  for (const e of ev) assert.equal(e.changed_by, 'owner@test.example');
  const upd = ev.find((e) => e.event === 'menu_updated');
  const after = JSON.parse(upd.after_json);
  assert.equal(after.slots['W1 Mon'].item_name, 'Test dish A');
  assert.equal(after.rotation_weeks, 2);
  assert.equal(upd.note, 'test save');
  const price = ev.find((e) => e.event === 'menu_price_changed');
  assert.deepEqual(JSON.parse(price.before_json), { 'W2 Mon': null });
  assert.deepEqual(JSON.parse(price.after_json), { 'W2 Mon': 750 });

  // Saving the same menu again changes nothing and so records nothing.
  const again = await saveMenu(env, 2, [
    { rotation_week: 1, dow: 1, item_name: 'Test dish A', item_name_es: 'Plato de prueba A', notes: 'Test note' },
    { rotation_week: 2, dow: 1, item_name: 'Test dish B', price_per_lunch_cents: 750 },
  ], { rotation_start_date: '2026-09-14' });
  assert.equal(again.body.slots_changed, 0);
  assert.equal(termsEvents(env).length, 2, 'no history row for a save that changed nothing');

  // Clearing the priced dish is a price change back to the location's price.
  const cleared = await saveMenu(env, 2, [
    { rotation_week: 1, dow: 1, item_name: 'Test dish A', item_name_es: 'Plato de prueba A', notes: 'Test note' },
  ], { rotation_start_date: '2026-09-14' });
  assert.equal(cleared.body.prices_changed, 1);
  const last = termsEvents(env).filter((e) => e.event === 'menu_price_changed').pop();
  assert.deepEqual(JSON.parse(last.after_json), { 'W2 Mon': null });
});

test('with no start date, the first save anchors week 1 to this week’s Monday (ET)', async () => {
  const env = seed(ownerEnv());
  const r = await saveMenu(env, 1, [{ rotation_week: 1, dow: 1, item_name: 'Test dish A' }]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const start = env.DB.one("SELECT rotation_start_date FROM contract_accounts WHERE id = 'acct_t'").rotation_start_date;
  assert.equal(isIsoMonday(start), true);
  assert.equal(start, r.body.this_monday);
  assert.equal(r.body.this_week, 1);

  // A later save that sends no date keeps the anchor rather than moving it.
  await saveMenu(env, 2, [{ rotation_week: 2, dow: 1, item_name: 'Test dish B' }]);
  assert.equal(env.DB.one("SELECT rotation_start_date FROM contract_accounts WHERE id = 'acct_t'").rotation_start_date, start);
});

test('validation: bad input is refused with a reason and nothing is written', async () => {
  const long = 'x'.repeat(81);
  const cases = [
    [{ weeks: 0, rows: [] }, /between 1 and 8/],
    [{ weeks: 9, rows: [] }, /between 1 and 8/],
    [{ weeks: 2.5, rows: [] }, /between 1 and 8/],
    [{ weeks: 1, rows: [], rotation_start_date: '2026-09-15' }, /Monday/],
    [{ weeks: 1, rows: 'nope' }, /Missing the menu rows/],
    [{ weeks: 2, rows: [{ rotation_week: 3, dow: 1, item_name: 'Test dish A' }] }, /week must be between 1 and 2/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 8, item_name: 'Test dish A' }] }, /day must be 1 \(Monday\) to 7/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 0, item_name: 'Test dish A' }] }, /day must be 1 \(Monday\) to 7/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: long }] }, /dish name is over 80/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', item_name_es: long }] }, /Spanish name is over 80/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', notes: 'n'.repeat(201) }] }, /notes are over 200/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 0 }] }, /less than/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 200000 }] }, /looks wrong/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 'abc' }] }, /must be a number/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: '', notes: 'Test note' }] }, /give the dish a name/],
    [{ weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A' }, { rotation_week: 1, dow: 1, item_name: 'Test dish B' }] }, /twice/],
  ];
  for (const [body, re] of cases) {
    const env = seed(ownerEnv());
    const r = await call(env, { op: 'menu_save', account_id: 'acct_t', ...body });
    assert.equal(r.status, 400, `${JSON.stringify(body).slice(0, 80)} should be refused`);
    assert.match(r.body.error, re);
    assert.equal(menuRows(env).length, 0, 'nothing written');
    assert.equal(env.DB.one("SELECT rotation_weeks FROM contract_accounts WHERE id = 'acct_t'").rotation_weeks, null);
    assert.equal(termsEvents(env).length, 0, 'no history for a refused save');
  }
});

test('the menu is owner-only', async () => {
  const env = seed(ownerEnv());
  const r = await call(env, { op: 'menu_save', account_id: 'acct_t', weeks: 1, rows: [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 900 }] }, 'anejo_sess=tok-kitchen');
  assert.ok(r.status === 401 || r.status === 403, `kitchen must be refused, got ${r.status}`);
  assert.equal(menuRows(env).length, 0);
  const g = await call(env, { op: 'menu_get', account_id: 'acct_t' }, 'anejo_sess=tok-kitchen');
  assert.ok(g.status === 401 || g.status === 403);
});

// ---------------------------------------------------------------- prices follow the menu

test('a dish price overrides the location price in BOTH head-count paths, NULL keeps it, and the invoice follows', async () => {
  const env = seed(ownerEnv());
  const saved = await saveMenu(env, 1, [
    { rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 850 },
    { rotation_week: 1, dow: 2, item_name: 'Test dish B' },
  ], { rotation_start_date: '2026-09-14' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  // The office's own submit, Monday: the dish price.
  const mon = await submit(env, 'tok_a', 10, MON_0921_8AM);
  assert.equal(mon.ok, true, JSON.stringify(mon));
  let row = ledger(env, 'site_a', '2026-09-21');
  assert.equal(row.price_per_lunch_cents, 850);
  assert.equal(row.item_name, 'Test dish A');
  assert.equal(row.total_cents, 10 * 850 + 2500);
  const order = env.DB.one("SELECT * FROM orders WHERE id = 'octr_site_a_2026-09-21'");
  assert.equal(order.subtotal_cents, 8500);
  assert.equal(JSON.parse(order.items)[0].name, 'Test dish A', 'the kitchen order carries the dish');

  // The owner's override, same Monday, the other location: the same dish price.
  const ov = await ownerSetHeadcount(env, { site_id: 'site_b', service_date: '2026-09-21', headcount: 4, reason: 'test', by: 'Owner', nowMs: MON_0921_8AM });
  assert.equal(ov.ok, true, JSON.stringify(ov));
  row = ledger(env, 'site_b', '2026-09-21');
  assert.equal(row.price_per_lunch_cents, 850, 'the override prices the day exactly as the submit does');
  assert.equal(row.total_cents, 4 * 850 + 2000);

  // Tuesday's dish has no price: each location's own price, in both paths.
  await submit(env, 'tok_a', 5, TUE_0922_8AM);
  assert.equal(ledger(env, 'site_a', '2026-09-22').price_per_lunch_cents, 600);
  assert.equal(ledger(env, 'site_a', '2026-09-22').item_name, 'Test dish B');
  await ownerSetHeadcount(env, { site_id: 'site_b', service_date: '2026-09-22', headcount: 3, reason: 'test', by: 'Owner', nowMs: TUE_0922_8AM });
  assert.equal(ledger(env, 'site_b', '2026-09-22').price_per_lunch_cents, 700);

  const inv = await generateInvoice(env, { accountId: 'acct_t', from: '2026-09-21', to: '2026-09-22' });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  assert.equal(inv.subtotal_cents, 10 * 850 + 4 * 850 + 5 * 600 + 3 * 700);
  assert.equal(inv.delivery_cents, 2500 + 2500, 'delivery still billed once per day');
  assert.equal(inv.total_cents, inv.subtotal_cents + inv.delivery_cents);
});

test('a re-submitted count keeps the price it was quoted; the new dish price starts with the next day', async () => {
  const env = seed(ownerEnv());
  await saveMenu(env, 1, [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 850 }], { rotation_start_date: '2026-09-14' });
  await submit(env, 'tok_a', 10, MON_0921_8AM);

  await saveMenu(env, 1, [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 900 }], { rotation_start_date: '2026-09-14' });
  const again = await submit(env, 'tok_a', 12, MON_0921_830);
  assert.equal(again.ok, true, JSON.stringify(again));
  const row = ledger(env, 'site_a', '2026-09-21');
  assert.equal(row.headcount, 12);
  assert.equal(row.price_per_lunch_cents, 850, 'already counted = already quoted');
  assert.equal(row.total_cents, 12 * 850 + 2500, 'and the total agrees with the snapshot the invoice reads');
  assert.equal(env.DB.one("SELECT total_estimate_cents FROM orders WHERE id = 'octr_site_a_2026-09-21'").total_estimate_cents, 12 * 850 + 2500);

  await submit(env, 'tok_a', 10, MON_0928_8AM);
  assert.equal(ledger(env, 'site_a', '2026-09-28').price_per_lunch_cents, 900);
});

test('with no menu at all, nothing about today’s pricing or naming changes', async () => {
  const env = seed(ownerEnv());
  await submit(env, 'tok_a', 10, MON_0921_8AM);
  const row = ledger(env, 'site_a', '2026-09-21');
  assert.equal(row.price_per_lunch_cents, 600);
  assert.equal(row.item_name, 'Testco Lunch — Mon');
  assert.equal(row.total_cents, 6000 + 2500);
});

// ---------------------------------------------------------------- offices never see a price

test('office-facing responses carry the dish name and no price', async () => {
  const env = seed(ownerEnv());
  await saveMenu(env, 1, [{ rotation_week: 1, dow: 1, item_name: 'Test dish A', item_name_es: 'Plato de prueba A', price_per_lunch_cents: 850 }], { rotation_start_date: '2026-09-14' });

  const ctx = await siteContext(env, 'tok_a', MON_0921_8AM);
  assert.equal(ctx.ok, true);
  assert.deepEqual(ctx.today_dish, { name: 'Test dish A', name_es: 'Plato de prueba A' });
  const ctxJson = JSON.stringify(ctx);
  assert.ok(!/price|_cents|850/.test(ctxJson), `no price in the office context: ${ctxJson}`);

  const res = await submit(env, 'tok_a', 10, MON_0921_8AM);
  assert.equal(res.ok, true);
  const resJson = JSON.stringify(res);
  assert.ok(!/price|_cents|850|8500/.test(resJson), `no price in the submit response: ${resJson}`);

  const tue = await siteContext(env, 'tok_a', TUE_0922_8AM);
  assert.equal(tue.today_dish, null, 'no dish set → no placeholder name either');
});

// ---------------------------------------------------------------- the owner's two-week preview

test('menu_get previews the next two weeks per location: dish, price that applies, kitchen closures', async () => {
  // Monday 5 October 2026, 08:00 ET — a week before Columbus Day (observed Monday 12 October).
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T12:00:00Z') });
  try {
    const env = seed(ownerEnv());
    const hol = await call(env, { op: 'save_holidays', kitchen_closed: ['columbus_day'] });
    assert.equal(hol.status, 200, JSON.stringify(hol.body));
    const s = await saveMenu(env, 2, [
      { rotation_week: 1, dow: 1, item_name: 'Test dish A', price_per_lunch_cents: 850 },
      { rotation_week: 2, dow: 1, item_name: 'Test dish B' },
    ]);
    assert.equal(s.status, 200, JSON.stringify(s.body));

    const r = await call(env, { op: 'menu_get', account_id: 'acct_t' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const m = r.body;
    assert.equal(m.today, '2026-10-05');
    assert.equal(m.rotation_start_date, '2026-10-05', 'anchored on the first save');
    assert.equal(m.this_week, 1);
    assert.equal(m.next_week, 2);
    assert.deepEqual(m.dows, [1, 2, 3, 4, 5, 6, 7], 'every weekday some location receives lunch');
    assert.equal(m.rows.length, 2);

    const a = m.preview.find((p) => p.site_id === 'site_a');
    const b = m.preview.find((p) => p.site_id === 'site_b');
    assert.equal(a.days.length, 14, 'Site A delivers every day');
    assert.deepEqual(b.days.map((d) => d.date), ['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14'], 'Site B only on its own days');

    const mon1 = a.days.find((d) => d.date === '2026-10-05');
    assert.deepEqual([mon1.dish, mon1.price_per_lunch_cents, mon1.price_source, mon1.week, mon1.kitchen_closed], ['Test dish A', 850, 'menu', 1, null]);
    const tue1 = a.days.find((d) => d.date === '2026-10-06');
    assert.deepEqual([tue1.dish_set, tue1.price_per_lunch_cents, tue1.price_source], [false, 600, 'site']);
    const mon2 = b.days.find((d) => d.date === '2026-10-12');
    assert.deepEqual([mon2.dish, mon2.price_per_lunch_cents, mon2.price_source, mon2.week], ['Test dish B', 700, 'site', 2]);
    assert.equal(mon2.kitchen_closed, 'Columbus Day');
  } finally {
    mock.timers.reset();
  }
});
