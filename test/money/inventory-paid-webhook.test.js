import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { onRequestPost as squareWebhook } from '../../functions/api/webhooks/square.js';
import { onRequestPost as socialTick } from '../../functions/api/hub/admin/social-tick.js';

const HAM = 'traditional_croq-jamon';
const at = Date.now();

function stock(env, quantity = 20) {
  env.DB.prepare(`UPDATE menu_items SET stock_count=?,stock_count_basis='physical',stock_counted_at=?,
    inventory_revision=inventory_revision+1 WHERE id=?`).bind(quantity, at - 5_000, HAM).run();
}
function addPendingOrder(env, id, { status = 'pending', created = at - 1_000 } = {}) {
  const items = JSON.stringify([{ id: HAM, name: 'Ham croqueta', qty: 10, price_cents: 150 }]);
  env.DB.prepare(`INSERT INTO orders(id,square_order_id,items,status,created_at,updated_at,customer_email,customer_phone)
    VALUES(?,?,?,?,?,?,NULL,NULL)`).bind(id, `sq_${id}`, items, status, created, created).run();
  return `sq_${id}`;
}
function webhook(env, squareOrderId, status = 'COMPLETED') {
  return squareWebhook({ env: { ...env, SQUARE_ENV: 'sandbox' }, request: new Request('https://example.test/api/webhooks/square', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment.updated', data: { object: { payment: {
      order_id: squareOrderId, status, updated_at: new Date(at).toISOString(),
    } } } }),
  }) });
}
function failOnExternalFetch(t) {
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => { throw new Error(`Unexpected external request: ${String(args[0])}`); };
  t.after(() => { globalThis.fetch = original; });
}

test('captured Square payment deducts exact croqueta stock once across webhook retries and replay', async (t) => {
  failOnExternalFetch(t);
  const env = ownerEnv(); stock(env, 20);
  const squareId = addPendingOrder(env, 'webhook-ham-10');
  assert.equal((await webhook(env, squareId)).status, 200);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_type='order' AND source_id='webhook-ham-10'").n, 1);
  assert.equal(env.DB.one("SELECT effective_at,time_basis FROM inventory_sale_jobs WHERE source_id='webhook-ham-10'").time_basis, 'square_capture');
  await webhook(env, squareId);
  env.DB.prepare("UPDATE orders SET status='fulfilled' WHERE id='webhook-ham-10'").run();
  await webhook(env, squareId);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='webhook-ham-10'").n, 1);
});

test('inventory audit failure returns retryable 503 without partial stock movement, then retry settles', async (t) => {
  failOnExternalFetch(t);
  const env = ownerEnv(); stock(env, 20);
  const squareId = addPendingOrder(env, 'webhook-ham-rollback');
  env.DB.exec(`CREATE TRIGGER reject_paid_sale_audit BEFORE INSERT ON inventory_changes
    WHEN NEW.action='paid_sale' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END`);
  assert.equal((await webhook(env, squareId)).status, 503);
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?', 'webhook-ham-rollback').status, 'paid');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 20);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='webhook-ham-rollback'").n, 0);
  assert.equal(env.DB.one("SELECT state FROM inventory_sale_jobs WHERE source_id='webhook-ham-rollback'").state, 'pending');
  env.DB.exec('DROP TRIGGER reject_paid_sale_audit');
  assert.equal((await webhook(env, squareId)).status, 200);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='webhook-ham-rollback'").n, 1);
});

test('Square authorization does not release or deduct food before capture', async (t) => {
  failOnExternalFetch(t);
  const env = ownerEnv(); stock(env, 20);
  const squareId = addPendingOrder(env, 'webhook-ham-approved');
  assert.equal((await webhook(env, squareId, 'APPROVED')).status, 200);
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?', 'webhook-ham-approved').status, 'pending');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 20);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='webhook-ham-approved'").n, 0);
});

test('a replayed deposit capture cannot backdate the fully paid quote stock job', async (t) => {
  failOnExternalFetch(t);
  const env = ownerEnv();
  const countedAt = at - 500;
  stock(env, 20);
  env.DB.prepare('UPDATE menu_items SET stock_counted_at=? WHERE id=?').bind(countedAt, HAM).run();
  const lines = JSON.stringify({ lines: [{ pricing_mode: 'catalog', product_id: HAM, name: 'Ham croqueta', qty: '2', unit_cents: 150, cents: 300 }] });
  env.DB.prepare(`INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,
    deposit_status,balance_status,terms_version,terms_json,quote_json,square_order_id,deposit_paid_at,balance_paid_at,created_at,updated_at)
    VALUES('quote-deposit-replay',1,1000,.25,250,750,'paid','paid','test','{}',?,'sq_deposit_replay',?,?,?,?)`)
    .bind(lines, at - 1_000, at - 100, at - 2_000, at - 100).run();
  env.DB.prepare(`INSERT INTO catering_balance_checkouts(quote_id,amount_cents,square_order_id,paid_at,created_at)
    VALUES('quote-deposit-replay',750,'sq_final_balance',?,?)`).bind(at - 100, at - 100).run();
  const jobBefore = env.DB.one("SELECT effective_at,time_basis FROM inventory_sale_jobs WHERE source_type='quote' AND source_id='quote-deposit-replay'");
  assert.equal(jobBefore.effective_at, at - 100);
  assert.equal(jobBefore.time_basis, 'quote_paid');

  const response = await squareWebhook({ env: { ...env, SQUARE_ENV: 'sandbox' }, request: new Request('https://example.test/api/webhooks/square', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'payment.updated', data: { object: { payment: {
      id: 'payment-deposit-replay', order_id: 'sq_deposit_replay', status: 'COMPLETED',
      updated_at: new Date(at - 1_000).toISOString(), amount_money: { amount: 250, currency: 'USD' },
    } } } }),
  }) });
  assert.equal(response.status, 200, await response.clone().text());
  const jobAfter = env.DB.one("SELECT effective_at,time_basis,state FROM inventory_sale_jobs WHERE source_type='quote' AND source_id='quote-deposit-replay'");
  assert.equal(jobAfter.effective_at, at - 100, 'the actual balance payment remains the stock movement time');
  assert.equal(jobAfter.time_basis, 'quote_paid');
  assert.equal(jobAfter.state, 'done');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 18,
    'the sale after the absolute count is deducted; the older deposit replay does not cover it');
});

test('social tick drains paid inventory while Instagram is unconfigured and makes no provider call', async (t) => {
  failOnExternalFetch(t);
  const env = ownerEnv({ CRON_KEY: 'synthetic-cron-key' }); stock(env, 20);
  addPendingOrder(env, 'tick-ham-paid', { status: 'paid' });
  const response = await socialTick({ env, request: new Request('https://example.test/api/hub/admin/social-tick', {
    method: 'POST', headers: { 'x-cron-key': env.CRON_KEY },
  }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.skipped, 'instagram_not_configured');
  assert.equal(body.paid_inventory.ok, true);
  assert.equal(body.paid_inventory.processed, 1);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT state FROM inventory_sale_jobs WHERE source_id='tick-ham-paid'").state, 'done');
});
