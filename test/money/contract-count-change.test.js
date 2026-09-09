// An office raises its lunch count after it already submitted one.
//
// Pompano submitted 23, the kitchen started prepping, then the office added two more. The order
// row, the invoice ledger and the SMS receipt all moved to 25 — which is why the invoice came out
// right — but the kitchen's per-bowl checklist did not, because it was materialized once at
// "start prep" and never revisited. The cooks built 23, the readiness gate was satisfied at 23,
// and the driver counted 23 at pickup. The office was billed for 25 and handed 23.
//
// These tests hold the whole chain to one number: the ledger the invoice reads, the checklist the
// kitchen builds from, the count the driver confirms, and the status that says whether the food is
// actually ready. They also pin the two cases where making the number match would mean destroying
// a record of something that physically happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCateringDB } from './catering-outbox-fixture.js';
import { ensureOrderBowls, reconcileOrderBowls } from '../../functions/_lib/orderbowls.js';
import { submitHeadcount } from '../../functions/_lib/contract.js';

const ORDER = 'octr_site_dgp_pompano_2026-09-09';
const LUNCH = 'Contract lunch';

function db() {
  const DB = makeCateringDB();
  DB.sqlite.exec(`
    CREATE TABLE orders (id TEXT PRIMARY KEY, items TEXT, delivery_date TEXT, delivery_window TEXT,
      subtotal_cents INTEGER, fee_cents INTEGER, total_estimate_cents INTEGER, status TEXT,
      customer_name TEXT, delivery_street TEXT, delivery_unit TEXT, delivery_city TEXT,
      delivery_state TEXT, delivery_zip TEXT, delivery_notes TEXT, delivery_lat REAL,
      delivery_lng REAL, fulfillment_mode TEXT, contract_site_id TEXT, headcount INTEGER,
      is_rush INTEGER, kitchen_cleared_at INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE order_bowls (id TEXT PRIMARY KEY, order_id TEXT, seq INTEGER, bowl_name TEXT,
      customization TEXT, prep_state TEXT, prep_by TEXT, prep_at INTEGER,
      driver_confirmed_by TEXT, driver_confirmed_at INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE UNIQUE INDEX idx_ob_seq ON order_bowls(order_id, seq);
    CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT, role TEXT, active INTEGER);`);
  return DB;
}

const order = (qty) => ({ id: ORDER, items: JSON.stringify([{ id: 'contract_lunch', name: LUNCH, qty }]) });
const bowls = (DB) => DB.sqlite.prepare('SELECT * FROM order_bowls WHERE order_id=? ORDER BY seq').all(ORDER);

// ---------------------------------------------------------------- the reported bug

test('real SQL: a count raised after prep started adds the bowls the office actually ordered', async () => {
  const DB = db();
  const env = { DB };

  // The cook taps "start prep" on 23.
  await ensureOrderBowls(env, order(23));
  assert.equal(bowls(DB).length, 23);

  // The office adds two more.
  const sync = await reconcileOrderBowls(env, order(25));

  assert.equal(sync.added, 2);
  assert.equal(sync.removed, 0);
  assert.equal(bowls(DB).length, 25, 'the kitchen builds 25, not the 23 it was first told');
  assert.deepEqual(bowls(DB).map((b) => b.seq), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.ok(bowls(DB).every((b) => b.bowl_name === LUNCH));
});

test('real SQL: bowls already checked off keep their prep state when the count goes up', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(23));
  // Twenty of the twenty-three are already built.
  DB.sqlite.exec("UPDATE order_bowls SET prep_state='done', prep_by='cook', prep_at=500 WHERE seq <= 20");

  await reconcileOrderBowls(env, order(25));

  const rows = bowls(DB);
  assert.equal(rows.length, 25);
  assert.equal(rows.filter((b) => b.prep_state === 'done').length, 20, 'finished work is never re-opened');
  assert.equal(rows.filter((b) => b.prep_state === 'pending').length, 5, '3 unbuilt + 2 new');
  assert.ok(rows.filter((b) => b.prep_state === 'done').every((b) => b.prep_by === 'cook'));
});

test('real SQL: reconciling twice is a no-op — no runaway bowls on a repeated submit', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(23));
  await reconcileOrderBowls(env, order(25));
  const second = await reconcileOrderBowls(env, order(25));
  assert.deepEqual([second.added, second.removed], [0, 0]);
  assert.equal(bowls(DB).length, 25);
});

// ---------------------------------------------------------------- the other direction

test('real SQL: a lowered count drops the surplus, newest bowls first', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(25));

  const sync = await reconcileOrderBowls(env, order(23));

  assert.equal(sync.removed, 2);
  assert.equal(bowls(DB).length, 23);
  assert.deepEqual(bowls(DB).map((b) => b.seq), Array.from({ length: 23 }, (_, i) => i + 1),
    'the two most recently added are the ones released');
});

