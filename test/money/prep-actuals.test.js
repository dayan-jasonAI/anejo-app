// Measured prep time (Dayan, 2026-09-16): "ask the kitchen staff to record these processes and
// over time we just adjust." Every prep estimate in production is a guess the owner typed once;
// these tests pin that the system now records what really happened — and that it refuses to
// record anything it cannot know, never changes an estimate by itself, and never gets in the way
// of marking food ready.
//
// Real endpoints against real SQLite with every migration applied (test/helpers/sqlite-d1.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { hashPin } from '../../functions/_lib/pin.js';
import { onRequestPost as kitchenPost } from '../../functions/api/hub/kitchen/orders.js';
import { onRequestGet as taskGet, onRequestPost as taskPost } from '../../functions/api/hub/kitchen/task.js';
import { onRequestGet as ownerMenuGet, onRequestPost as ownerMenuPost } from '../../functions/api/hub/owner/menu.js';
import { summarize, MIN_SAMPLES } from '../../functions/_lib/prep-actuals.js';

const PIN = '482913';
const KITCHEN = 'anejo_sess=tok-kitchen';
const JPEG = 'data:image/jpeg;base64,' + Buffer.from('synthetic jpeg bytes').toString('base64');
const T0 = Date.parse('2026-09-16T13:00:00Z');
const MIN = 60000;

function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, opts) { objects.set(key, { body, opts }); },
    async get(key) { const o = objects.get(key); return o ? { body: 'bytes', httpMetadata: o.opts && o.opts.httpMetadata } : null; },
  };
}

// One paid order on the board, plus a cook with a PIN. `items` is the order's real items JSON.
async function kitchen({ status = 'prep', startedAt = T0, items = [{ id: 'vida', name: 'VIDA', qty: 2 }], contractSiteId = null } = {}) {
  const env = ownerEnv({ MEDIA: bucket() });
  const db = env.DB.sqlite;
  db.prepare("UPDATE staff SET pin_hash = ?, pin_salt = 'salt-k' WHERE id = 'stf_k'").run(await hashPin(PIN, 'salt-k'));
  db.prepare(
    `INSERT INTO orders (id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, total_estimate_cents, status,
       customer_name, delivery_city, delivery_state, contract_site_id, prep_started_at, created_at, updated_at)
     VALUES ('ord_k1', ?, '2026-09-16', 'lunch', 1999, 0, 1999, ?, 'Synthetic customer', 'Palm Beach', 'FL', ?, ?, ?, ?)`
  ).run(JSON.stringify(items), status, contractSiteId, startedAt, T0, T0);
  return { env, db };
}

const post = (env, body, cookie = KITCHEN) => kitchenPost({ env, request: new Request('https://anejo.test/api/hub/kitchen/orders', {
  method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'ord_k1', ...body }),
}) });

// Both photos, then Mark ready — the real path an order takes to 'ready'.
async function markReady(env) {
  await post(env, { action: 'photo', kind: 'contents', data_url: JPEG });
  await post(env, { action: 'photo', kind: 'packed', data_url: JPEG });
  return post(env, { action: 'mark_ready', pin: PIN });
}

