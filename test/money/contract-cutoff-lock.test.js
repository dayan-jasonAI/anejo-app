// The lunch count stops moving at 10:45 AM ET.
//
// Until now the only cutoff was site.cutoff_time (09:00), and it was a PRICING rule: submit after
// it and the count still went through, it just carried a rush fee. So an office could raise its
// count at any hour of the day — including after the truck had left — and the first anybody knew
// was a short delivery. Reconciling the kitchen's checklist (see contract-count-change.test.js)
// makes a late change land everywhere instead of only on the invoice; it does not make a change
// at 11:20 physically possible. This does the other half: after 10:45 the number is what the
// kitchen is building, and the intake page cannot move it.
//
// Two things it must not become. It must not silently swallow the request — the office wanted two
// more lunches and somebody on our side has to know that in time to say yes on the phone. And it
// must not bind the owner: ownerSetHeadcount is the human override and answers to nothing here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCateringDB } from './catering-outbox-fixture.js';
import { ensureOrderBowls } from '../../functions/_lib/orderbowls.js';
import {
  submitHeadcount, processIntake, siteContext, ownerSetHeadcount, HARD_CUTOFF_TIME,
} from '../../functions/_lib/contract.js';

const SITE = 'site_dgp_pompano';
const ORDER = `octr_${SITE}_2026-09-09`;
const INTAKE = readFileSync(new URL('../../public/lunch-count.html', import.meta.url), 'utf8');

// 2026-09-09 is a Wednesday; September is EDT, so ET = UTC-4.
const WED_8AM = Date.parse('2026-09-09T12:00:00Z');   // well before every cutoff
const WED_1044 = Date.parse('2026-09-09T14:44:00Z');  // the last minute that still counts
const WED_1045 = Date.parse('2026-09-09T14:45:00Z');  // the cutoff itself
const WED_1120 = Date.parse('2026-09-09T15:20:00Z');  // the truck is loading
const SUNDAY_1120 = Date.parse('2026-09-13T15:20:00Z'); // not a delivery day for this site