test('real SQL: a bowl a cook already built is never deleted to make the number match', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(25));
  DB.sqlite.exec("UPDATE order_bowls SET prep_state='done' WHERE seq >= 24"); // the last two are built

  const sync = await reconcileOrderBowls(env, order(23));

  // The food exists. The checklist keeps saying so rather than quietly erasing it.
  assert.equal(sync.removed, 2, 'the surplus comes out of bowls nobody has touched');
  assert.equal(bowls(DB).length, 23);
  assert.equal(bowls(DB).filter((b) => b.prep_state === 'done').length, 2);
});

test('real SQL: a bowl the driver already counted at pickup is never deleted either', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(3));
  DB.sqlite.exec("UPDATE order_bowls SET driver_confirmed_by='drv', driver_confirmed_at=900");

  const sync = await reconcileOrderBowls(env, order(1));

  assert.equal(sync.removed, 0);
  assert.equal(bowls(DB).length, 3, 'three bowls left on the truck; the record says three');
});

// ---------------------------------------------------------------- guards

test('real SQL: an order the kitchen has not started gets no checklist from a count change', async () => {
  const DB = db();
  const sync = await reconcileOrderBowls({ DB }, order(25));
  assert.deepEqual([sync.added, sync.removed, sync.rows.length], [0, 0, 0],
    'the board shows the items breakdown until a cook taps start prep');
});

test('real SQL: a large office order materializes every bowl it ordered', async () => {
  const DB = db();
  await ensureOrderBowls({ DB }, order(120));
  assert.equal(bowls(DB).length, 120, 'a 120-lunch order is 120 bowls, not a clamped 50');
});

// ---------------------------------------------------------------- end to end, through the intake

function contractDB() {
  const DB = db();
  DB.sqlite.exec(`
    CREATE TABLE contract_sites (id TEXT PRIMARY KEY, account_id TEXT, name TEXT, street TEXT,
      unit TEXT, city TEXT, state TEXT, zip TEXT, delivery_days TEXT, window_label TEXT,
      delivery_window TEXT, price_per_lunch_cents INTEGER, delivery_fee_cents INTEGER,
      cutoff_time TEXT, rush_fee_cents INTEGER, active INTEGER, intake_token TEXT,
      contact_phone TEXT, delivery_lat REAL, delivery_lng REAL);
    CREATE TABLE contract_accounts (id TEXT PRIMARY KEY, name TEXT, status TEXT);
    CREATE TABLE contract_orders (id TEXT PRIMARY KEY, site_id TEXT, account_id TEXT,
      service_date TEXT, headcount INTEGER, item_name TEXT, price_per_lunch_cents INTEGER,
      delivery_fee_cents INTEGER, rush_fee_cents INTEGER, total_cents INTEGER, order_id TEXT,
      submitted_by TEXT, is_rush INTEGER, invoiced INTEGER, invoice_id TEXT, notes TEXT,
      created_at INTEGER, updated_at INTEGER, UNIQUE(site_id, service_date));
    CREATE TABLE contract_order_events (id TEXT PRIMARY KEY, site_id TEXT, account_id TEXT,
      service_date TEXT, order_id TEXT, event TEXT, headcount INTEGER, total_cents INTEGER,
      notes TEXT, submitted_by_name TEXT, submitted_by_phone TEXT, verified INTEGER,
      device_id TEXT, confirmation_no TEXT, ip TEXT, user_agent TEXT, created_at INTEGER);
    CREATE TABLE contract_menu (id TEXT PRIMARY KEY, account_id TEXT, rotation_week INTEGER,
      dow INTEGER, item_name TEXT, notes TEXT, created_at INTEGER);
    INSERT INTO contract_accounts VALUES ('acct_dgp','DGP Health & Wellness','active');
    INSERT INTO contract_sites (id,account_id,name,street,city,state,zip,delivery_days,
      delivery_window,price_per_lunch_cents,delivery_fee_cents,cutoff_time,rush_fee_cents,active,intake_token)
      VALUES ('site_dgp_pompano','acct_dgp','Pompano Beach','2100 Park Central Blvd N','Pompano Beach',
        'FL','33064','mon,tue,wed,thu,fri,sat,sun','lunch',600,2500,'09:00',1500,1,'tok_pompano');`);
  return DB;
}

// A Wednesday at 08:00 ET — a delivery day, before the 09:00 cutoff, so neither submit is a rush.
const WED_8AM_ET = Date.parse('2026-09-09T12:00:00Z');
const submit = (env, count) => submitHeadcount(env, {
  token: 'tok_pompano', count, nowMs: WED_8AM_ET, name: 'Office', verified: 1, sendReceipt: false,
});