const task = (env, body) => taskPost({ env, request: new Request('https://anejo.test/api/hub/kitchen/task', {
  method: 'POST', headers: { Cookie: KITCHEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) });
const taskState = async (env) => (await taskGet({ env, request: new Request('https://anejo.test/api/hub/kitchen/task', { headers: { Cookie: KITCHEN } }) })).json();

const owner = (env, body) => ownerMenuPost({ env, request: new Request('https://anejo.test/api/hub/owner/menu', {
  method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) });
const ownerSnapshot = async (env) => (await ownerMenuGet({ env, request: new Request('https://anejo.test/api/hub/owner/menu', { headers: { Cookie: OWNER_COOKIE } }) })).json();

// The owner desk self-fetches /order and /api/menu to check the storefront. Offline in tests.
function offline(fn) {
  return async (...args) => {
    const real = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 404 });
    try { return await fn(...args); } finally { globalThis.fetch = real; }
  };
}

// Finished measurements written straight to the table — the shape the kitchen would have produced.
let seedSeq = 0;
function seedBatches(db, menuItemId, minutesList, { qty = 1, at = T0 } = {}) {
  for (const m of minutesList) {
    db.prepare(
      `INSERT INTO prep_actuals (id, kind, menu_item_id, qty, started_at, ended_at, minutes, staff_id, staff_name, created_at)
       VALUES (?, 'batch', ?, ?, ?, ?, ?, 'stf_k', 'Cook', ?)`
    ).run(`pra_seed_${++seedSeq}`, menuItemId, qty, at, at + m * MIN, m, at);
  }
}

test('marking an order ready records what it really took, its items and quantities, and the estimate that was showing', async () => {
  const { env, db } = await kitchen({ items: [{ id: 'vida', name: 'VIDA', qty: 2 }, { id: 'fuego', name: 'FUEGO', qty: 3 }] });
  db.prepare("UPDATE menu_items SET prep_minutes = 20 WHERE id = 'vida'").run();
  db.prepare("UPDATE menu_items SET prep_minutes = 45 WHERE id = 'fuego'").run();

  const res = await markReady(env);
  assert.equal(res.status, 200, await res.clone().text());

  const row = db.prepare("SELECT * FROM prep_actuals WHERE kind = 'order'").get();
  assert.ok(row, 'the order measured itself — no extra tap for the cook');
  assert.equal(row.order_id, 'ord_k1');
  assert.equal(row.started_at, T0, 'the start is orders.prep_started_at, not updated_at');
  assert.ok(row.ended_at >= T0);
  assert.equal(row.minutes, Math.round((row.ended_at - T0) / MIN));
  assert.equal(row.estimate_minutes, 45, 'the estimate the board showed: the LONGEST item, as kitchen-timing computes it');
  assert.equal(row.qty, 5, 'quantity is recorded faithfully — 2 + 3');
  assert.deepEqual(JSON.parse(row.items), [
    { id: 'vida', name: 'VIDA', qty: 2 },
    { id: 'fuego', name: 'FUEGO', qty: 3 },
  ]);
  assert.equal(row.staff_name, 'Cook', 'attributed to the cook who marked it ready');
  assert.equal(row.menu_item_id, null, 'a mixed order does not blame its minutes on one of its items');
});

test('an order of one dish is a measurement OF that dish; a contract order is never one', async () => {
  const single = await kitchen({ items: [{ id: 'vida', name: 'VIDA', qty: 5 }] });
  assert.equal((await markReady(single.env)).status, 200);
  assert.equal(single.db.prepare("SELECT menu_item_id FROM prep_actuals WHERE kind='order'").get().menu_item_id, 'vida');

  const office = await kitchen({ items: [{ id: 'contract_lunch', name: 'Office lunch', qty: 22 }], contractSiteId: 'site_1' });
  assert.equal((await markReady(office.env)).status, 200);
  const row = office.db.prepare("SELECT * FROM prep_actuals WHERE kind='order'").get();
  assert.equal(row.menu_item_id, null, 'the office lunch is not a menu item — its estimate is a setting');
  assert.equal(row.qty, 22);
});

test('an order with no known start records NOTHING — a made-up duration is worse than a missing one', async () => {
  const { env, db } = await kitchen({ startedAt: null });
  db.prepare("UPDATE orders SET prep_started_at = NULL WHERE id = 'ord_k1'").run();

  const res = await markReady(env);
  assert.equal(res.status, 200, 'the order is still ready');
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='ord_k1'").get().status, 'ready');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prep_actuals').get().n, 0);
});

test('the kitchen_audit prep_start row covers an order started before prep_started_at existed', async () => {
  const { env, db } = await kitchen({ startedAt: null });
  db.prepare("UPDATE orders SET prep_started_at = NULL WHERE id = 'ord_k1'").run();
  db.prepare(
    "INSERT INTO kitchen_audit (id, action, order_id, staff_id, staff_name, via_pin, created_at) VALUES ('kau_1','prep_start','ord_k1','stf_k','Cook',1,?)"
  ).run(T0);

  assert.equal((await markReady(env)).status, 200);
  assert.equal(db.prepare("SELECT started_at FROM prep_actuals WHERE kind='order'").get().started_at, T0);
});

test('marking ready still succeeds when the measurement cannot be recorded', async () => {
  const { env, db } = await kitchen();
  // The one table the recorder writes is gone. Everything it does is best-effort by design.
  db.exec('DROP TABLE prep_actuals');

  const res = await markReady(env);
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='ord_k1'").get().status, 'ready');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alerts").get().n, 1, 'the owner was still told');
});

