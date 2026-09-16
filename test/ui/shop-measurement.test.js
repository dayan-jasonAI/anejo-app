import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../public/assets/js/shop-measurement.js', import.meta.url), 'utf8');
function fixture(consent = true) {
  const events = [], window = {};
  if (consent) window.gtag = (...args) => events.push(args);
  vm.runInNewContext(source, { window });
  return { api: window.AnejoShopMeasurement, events, window };
}
const row = quantity => ({ item_id: 'vida', price: 22.99, quantity });
test('cart events report quantity deltas and never duplicate unchanged renders', () => {
  const { api, events } = fixture();
  api.update([row(1)]); api.update([row(1)]); api.update([row(3)]); api.update([row(2)]);
  assert.deepEqual(events.map(e => e[1]), ['add_to_cart', 'add_to_cart', 'remove_from_cart']);
  assert.deepEqual(events.map(e => e[2].items[0].quantity), [1, 2, 1]);
  assert.equal(events[1][2].value, 45.98);
});
test('declined or absent consent sends nothing and does not backfill after consent', () => {
  const { api, events, window } = fixture(false);
  api.update([row(1)]); api.step('begin_checkout');
  assert.equal(events.length, 0);
  window.gtag = (...args) => events.push(args);
  api.update([row(1)]);
  assert.equal(events.length, 0);
  api.step('view_cart');
  assert.equal(events.length, 1);
});
test('only public item fields are sent; arbitrary events and invalid items are ignored', () => {
  const { api, events } = fixture();
  api.update([{ ...row(1), email: 'private@example.test', notes: 'private' }, { item_id: 'private@example.test', price: 10, quantity: 1 }]);
  api.step('private@example.test');
  assert.equal(events.length, 1);
  assert.equal(JSON.stringify(events).includes('private'), false);
  assert.deepEqual(Object.keys(events[0][2].items[0]).sort(), ['item_id', 'price', 'quantity']);
});
test('analytics provider failure never breaks cart updates or checkout', () => {
  const { api, window } = fixture();
  window.gtag = () => { throw new Error('provider unavailable'); };
  assert.doesNotThrow(() => { api.update([row(1)]); api.step('checkout_redirect'); });
});
