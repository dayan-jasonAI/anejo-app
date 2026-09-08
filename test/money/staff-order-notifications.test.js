// Synthetic-only integration tests: real SQL and real handlers, no credentials/providers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCateringDB } from './catering-outbox-fixture.js';
import { makeKV } from '../helpers/d1.js';
import { onRequestPost as square } from '../../functions/api/webhooks/square.js';
import { onRequestPost as manualOrder } from '../../functions/api/hub/owner/orders.js';
import { createHubPushMessage } from '../../functions/_lib/push-message.js';

function fixture() {
  const DB = makeCateringDB();
  DB.sqlite.exec(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, square_order_id TEXT, payment_link_id TEXT, items TEXT,
    delivery_date TEXT, delivery_window TEXT, subtotal_cents INTEGER, fee_cents INTEGER,
    tax_pct REAL, total_estimate_cents INTEGER, status TEXT, customer_name TEXT,
    customer_email TEXT, customer_phone TEXT, sms_consent INTEGER, redeem_points INTEGER,
    promo_code TEXT, promo_points_mult INTEGER, tip_cents INTEGER,
    delivery_street TEXT, delivery_unit TEXT, delivery_city TEXT, delivery_state TEXT,
    delivery_zip TEXT, delivery_notes TEXT, delivery_lat REAL, delivery_lng REAL,
    geocoded_at INTEGER, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE staff (id TEXT PRIMARY KEY,active INTEGER);
    INSERT INTO staff VALUES ('owner_test',1);
    CREATE TABLE subscriptions (id TEXT PRIMARY KEY,client_id TEXT,plan_id TEXT,trainer_id TEXT,
      weekly_amount_cents INTEGER,trainer_share_pct REAL,avocado INTEGER,provider_subscription_id TEXT);
    CREATE TABLE clients (id TEXT PRIMARY KEY,email TEXT);
    CREATE TABLE order_addons (id TEXT PRIMARY KEY,square_order_id TEXT,status TEXT);
    CREATE TABLE rev_share_events (id TEXT PRIMARY KEY,trainer_id TEXT,subscription_id TEXT,
      amount_cents INTEGER,share_cents INTEGER,occurred_at INTEGER,payout_status TEXT);`);
  return DB;
}
const seed = (DB, status = 'pending') => DB.sqlite.prepare(
  'INSERT INTO orders (id,square_order_id,status) VALUES (?,?,?)'
).run('ord_synthetic', 'square_synthetic', status);
const paidAlerts = (DB) => DB.sqlite.prepare("SELECT * FROM alerts WHERE alert_type='new_paid_order'").all();
const payment = (DB, status, env = {}) => square({ env: { DB, ...env }, request: new Request('https://example.test/api/webhooks/square', {
  method: 'POST', body: JSON.stringify({ type: 'payment.updated', data: { object: {
    payment: { order_id: 'square_synthetic', status },
  } } }),
}) });

test('completed payment creates one bilingual owner alert; retries after acknowledgement do not duplicate', async () => {
  const DB = fixture(); seed(DB);
  assert.equal((await payment(DB, 'COMPLETED')).status, 200);
  assert.equal(DB.sqlite.prepare('SELECT status FROM orders').get().status, 'paid');
  const [alert] = paidAlerts(DB);
  assert.ok(alert);
  assert.match(alert.title, /New paid order.*Nuevo pedido pagado/);
  assert.equal(alert.ref_id, 'ord_synthetic');
  DB.sqlite.exec("UPDATE alerts SET status='acknowledged'");
  await Promise.all([payment(DB, 'COMPLETED'), payment(DB, 'COMPLETED')]);
  assert.equal(paidAlerts(DB).length, 1);
});

test('APPROVED retains existing order transition but only COMPLETED announces a paid order', async () => {
  const DB = fixture(); seed(DB);
  await payment(DB, 'APPROVED');
  assert.equal(DB.sqlite.prepare('SELECT status FROM orders').get().status, 'paid');
  assert.equal(paidAlerts(DB).length, 0);
  await payment(DB, 'COMPLETED');
  assert.equal(paidAlerts(DB).length, 1);
});

test('late completion still announces fulfilled order; failed/canceled payments and unknown orders do not', async () => {
  const DB = fixture(); seed(DB, 'fulfilled');
  for (const status of ['FAILED', 'CANCELED', 'PENDING']) await payment(DB, status);
  assert.equal(paidAlerts(DB).length, 0);
  await payment(DB, 'COMPLETED');
  assert.equal(paidAlerts(DB).length, 1);
  const empty = fixture();
  await payment(empty, 'COMPLETED');
  assert.equal(paidAlerts(empty).length, 0);
});

test('production webhook without a valid signature neither transitions nor alerts', async () => {
  const DB = fixture(); seed(DB);
  assert.equal((await payment(DB, 'COMPLETED', { SQUARE_ENV: 'production' })).status, 401);
  assert.equal(DB.sqlite.prepare('SELECT status FROM orders').get().status, 'pending');
  assert.equal(paidAlerts(DB).length, 0);
});

test('subscription invoice alerts once per invoice and never mislabels renewals as new orders', async () => {
  const DB = fixture();
  DB.sqlite.exec("INSERT INTO subscriptions VALUES ('sub_test',NULL,NULL,NULL,4000,10,0,'provider_sub')");
  const invoice = () => square({ env: { DB }, request: new Request('https://example.test/api/webhooks/square', {
    method: 'POST', body: JSON.stringify({ type: 'invoice.payment_made', data: { object: {
      invoice: { id: 'invoice_synthetic', subscription_id: 'provider_sub' },
    } } }),
  }) });
  await invoice();
  DB.sqlite.exec("UPDATE alerts SET status='acknowledged'");
  await invoice();
  const alerts = DB.sqlite.prepare('SELECT * FROM alerts').all();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alert_type, 'subscription_payment');
  assert.match(alerts[0].title, /Pago de suscripción recibido/);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM rev_share_events').get().n, 1);
});

async function manual(DB, status, role = 'owner') {
  const SESSIONS = makeKV({ 'session:synthetic': JSON.stringify({ type: 'staff', uid: 'owner_test', role, la: Date.now(), created: Date.now() }) });
  return manualOrder({ env: { DB, SESSIONS }, request: new Request('https://example.test/api/hub/owner/orders', {
    method: 'POST', headers: { Cookie: 'anejo_sess=synthetic', 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_name: 'Synthetic customer', status, items: [{ name: 'Test bowl', qty: 1, price_cents: 1000 }], delivery_date: '2026-12-01', delivery_window: 'lunch' }),
  }) });
}

test('manual pending order is explicitly unpaid; manual paid order announces the recorded payment', async () => {
  const DB = fixture();
  assert.equal((await manual(DB, 'pending')).status, 200);
  assert.equal((await manual(DB, 'paid')).status, 200);
  const alerts = DB.sqlite.prepare('SELECT * FROM alerts ORDER BY created_at').all();
  assert.deepEqual(alerts.map((a) => a.alert_type), ['new_order', 'new_paid_order']);
  assert.match(alerts[0].body, /do not prepare yet.*no preparar todavía/);
  assert.match(alerts[1].body, /payment recorded by the owner.*pago registrado/);
});

test('non-owner cannot create a manual order or generate its owner alert', async () => {
  const DB = fixture();
  assert.equal((await manual(DB, 'paid', 'kitchen')).status, 403);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM alerts').get().n, 0);
});

test('all remaining direct staff push callers declare recognized event types, not private copy', () => {
  const callers = [
    ['functions/_lib/dispatch.js', 'delivery_offer'],
    ['functions/_lib/automations.js', 'eod_missing'],
    ['functions/api/hub/comms/messages.js', 'new_message'],
    ['functions/api/hub/marketing/requests.js', 'marketing_decision'],
    ['functions/api/hub/admin/social-inbox-tick.js', 'social_inbox'],
  ];
  for (const [path, type] of callers) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`type: '${type}'`), path);
    const payload = createHubPushMessage({ type, id: 'synthetic', body: 'PRIVATE CONTENT', title: 'PRIVATE NAME' });
    assert.equal(payload.type, type);
    assert.ok(payload.title_es);
    assert.ok(payload.body_es);
    assert.equal(JSON.stringify(payload).includes('PRIVATE'), false);
  }
  const partner = readFileSync(new URL('../../functions/api/partner-apply.js', import.meta.url), 'utf8');
  assert.equal(partner.includes('sendPushTickle'), false, 'raiseAlert already sends exactly one event push');
});