test('a batch timer records its minutes and its quantity, and a second Start closes the first honestly', async () => {
  const { env, db } = await kitchen();

  let res = await task(env, { action: 'start', label: '60 lb pernil', qty: 60 });
  assert.equal(res.status, 200, await res.clone().text());
  const first = (await res.json()).running;
  assert.equal(first.label, '60 lb pernil');
  assert.equal(first.qty, 60);
  assert.equal(first.ended_at, null, 'it is running, not measured');
  assert.equal(first.staff_name, 'Cook', 'attributed to the signed-in cook — no PIN for a stopwatch');

  // Backdate the start so a real duration falls out of the clock rather than 0.
  db.prepare('UPDATE prep_actuals SET started_at = ? WHERE id = ?').run(Date.now() - 42 * MIN, first.id);

  // Starting something else closes the first one rather than dropping it.
  res = await task(env, { action: 'start', menu_item_id: 'vida', qty: 8 });
  assert.equal(res.status, 200, await res.clone().text());
  const closed = (await res.json()).closed_previous;
  assert.equal(closed.id, first.id);
  assert.equal(closed.minutes, 42);
  assert.match(String(closed.note), /starting another/);

  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM prep_actuals WHERE ended_at IS NULL").get().n, 1, 'one running clock, never two');

  const second = (await taskState(env)).running;
  assert.equal(second.menu_item_id, 'vida');
  assert.equal(second.qty, 8);
  db.prepare('UPDATE prep_actuals SET started_at = ? WHERE id = ?').run(Date.now() - 17 * MIN, second.id);

  res = await task(env, { action: 'stop' });
  assert.equal(res.status, 200);
  const done = (await res.json()).recorded;
  assert.equal(done.minutes, 17);
  assert.equal((await taskState(env)).running, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM prep_actuals WHERE kind='batch' AND ended_at IS NOT NULL").get().n, 2);
});

test('a quantity is required and a bad one is refused; Cancel throws the row away rather than measuring zero', async () => {
  const { env, db } = await kitchen();
  assert.equal((await task(env, { action: 'start', label: 'arroz' })).status, 400, 'how many is half the data');
  assert.equal((await task(env, { action: 'start', label: 'arroz', qty: 2.5 })).status, 400);
  assert.equal((await task(env, { action: 'start', qty: 4 })).status, 400, 'say what you are starting');
  assert.equal((await task(env, { action: 'start', menu_item_id: 'no_such_item', qty: 4 })).status, 404);
  assert.equal((await task(env, { action: 'stop' })).status, 409, 'nothing is running');

  assert.equal((await task(env, { action: 'start', label: 'arroz', qty: 4 })).status, 200);
  assert.equal((await task(env, { action: 'cancel' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM prep_actuals').get().n, 0, 'a zero-minute batch would poison the median for months');
});

test('the owner sees the MEDIAN and the sample count, and nothing at all below three samples', offline(async () => {
  const { env, db } = await kitchen();
  seedBatches(db, 'vida', [18, 34]);
  let items = (await ownerSnapshot(env)).items;
  let vida = items.find((i) => i.id === 'vida');
  assert.equal(vida.measured.count, 2);
  assert.equal(vida.measured.median_minutes, null, `below ${MIN_SAMPLES} samples there is no number to show`);

  // The third measurement. 18, 34, 90 → median 34, and the MEAN would be 47: one slow day must
  // not be what the owner is invited to adopt.
  seedBatches(db, 'vida', [90], { at: T0 + 60 * MIN });
  items = (await ownerSnapshot(env)).items;
  vida = items.find((i) => i.id === 'vida');
  assert.equal(vida.measured.count, 3);
  assert.equal(vida.measured.median_minutes, 34);
  assert.ok(vida.measured.last_at > T0);

  const untouched = items.find((i) => i.id !== 'vida');
  assert.deepEqual(untouched.measured, { count: 0, median_minutes: null, median_per_unit: null, last_at: null });
}));

test('"use this" writes the median into prep_minutes — and only the owner\'s tap ever does', offline(async () => {
  const { env, db } = await kitchen();
  db.prepare("UPDATE menu_items SET prep_minutes = 12 WHERE id = 'vida'").run();
  seedBatches(db, 'vida', [18, 34]);

  // Two samples: refused, and the estimate is untouched.
  let res = await owner(env, { op: 'adopt_prep_minutes', id: 'vida' });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /2 measurements/);
  assert.equal(db.prepare("SELECT prep_minutes FROM menu_items WHERE id = 'vida'").get().prep_minutes, 12);

  seedBatches(db, 'vida', [90], { at: T0 + 60 * MIN });
  // Recording alone never moves it — that is the whole rule.
  assert.equal(db.prepare("SELECT prep_minutes FROM menu_items WHERE id = 'vida'").get().prep_minutes, 12);

  res = await owner(env, { op: 'adopt_prep_minutes', id: 'vida' });
  assert.equal(res.status, 200, await res.clone().text());
  const body = await res.json();
  assert.equal(body.adopted.prep_minutes, 34);
  assert.equal(body.adopted.from, 12);
  assert.equal(body.adopted.samples, 3);
  assert.equal(db.prepare("SELECT prep_minutes FROM menu_items WHERE id = 'vida'").get().prep_minutes, 34);

  assert.equal((await owner(env, { op: 'adopt_prep_minutes', id: 'nope' })).status, 404);
}));

test('the owner view carries minutes per unit, the office lunch measurement and the batch log', offline(async () => {
  const { env, db } = await kitchen({ items: [{ id: 'contract_lunch', name: 'Office lunch', qty: 20 }], contractSiteId: 'site_1' });
  // Three office orders, each 20 lunches: 40, 60 and 50 minutes → median 50, 2.5 minutes a lunch.
  [[40, 20], [60, 20], [50, 20]].forEach(([m, q], i) => {
    db.prepare(
      `INSERT INTO prep_actuals (id, kind, order_id, qty, started_at, ended_at, minutes, created_at)
       VALUES (?, 'order', 'ord_k1', ?, ?, ?, ?, ?)`
    ).run(`pra_off_${i}`, q, T0, T0 + m * MIN, m, T0);
  });
  seedBatches(db, 'vida', [10, 12, 14], { qty: 20 });

  const snap = await ownerSnapshot(env);
  assert.equal(snap.prep_office.count, 3);
  assert.equal(snap.prep_office.median_minutes, 50);
  assert.equal(snap.prep_office.median_per_unit, 2.5, 'a rate, not a duration — 20 lunches in 50 minutes is not "2 minutes"');
  assert.equal(snap.prep_min_samples, MIN_SAMPLES);

  const vida = snap.items.find((i) => i.id === 'vida');
  assert.equal(vida.measured.median_minutes, 12);
  assert.equal(vida.measured.median_per_unit, 0.6, 'quantity is carried through so the data can answer the qty question later');

  assert.equal(snap.prep_log.length, 6);
  assert.ok(snap.prep_log.every((r) => r.ended_at), 'a running clock is not a measurement');
}));

test('summarize is the median, tolerates a zero quantity, and reports the latest measurement', () => {
  assert.deepEqual(summarize([]), { count: 0, median_minutes: null, median_per_unit: null, last_at: null });
  // Even count → the mean of the two middles, rounded to whole minutes.
  const even = summarize([10, 20, 30, 45].map((m, i) => ({ minutes: m, qty: 0, ended_at: T0 + i })));
  assert.equal(even.median_minutes, 25);
  assert.equal(even.median_per_unit, null, 'no quantity, no per-unit claim');
  assert.equal(even.last_at, T0 + 3);
});
