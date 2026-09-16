import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeKV } from '../helpers/d1.js';
import { makeCateringDB } from './catering-outbox-fixture.js';
import { createOrderReceipt, readOrderReceipt } from '../../functions/_lib/order-receipt.js';
import { onRequestGet } from '../../functions/api/order-receipt.js';

function fixture() {
  const DB = makeCateringDB();
  DB.sqlite.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY,status TEXT,subtotal_cents INTEGER,discount_cents INTEGER);
    INSERT INTO orders VALUES ('ord_a','pending',4500,500);
    INSERT INTO orders VALUES ('ord_b','paid',9900,0);`);
  return { DB, SESSIONS: makeKV() };
}
test('receipt capability sees only its order and reports discounted food value after payment', async () => {
  const env = fixture();
  const token = await createOrderReceipt(env, 'ord_a');
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.deepEqual(await readOrderReceipt(env, token), { paid: false });
  env.DB.sqlite.exec("UPDATE orders SET status='paid' WHERE id='ord_a'");
  assert.deepEqual(await readOrderReceipt(env, token), { paid: true, transaction_id: 'ord_a', currency: 'USD', value: 40 });
  assert.equal(await readOrderReceipt(env, 'ord_b'), null);
  assert.equal(await readOrderReceipt(env, '0'.repeat(64)), null);
});
test('canceled or abandoned orders never report a purchase and expired capabilities are rejected', async () => {
  const env = fixture();
  const token = await createOrderReceipt(env, 'ord_a');
  for (const status of ['pending', 'canceled', 'abandoned']) {
    env.DB.sqlite.prepare('UPDATE orders SET status=? WHERE id=?').run(status, 'ord_a');
    assert.deepEqual(await readOrderReceipt(env, token), { paid: false });
  }
  await env.SESSIONS.put(`order-receipt:${token}`, JSON.stringify({ orderId: 'ord_b', created: Date.now() - 86400001 }));
  assert.equal(await readOrderReceipt(env, token), null);
});
test('receipt endpoint forbids caching and does not accept a public order ID', async () => {
  const env = fixture();
  const token = await createOrderReceipt(env, 'ord_b');
  const response = await onRequestGet({ env, request: new Request('https://example.test/api/order-receipt', { headers: { Authorization: `Bearer ${token}` } }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Object.keys(await response.json()).sort(), ['currency', 'paid', 'transaction_id', 'value']);
  const denied = await onRequestGet({ env, request: new Request('https://example.test/api/order-receipt?orderId=ord_b') });
  assert.equal(denied.status, 404);
});
