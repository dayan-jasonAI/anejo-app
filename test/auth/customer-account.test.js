import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { findPortalUser } from '../../functions/_lib/login.js';
import { onRequestGet as clientMe } from '../../functions/api/client/me.js';
import { customerOrders } from '../../functions/_lib/customer-orders.js';

test('guest retail and catering purchasers can identify as customers without a plan', async () => {
  for (const knownTable of ['orders', 'catering_quotes']) {
    const env = { DB: { prepare(sql) { return { bind(email) {
      assert.equal(email, 'buyer@example.test');
      return { first: async () => sql.includes(`FROM ${knownTable} `) ? { id: 'own' } : null };
    } }; } } };
    assert.equal(await findPortalUser(env, 'buyer@example.test'), 'client');
  }
});

test('order history uses verified email and exposes only customer-facing fields', async () => {
  const env = { DB: { prepare(sql) {
    assert.match(sql, /WHERE LOWER\(TRIM\(customer_email\)\)=\?/);
    assert.match(sql, /LIMIT 30/);
    return { bind(email) {
      assert.equal(email, 'buyer@example.test');
      return { all: async () => ({ results: [{ id: 'own', status: 'paid', items: '[{"name":"Papa","qty":2,"photo_key":"private"}]', customer_email: 'private', square_order_id: 'private' }] }) };
    } };
  } } };
  const [order] = await customerOrders(env, ' Buyer@Example.Test ');
  assert.equal(order.status, 'paid');
  assert.deepEqual(order.items, [{ name: 'Papa', qty: 2, price_cents: undefined }]);
  assert.equal(order.customer_email, undefined);
  assert.equal(order.square_order_id, undefined);
  assert.deepEqual(await customerOrders(env, ''), []);
});

test('account renderer escapes customer data and never calls estimate the charged total', () => {
  const context = { window: {} };
  vm.runInNewContext(readFileSync('public/assets/js/customer-orders.js', 'utf8'), context);
  const html = context.window.AnejoCustomerOrders.render([{ id: '<script>', status: 'pending', items: [{ name: '<img onerror=evil>', qty: 1 }], total_estimate_cents: 1000 }]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror='));
  assert.match(html, /Awaiting payment confirmation/);
  assert.match(html, /Checkout estimate: \$10.00/);
  assert.match(html, /Square receipt contains the final charged total/);
});


test('signed-out account request never queries orders and is not cacheable', async () => {
  const response = await clientMe({ request: new Request('https://anejo.test/api/client/me?email=other@example.test'), env: { SESSIONS: { get: async () => null }, DB: { prepare() { throw new Error('must not query'); } } } });
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
});

test('retail account rendering works without a plan and includes rewards and current order', () => {
  const elements = { main: { innerHTML: '' }, signout: { style: {} } };
  const context = {
    window: {}, document: { getElementById: (id) => elements[id] || {} },
    fetch: () => new Promise(() => {}),
  };
  vm.runInNewContext(readFileSync('public/assets/js/customer-orders.js', 'utf8'), context);
  context.window.AnejoCatering = { render: () => {} };
  const html = readFileSync('public/client/dashboard.html', 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n');
  vm.runInNewContext(inline, context);
  context.render({ authenticated: true, email: 'buyer@example.test', client: null, catering: [], orders: [{ id: 'ord_current', status: 'paid', items: [{ name: 'Papa', qty: 1 }] }], rewards: { tier: 'vital', tier_name: 'Vital', points: 12 } }, {});
  assert.match(elements.main.innerHTML, /ord_current/);
  assert.match(elements.main.innerHTML, /Payment confirmed/);
  assert.match(elements.main.innerHTML, /points/);
  assert.match(elements.main.innerHTML, /Add to Home Screen/);
  assert.ok(!elements.main.innerHTML.includes('Nothing is linked'));
  assert.ok(!elements.main.innerHTML.includes('trainer'));
});
