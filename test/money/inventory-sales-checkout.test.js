import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { saveSaleOffer } from '../../functions/_lib/inventory_sales.js';
import { onRequestPost } from '../../functions/api/checkout.js';

const SKU = 'catering_emp-cheese-10';
const plusDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
async function fixture({ quantity = 5, expire = false } = {}) {
  const env = ownerEnv({ SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'synthetic', SQUARE_LOCATION_ID: 'synthetic' });
  const row = env.DB.one('SELECT inventory_revision FROM menu_items WHERE id=?', SKU);
  const at = Date.now();
  const offer = await saveSaleOffer(env, { itemId: SKU, quantity, enabled: true, inventoryRevision: row.inventory_revision, changeId: `sale_${quantity}_${at}`, actorId: 'stf_owner', at, expiresAt: expire ? at + 1000 : undefined });
  assert.equal(offer.ok, true, JSON.stringify(offer));
  return { env, at };
}
function request({ qty = 2, revision, itemId = SKU } = {}) {
  const item = { id: itemId, qty, ...(revision === undefined ? {} : { sale_offer_revision: revision }) };
  return new Request('https://anejo.test/api/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [item], delivery: { date: plusDays(5), window: 'lunch' }, address: { street: '123 Main St', city: 'West Palm Beach', zip: '33401' }, contact: { first_name: 'Test' } }),
  });
}
async function withSquare(work, { onCreate } = {}) {
  const prior = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method || 'GET' });
    if (path.endsWith('/payment-links') && init.method === 'POST') {
      const sent = JSON.parse(init.body);
      await onCreate?.();
      const subtotal = sent.order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
      return Response.json({ payment_link: { id: 'synthetic_link', order_id: 'synthetic_square_order', url: 'https://square.link/synthetic' }, related_resources: { orders: [{ id: 'synthetic_square_order', total_money: { amount: Math.round(subtotal * 1.07), currency: 'USD' }, total_discount_money: { amount: 0, currency: 'USD' } }] } });
    }
    if (path.endsWith('/payment-links/synthetic_link') && init.method === 'DELETE') return Response.json({ payment_link: { id: 'synthetic_link', status: 'CANCELED' } });
    throw new Error(`Unexpected fake provider request ${init.method} ${path}`);
  };
  try { return await work(calls); } finally { globalThis.fetch = prior; }
}
async function post(env, opts, squareOptions) {
  return withSquare(async calls => {
    const response = await onRequestPost({ env, request: request(opts) });
    return { response, body: await response.json(), calls };
  }, squareOptions);
}

test('known insufficient offer stock rejects before Square and persists no order or reservation', async () => {
  const { env } = await fixture({ quantity: 1 });
  const result = await post(env, { qty: 2, revision: 1 });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, 'stock_capacity_changed');
  assert.equal(result.calls.length, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM orders').n, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_reservations').n, 0);
});

test('offer revision is type-checked and stale explicit promotion rejects before Square', async () => {
  const { env } = await fixture({ quantity: 5 });
  let result = await post(env, { qty: 1, revision: '1' });
  assert.equal(result.response.status, 400);
  assert.equal(result.calls.length, 0);
  result = await post(env, { qty: 1, revision: 8 });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, 'stock_capacity_changed');
  assert.equal(result.calls.length, 0);
});

test('expired or inventory-revision-stale promoted stock rejects before Square', async () => {
  for (const stale of ['expiry', 'inventory_revision']) {
    const { env, at } = await fixture({ quantity: 5 });
    if (stale === 'expiry') await env.DB.prepare('UPDATE inventory_sale_offers SET sale_expires_at=? WHERE menu_item_id=?').bind(at + 1, SKU).run();
    else await env.DB.prepare('UPDATE menu_items SET inventory_revision=inventory_revision+1 WHERE id=?').bind(SKU).run();
    if (stale === 'expiry') await new Promise(resolve => setTimeout(resolve, 5));
    const result = await post(env, { qty: 1, revision: 1 });
    assert.equal(result.response.status, 409, stale);
    assert.equal(result.body.error, 'stock_capacity_changed');
    assert.equal(result.calls.length, 0, stale);
  }
});

test('live offer claims, kitchen order and durable reservation persist before the link is returned', async () => {
  const { env } = await fixture({ quantity: 5 });
  const result = await post(env, { qty: 2, revision: 1 });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.url, 'https://square.link/synthetic');
  const order = env.DB.one('SELECT id,items,status FROM orders');
  assert.equal(order.status, 'pending');
  assert.equal(JSON.parse(order.items)[0].sale_offer_revision, 1);
  const reservation = env.DB.one('SELECT order_id,menu_item_id,offer_revision,quantity FROM inventory_sale_reservations');
  assert.deepEqual([reservation.order_id, reservation.menu_item_id, reservation.offer_revision, reservation.quantity], [order.id, SKU, 1, 2]);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_checkout_claims WHERE order_id=?', order.id).n, 1);
});

test('an active SKU offer caps ordinary scheduled checkout even without client-supplied offer metadata', async () => {
  const { env } = await fixture({ quantity: 5 });
  const result = await post(env, { qty: 2 });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  const saved = env.DB.one('SELECT items FROM orders');
  assert.equal(JSON.parse(saved.items)[0].sale_offer_revision, undefined);
  const reservation = env.DB.one('SELECT menu_item_id,offer_revision,quantity FROM inventory_sale_reservations');
  assert.deepEqual([reservation.menu_item_id, reservation.offer_revision, reservation.quantity], [SKU, 1, 2]);
});

test('a capacity race after link creation aborts the order batch and best-effort deletes the unexposed link', async () => {
  const { env } = await fixture({ quantity: 5 });
  const result = await post(env, { qty: 2, revision: 1 }, { onCreate: async () => {
    await env.DB.prepare('UPDATE inventory_sale_offers SET quantity=1 WHERE menu_item_id=?').bind(SKU).run();
  } });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error, 'stock_capacity_changed');
  assert.deepEqual(result.calls.map(x => [x.method, x.path]), [
    ['POST', '/v2/online-checkout/payment-links'],
    ['DELETE', '/v2/online-checkout/payment-links/synthetic_link'],
  ]);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM orders').n, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_checkout_claims').n, 0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_reservations').n, 0);
});

test('legacy order without a declared offer follows the ordinary checkout and leaves reservation tables empty', async () => {
  const env = ownerEnv({ SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'synthetic', SQUARE_LOCATION_ID: 'synthetic' });
  const result = await post(env, { qty: 2 });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM orders').n, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_reservations').n, 0);
});