function db({ deliveryDays = 'mon,tue,wed' } = {}) {
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
    CREATE TABLE staff (id TEXT PRIMARY KEY, name TEXT, role TEXT, active INTEGER);
    CREATE TABLE contract_sites (id TEXT PRIMARY KEY, account_id TEXT, name TEXT, street TEXT,
      unit TEXT, city TEXT, state TEXT, zip TEXT, delivery_days TEXT, window_label TEXT,
      delivery_window TEXT, price_per_lunch_cents INTEGER, delivery_fee_cents INTEGER,
      cutoff_time TEXT, rush_fee_cents INTEGER, active INTEGER, intake_token TEXT,
      contact_name TEXT, contact_phone TEXT, delivery_lat REAL, delivery_lng REAL,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE contract_site_staff (id TEXT PRIMARY KEY, site_id TEXT, account_id TEXT,
      name TEXT, phone TEXT, added_by TEXT, active INTEGER, is_primary INTEGER,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE contract_intake_devices (id TEXT PRIMARY KEY, site_id TEXT, token TEXT,
      contact_name TEXT, phone TEXT, revoked INTEGER, last_used_at INTEGER, created_at INTEGER);
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
    CREATE TABLE sms_log (id TEXT PRIMARY KEY, direction TEXT, channel TEXT, to_number TEXT,
      from_number TEXT, body TEXT, thread_id TEXT, status TEXT, provider_sid TEXT, error TEXT,
      created_at INTEGER);
    INSERT INTO contract_accounts VALUES ('acct_dgp','DGP Health & Wellness','active');
    INSERT INTO contract_sites (id,account_id,name,street,city,state,zip,delivery_days,
      delivery_window,price_per_lunch_cents,delivery_fee_cents,cutoff_time,rush_fee_cents,active,
      intake_token,contact_name,contact_phone)
      VALUES ('${SITE}','acct_dgp','Pompano Beach','2100 Park Central Blvd N','Pompano Beach',
        'FL','33064','${deliveryDays}','lunch',600,2500,'09:00',1500,1,'tok_pompano',
        'Liuvys','+15615550100');`);
  return DB;
}

// A KV stand-in, so "was a verification code issued?" is an assertion and not a guess.
function kv() {
  const store = new Map();
  return { store, get: async (k) => store.get(k) || null, put: async (k, v) => { store.set(k, v); } };
}

const env = (DB, SESSIONS) => (SESSIONS ? { DB, SESSIONS } : { DB });
const submit = (e, count, nowMs) => submitHeadcount(e, {
  token: 'tok_pompano', count, nowMs, name: 'Office', verified: 1, sendReceipt: false,
});
const ledger = (DB) => DB.sqlite.prepare('SELECT * FROM contract_orders WHERE site_id=?').get(SITE);
const events = (DB) => DB.sqlite.prepare('SELECT * FROM contract_order_events ORDER BY created_at, id').all();
const alerts = (DB) => DB.sqlite.prepare("SELECT * FROM alerts WHERE alert_type='contract_count_locked'").all();

// ---------------------------------------------------------------- the boundary

test('10:44 still counts and 10:45 does not — the cutoff is the minute it says it is', async () => {
  const early = env(db());
  const onTime = await submit(early, 23, WED_1044);
  assert.equal(onTime.ok, true, '10:44 ET is still inside the window');
  assert.equal(ledger(early.DB).headcount, 23);

  const late = env(db());
  const refused = await submit(late, 23, WED_1045);
  assert.equal(refused.ok, false);
  assert.equal(refused.locked, true);
  assert.equal(refused.hard_cutoff, '10:45');
  assert.equal(ledger(late.DB), undefined, 'a refused count writes no ledger row');
});

test('the cutoff is 10:45 ET, not 10:45 UTC', async () => {
  // 14:45 UTC is 10:45 in Pompano and locked; 10:45 UTC is 06:45 there and wide open.
  const e = env(db());
  assert.equal((await submit(e, 20, Date.parse('2026-09-09T10:45:00Z'))).ok, true);
  assert.equal((await submit(e, 21, Date.parse('2026-09-09T14:45:00Z'))).ok, false);
  assert.equal(ledger(e.DB).headcount, 20, 'the late one did not overwrite the count on file');
});

test('HARD_CUTOFF_TIME is the single published number', () => {
  assert.equal(HARD_CUTOFF_TIME, '10:45');
});

// ------------------------------------------------- nothing downstream moves after the cutoff

test('a late change leaves the ledger, the order row AND the kitchen checklist untouched', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  // The cook starts prepping the 23.
  await ensureOrderBowls(e, e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));

  const before = e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER);
  const r = await submit(e, 25, WED_1120);

  assert.equal(r.ok, false);
  assert.equal(r.locked, true);
  assert.equal(ledger(e.DB).headcount, 23, 'the invoice is not quietly moved either');
  const after = e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER);
  assert.equal(after.headcount, 23);
  assert.equal(JSON.parse(after.items)[0].qty, 23);
  assert.equal(after.updated_at, before.updated_at, 'the order row was not rewritten at all');
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM order_bowls WHERE order_id=?').get(ORDER).n, 23);
});

test('the refusal tells the office what it IS getting, not just that it failed', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  const r = await submit(e, 25, WED_1120);

  assert.equal(r.count, 23, 'the count on file, so the page can show it');
  assert.equal(r.requested, 25);
  assert.match(r.error, /10:45/);
  assert.match(r.error, /call/i, 'a refusal with no way forward is a dead end');
});

test('a site with nothing on file gets a refusal that says so rather than a count of null', async () => {
  const e = env(db());
  const r = await submit(e, 25, WED_1120);
  assert.equal(r.ok, false);
  assert.equal(r.locked, true);
  assert.equal(r.count, null);
  assert.equal(r.requested, 25);
});

// ---------------------------------------------------------------- the request still reaches us

test('a refused attempt is written to the append-only audit trail with what they asked for', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  await submit(e, 25, WED_1120);

  const rows = events(e.DB);
  const locked = rows.filter((r) => r.event === 'locked_out');
  assert.equal(locked.length, 1);
  assert.equal(locked[0].site_id, SITE);
  assert.equal(locked[0].service_date, '2026-09-09');
  assert.equal(locked[0].headcount, 23, 'the audit row records the count that stands');
  assert.match(locked[0].notes, /Asked for 25/);
  assert.match(locked[0].notes, /on file: 23/);
  assert.ok(rows.some((r) => r.event === 'created'), 'the accepted submission is still on the trail');
});

test('a refused attempt alerts the kitchen as a warning when there is a count to stretch', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  await submit(e, 25, WED_1120);

  const a = alerts(e.DB);
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, 'warning');
  assert.equal(a[0].team, 'kitchen');
  assert.equal(a[0].ref_id, SITE);
  assert.match(a[0].body, /wanted 25/);
  assert.match(a[0].body, /building 23/);
  assert.match(a[0].body, /Quería 25/, 'the kitchen reads Spanish');
});

test('an office with NO count on file is critical — nothing is being made for them', async () => {
  const e = env(db());
  await submit(e, 25, WED_1120);

  const a = alerts(e.DB);
  assert.equal(a.length, 1);
  assert.equal(a[0].severity, 'critical');
  assert.match(a[0].body, /NO count on file/);
});

test('re-submitting the number we are already building is not a request — no alert', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  const r = await submit(e, 23, WED_1120);

  assert.equal(r.ok, false, 'still refused: the page must not claim it recorded anything');
  assert.equal(alerts(e.DB).length, 0, 'a reload is not an ask');
  assert.equal(events(e.DB).filter((x) => x.event === 'locked_out').length, 1, 'but it is still on the record');
});

test('four taps of the submit button are one problem, not four alerts', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  await submit(e, 25, WED_1120);
  await submit(e, 25, WED_1120);
  await submit(e, 26, WED_1120);
  await submit(e, 27, WED_1120);

  assert.equal(alerts(e.DB).length, 1, 'deduped per site per day');
  assert.equal(events(e.DB).filter((x) => x.event === 'locked_out').length, 4, 'every attempt is kept');
});

// ---------------------------------------------------------------- the paths around it

test('no verification code is texted for an order that cannot be placed', async () => {
  const SESSIONS = kv();
  const e = env(db(), SESSIONS);
  await submit(e, 23, WED_8AM);

  const r = await processIntake(e, { token: 'tok_pompano', count: 25, name: 'Cover', phone: '+15615550199', nowMs: WED_1120 });

  assert.equal(r.ok, false);
  assert.equal(r.locked, true);
  assert.equal(r.needs_verify, undefined, 'no challenge for something a correct answer cannot unlock');
  assert.equal(SESSIONS.store.size, 0, 'no OTP was minted');
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM sms_log').get().n, 0, 'no SMS was even attempted');
  assert.equal(events(e.DB).filter((x) => x.event === 'locked_out').length, 1, 'still audited from this path');
});

test('a day we do not deliver on is still answered as a delivery problem, not a cutoff one', async () => {
  const e = env(db());
  const r = await submit(e, 25, SUNDAY_1120);
  assert.equal(r.ok, false);
  assert.equal(r.locked, undefined);
  assert.match(r.error, /No delivery is scheduled/);
});

test('siteContext closes the form before anyone types into it', async () => {
  const DB = db();
  const openNow = await siteContext({ DB }, 'tok_pompano', WED_8AM);
  assert.equal(openNow.count_locked, false);
  assert.equal(openNow.hard_cutoff, '10:45');

  const closed = await siteContext({ DB }, 'tok_pompano', WED_1120);
  assert.equal(closed.count_locked, true);
  assert.equal(closed.hard_cutoff, '10:45');
});

test('the intake page renders a locked state with a phone number instead of a dead form', () => {
  assert.match(INTAKE, /ctx\.count_locked/, 'the page reads the lock');
  assert.match(INTAKE, /tel:5615671047/, 'and offers the one thing that still works');
  for (const k of ['lockedBan', 'lockedHave', 'lockedNone', 'lockedCall']) {
    assert.match(INTAKE, new RegExp(k + ':\\{en:.+es:'), `${k} must be written in both languages`);
  }
  assert.match(INTAKE, /d&&d\.locked/, 'a page open across the cutoff is switched over on submit');
});

// ---------------------------------------------------------------- the human override

test('the owner can still set a count after the cutoff — the lock binds the form, not a person', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);

  const r = await ownerSetHeadcount(e, {
    site_id: SITE, service_date: '2026-09-09', headcount: 25,
    reason: 'Liuvys called at 11:20, kitchen confirmed it can cover two more', by: 'Dayan', nowMs: WED_1120,
  });

  assert.equal(r.ok, true);
  assert.equal(ledger(e.DB).headcount, 25);
  assert.equal(e.DB.sqlite.prepare('SELECT headcount FROM orders WHERE id=?').get(ORDER).headcount, 25);
  assert.ok(events(e.DB).some((x) => x.event === 'owner_override'), 'and it says who decided');
});

test('the owner override carries the raise into the kitchen checklist too', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  await ensureOrderBowls(e, e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM order_bowls WHERE order_id=?').get(ORDER).n, 23);

  await ownerSetHeadcount(e, {
    site_id: SITE, service_date: '2026-09-09', headcount: 25,
    reason: 'phoned in', by: 'Dayan', nowMs: WED_1120,
  });
  // The order row moved; the checklist follows the same way it does for an in-window change.
  await ensureOrderBowls(e, e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM order_bowls WHERE order_id=?').get(ORDER).n, 25);
});

// ---------------------------------------------------------------- what must NOT have changed

test('an in-window raise still lands everywhere — the lock did not undo the reconcile', async () => {
  const e = env(db());
  await submit(e, 23, WED_8AM);
  await ensureOrderBowls(e, e.DB.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(ORDER));

  const r = await submit(e, 25, WED_1044);
  assert.equal(r.ok, true);
  assert.equal(ledger(e.DB).headcount, 25);
  assert.equal(e.DB.sqlite.prepare('SELECT COUNT(*) n FROM order_bowls WHERE order_id=?').get(ORDER).n, 25);
});

test('the receipt names the deadline that is actually enforced', async () => {
  const DB = db();
  DB.sqlite.exec("UPDATE contract_sites SET contact_phone='+15615550100'");
  const r = await submitHeadcount({ DB }, {
    token: 'tok_pompano', count: 23, nowMs: WED_8AM, name: 'Office', verified: 1, lang: 'en',
  });
  assert.equal(r.ok, true);
  const sms = DB.sqlite.prepare('SELECT body FROM sms_log ORDER BY created_at DESC').get();
  assert.match(sms.body, /10:45 AM at the latest/);

  const DB2 = db();
  await submitHeadcount({ DB: DB2 }, {
    token: 'tok_pompano', count: 23, nowMs: WED_8AM, name: 'Office', verified: 1, lang: 'es',
  });
  assert.match(DB2.sqlite.prepare('SELECT body FROM sms_log ORDER BY created_at DESC').get().body, /máximo 10:45 AM/);
});