test('real SQL: 23 then 25 — ledger, order, checklist and driver count all say 25', async () => {
  const DB = contractDB();
  const env = { DB };

  const first = await submit(env, 23);
  assert.equal(first.ok, true);

  // The kitchen starts prepping the 23.
  await ensureOrderBowls(env, DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));
  assert.equal(bowls(DB).length, 23);

  // The office adds two.
  const second = await submit(env, 25);
  assert.equal(second.ok, true);

  const row = DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER);
  const ledger = DB.sqlite.prepare('SELECT * FROM contract_orders WHERE site_id=?').get('site_dgp_pompano');

  assert.equal(ledger.headcount, 25, 'the invoice was always right');
  assert.equal(row.headcount, 25);
  assert.equal(JSON.parse(row.items)[0].qty, 25);
  assert.equal(bowls(DB).length, 25, 'and now so is the kitchen');
  assert.equal(ledger.total_cents, 25 * 600 + 2500, 'billed for exactly what the kitchen builds');
});

test('real SQL: raising the count un-readies an order the kitchen had already called ready', async () => {
  const DB = contractDB();
  const env = { DB };
  await submit(env, 23);
  await ensureOrderBowls(env, DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));
  DB.sqlite.exec("UPDATE order_bowls SET prep_state='done'");
  DB.sqlite.exec("UPDATE orders SET status='ready'");

  await submit(env, 25);

  assert.equal(DB.sqlite.prepare('SELECT status FROM orders WHERE id=?').get(ORDER).status, 'prep',
    'two bowls still to build means the order is not ready');
  const pending = DB.sqlite.prepare("SELECT COUNT(*) n FROM order_bowls WHERE prep_state='pending'").get().n;
  assert.equal(pending, 2);

  const alert = DB.sqlite.prepare("SELECT * FROM alerts WHERE alert_type='contract_count_changed'").get();
  assert.ok(alert, 'a cook who already finished the tray has to be told');
  assert.equal(alert.severity, 'warning');
  assert.equal(alert.ref_id, ORDER);
  assert.match(alert.body, /25 lunches \(\+2 lunches\)/);
  assert.match(alert.body, /almuerzos/, 'bilingual, like every other kitchen alert');
});

test('real SQL: a count raised after the order left the kitchen is critical and leaves status alone', async () => {
  const DB = contractDB();
  const env = { DB };
  await submit(env, 23);
  await ensureOrderBowls(env, DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));
  DB.sqlite.exec("UPDATE order_bowls SET prep_state='done'");
  DB.sqlite.exec("UPDATE orders SET status='ready', kitchen_cleared_at=999");

  await submit(env, 25);

  const row = DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER);
  assert.equal(row.status, 'ready', 'the handoff happened; the status records it rather than rewriting it');
  const alert = DB.sqlite.prepare("SELECT * FROM alerts WHERE alert_type='contract_count_changed'").get();
  assert.equal(alert.severity, 'critical', 'the office will be short unless a person acts');
  assert.match(alert.body, /already handed off|ya salió/);
});

test('real SQL: re-submitting the same count stays quiet, a further change speaks again', async () => {
  const DB = contractDB();
  const env = { DB };
  await submit(env, 23);
  await ensureOrderBowls(env, DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));

  await submit(env, 25);
  await submit(env, 25); // the office taps submit twice
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM alerts WHERE alert_type='contract_count_changed'").get().n, 1);

  await submit(env, 27);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM alerts WHERE alert_type='contract_count_changed'").get().n, 2);
  assert.equal(bowls(DB).length, 27);
});

test('real SQL: lowering the count does not raise the "build more" alert', async () => {
  const DB = contractDB();
  const env = { DB };
  await submit(env, 25);
  await ensureOrderBowls(env, DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));

  await submit(env, 23);

  assert.equal(bowls(DB).length, 23);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) n FROM alerts WHERE alert_type='contract_count_changed'").get().n, 0);
});

test('real SQL: an order with unreadable items never has its checklist wiped', async () => {
  const DB = db();
  const env = { DB };
  await ensureOrderBowls(env, order(25));
  DB.sqlite.exec("UPDATE order_bowls SET prep_state='done' WHERE seq <= 10");

  // Whatever went wrong upstream, "this order owes nothing" is not a safe reading of it.
  for (const broken of ['', 'not json', '[]', null]) {
    const sync = await reconcileOrderBowls(env, { id: ORDER, items: broken });
    assert.deepEqual([sync.added, sync.removed], [0, 0], `items=${JSON.stringify(broken)}`);
    assert.equal(bowls(DB).length, 25);
  }
  assert.equal(bowls(DB).filter((b) => b.prep_state === 'done').length, 10);
});

test('real SQL: a large first materialization batches and still lands every bowl exactly once', async () => {
  const DB = db();
  await ensureOrderBowls({ DB }, order(213));
  const rows = bowls(DB);
  assert.equal(rows.length, 213);
  assert.equal(new Set(rows.map((b) => b.seq)).size, 213, 'seq is unique across chunk boundaries');
  assert.deepEqual([rows[0].seq, rows[212].seq], [1, 213]);
});
