import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/checkout.js';
import { makeD1 } from '../helpers/d1.js';

// Contract fixtures only: no provider requests, customer messages or actual payments.
async function checkout({ pct = 10, perk = null, providerDiscount, providerTotal, providerFailure = false, claim = 1, itemId = 'sides_test', qty = 3, price = 1000, orderWrite = 1, redemptionWrite = 1, noDB = false, promoCode = 'TEST', retrieveFailure = false, retrieveDiscount, retrieveTotal } = {}) {
  let sent; const saved = []; let released = 0;
  const DB = makeD1([
    [/SELECT \* FROM menu_items/, () => [{ id: itemId, name: 'Test food', kind: 'addon', price_cents: price, active: 1 }]],
    [/SELECT key, cents FROM menu_modifier_prices/, () => []],
    [/SELECT key, value FROM app_settings/, () => []],
    [/SELECT \* FROM promo_codes WHERE code =/, () => ({ code: 'TEST', kind: 'campaign', status: 'active', pct_off: pct, perk, points_mult: 1, perk_first_order_only: 0 })],
    [/UPDATE promo_codes SET uses = uses \+ 1/, () => claim],
    [/UPDATE promo_codes SET uses = MAX/, () => { released++; return 1; }],
    [/^INSERT INTO orders/, ({ args }) => { saved.push(args); if (orderWrite === 'throw') throw Error('fixture write failure'); return orderWrite; }],
    [/^INSERT INTO promo_redemptions/, () => { if (redemptionWrite === 'throw') throw Error('fixture write failure'); return redemptionWrite; }],
  ]);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /squareupsandbox.com/);
    if (!init.body) {
      assert.match(String(url), /\/v2\/orders\/square-order$/);
      assert.equal(init.method, 'GET');
      if (retrieveFailure) return new Response('{}', { status: 503 });
      const sub = sent.order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
      const discount = retrieveDiscount ?? (sent.order.discounts || []).reduce((sum, d) => sum + d.amount_money.amount, 0);
      const fee = sent.order.service_charges?.[0]?.amount_money.amount || 0;
      return new Response(JSON.stringify({ order: { id: 'square-order', total_money: { amount: retrieveTotal ?? Math.round((sub - discount) * 1.07) + fee, currency: 'USD' }, total_discount_money: { amount: discount, currency: 'USD' } } }));
    }
    sent = JSON.parse(init.body);
    if (providerFailure) throw Error('fixture network failure');
    const related_resources = providerTotal == null ? undefined : { orders: [{ id: 'square-order', total_money: { amount: providerTotal, currency: 'USD' }, total_discount_money: { amount: providerDiscount, currency: 'USD' } }] };
    return new Response(JSON.stringify({ payment_link: { id: 'mock', order_id: 'square-order', url: 'https://square.link/u/mock' }, related_resources }));
  };
  try {
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 10); if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
    const response = await onRequestPost({ env: { DB: noDB ? undefined : DB, SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'fixture', SQUARE_LOCATION_ID: 'fixture' }, request: new Request('https://example.com/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: itemId, qty, price_cents: 1 }], promo_code: promoCode, discount_cents: 999999, delivery: { date: date.toISOString().slice(0, 10), window: 'lunch' }, address: { street: '123 Main St', city: 'West Palm Beach', zip: '33401' }, contact: { first_name: 'Test' } }) }) });
    return { response, result: await response.json(), sent, saved, released };
  } finally { globalThis.fetch = oldFetch; }
}

test('10% promo reaches Square at server catalog price and persists the same discounted total', async () => {
  const r = await checkout(); assert.equal(r.response.status, 200);
  assert.equal(r.sent.order.line_items[0].base_price_money.amount, 1000);
  assert.deepEqual(r.sent.order.discounts, [{ uid: 'anejo-promo', name: 'TEST (10% off)', amount_money: { amount: 300, currency: 'USD' }, scope: 'ORDER', type: 'FIXED_AMOUNT' }]);
  assert.equal(JSON.parse(r.saved[0][3])[0].qty, 3);
  assert.equal(r.saved[0][10], 3389); assert.equal(r.saved[0][12], 300);
});
test('a delivery-only code removes the service charge without discounting food or tax', async () => {
  const r = await checkout({ pct: 0, perk: 'free_delivery' }); assert.equal(r.response.status, 200);
  assert.equal(r.sent.order.service_charges, undefined); assert.equal(r.sent.order.discounts, undefined);
  assert.equal(r.saved[0][8], 0); assert.equal(r.saved[0][10], 3210);
});
test('catering plus 100% promo sends at most the food subtotal in discounts', async () => {
  const r = await checkout({ itemId: 'catering_test', qty: 1, price: 54600, pct: 100 }); assert.equal(r.response.status, 200);
  assert.equal(r.sent.order.discounts.reduce((sum, d) => sum + d.amount_money.amount, 0), 54600);
  assert.equal(r.saved[0][12], 54600); assert.equal(r.saved[0][10], 500);
});
test('Square calculated total is persisted when per-line rounding differs from estimate', async () => {
  const r = await checkout({ providerDiscount: 300, providerTotal: 3390 }); assert.equal(r.response.status, 200); assert.equal(r.saved[0][10], 3390);
});
test('provider omission of advertised discount refuses the link and releases claimed use', async () => {
  const r = await checkout({ providerDiscount: 0, providerTotal: 3710 }); assert.equal(r.response.status, 502); assert.equal(r.result.url, undefined); assert.equal(r.saved.length, 0); assert.equal(r.released, 1);
});
test('a lost promo use-cap race never opens a full-price link', async () => {
  const r = await checkout({ claim: 0 }); assert.equal(r.response.status, 400); assert.equal(r.sent, undefined);
});

test('network failure releases a claimed promo without returning any payment link', async () => {
  const r = await checkout({ providerFailure: true }); assert.equal(r.response.status, 502); assert.equal(r.result.url, undefined); assert.equal(r.released, 1); assert.equal(r.saved.length, 0);
});

test('all non-daily order write failures withhold link and release the promo claim', async () => {
  for (const orderWrite of ['throw', 0, { success: false, meta: { changes: 1 } }]) {
    const r = await checkout({ orderWrite }); assert.equal(r.response.status, 503); assert.equal(r.result.url, undefined); assert.equal(r.released, 1);
  }
});
test('failed promo-redemption persistence cannot return a payable link or burn its use', async () => {
  for (const redemptionWrite of ['throw', 0]) {
    const r = await checkout({ redemptionWrite }); assert.equal(r.response.status, 503); assert.equal(r.result.url, undefined); assert.equal(r.released, 1);
  }
});
test('missing database binding refuses checkout before any Square request', async () => {
  const r = await checkout({ noDB: true }); assert.equal(r.response.status, 503); assert.equal(r.sent, undefined); assert.equal(r.released, 0);
});

test('a non-promo cart cannot obtain payment when its kitchen ticket fails', async () => {
  const r = await checkout({ promoCode: null, orderWrite: 'throw' });
  assert.equal(r.response.status, 503); assert.equal(r.result.url, undefined); assert.equal(r.released, 0);
});

test('missing related order triggers retrieval and persists verified provider total', async () => {
  const r = await checkout({ retrieveDiscount: 300, retrieveTotal: 3390 });
  assert.equal(r.response.status, 200); assert.equal(r.saved[0][10], 3390);
});
test('missing related order and unavailable retrieval never expose discounted payment', async () => {
  const r = await checkout({ retrieveFailure: true });
  assert.equal(r.response.status, 502); assert.equal(r.result.url, undefined); assert.equal(r.released, 1); assert.equal(r.saved.length, 0);
});
test('retrieved order lacking advertised discount never exposes payment', async () => {
  const r = await checkout({ retrieveDiscount: 0, retrieveTotal: 3710 });
  assert.equal(r.response.status, 502); assert.equal(r.result.url, undefined); assert.equal(r.released, 1); assert.equal(r.saved.length, 0);
});
