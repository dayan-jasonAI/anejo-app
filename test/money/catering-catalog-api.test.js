// The catalog endpoint that puts a price and a photo on each catering product before it is
// picked. Its whole job is to agree with the estimator: any price it shows a customer must be a
// price the checkout will honour, because it is read from the same mapping and the same live menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/api/catering-catalog.js';
import { estimateCateringProducts } from '../../functions/_lib/catering-estimate.js';

const items = JSON.parse(readFileSync(new URL('../../docs/menu-launch/catalog.json', import.meta.url)));
const envWith = (rows) => ({ DB: { prepare: (sql) => ({ all: async () => ({ results: sql.includes('menu_items') ? rows : [] }) }) } });
const get = async (rows = items) => (await onRequestGet({ env: envWith(rows), request: new Request('https://example.com/api/catering-catalog') })).json();
const find = (data, id) => data.products.find((p) => p.id === id);

test('every product carries a price and an image so nothing is picked blind', async () => {
  const data = await get();
  assert.equal(data.live, true);
  const priceable = data.products.filter((p) => !p.custom && p.from_cents != null);
  assert.ok(priceable.length >= 18, `expected the bulk of the menu to be priced, got ${priceable.length}`);
  for (const p of priceable) {
    assert.ok(p.image, `${p.id} has a price but no photo`);
    assert.ok(p.packs.length, `${p.id} has a price but no pack to buy it in`);
    assert.ok(p.en && p.es, `${p.id} must be offered in both languages`);
  }
});

test('the tray sizes offered are the ones the menu actually publishes', async () => {
  const data = await get();
  assert.deepEqual(find(data, 'lechon').packs.map((p) => p.size), [1, 10, 25]);
  assert.deepEqual(find(data, 'skewer').packs.map((p) => p.size), [1, 25, 50]);
  assert.deepEqual(find(data, 'cup-fresa').packs.map((p) => p.size), [1, 12], 'dessert cups come by the 12');
  assert.deepEqual(find(data, 'pizza').packs.map((p) => p.size), [1, 3]);
});

test('yuca is offered — the product that made Dayan file his own order as a custom request', async () => {
  const yuca = find(await get(), 'yuca');
  assert.ok(yuca, 'yuca must be a first-class product now');
  assert.equal(yuca.unit_cents, 550);
  assert.deepEqual(yuca.packs.map((p) => p.size), [1, 10, 25]);
  // The 25 tray at $105 is the cheapest way to buy a serving; that is the headline price.
  assert.equal(yuca.from_cents, 420);
});

test('a price shown here is a price the estimator charges — never a shop-window number', async () => {
  const data = await get();
  for (const [id, qty] of [['lechon', 25], ['yuca', 25], ['skewer', 50], ['congri', 10], ['salad-fresh', 10]]) {
    const product = find(data, id);
    const pack = product.packs.find((p) => p.size === qty);
    const priced = estimateCateringProducts([{ id, quantity: qty }], { source: 'd1', items });
    assert.equal(priced.subtotal_cents, pack.cents, `${id} × ${qty} disagrees between catalog and estimate`);
  }
});

test('flavours are priced individually, and an unpriced filling stays visible instead of vanishing', async () => {
  const croqueta = find(await get(), 'croqueta');
  assert.equal(croqueta.flavors.ham.from_cents, 150, 'the 50 tray at $75 is $1.50 a piece');
  assert.equal(croqueta.flavors.chicken.from_cents, 150);
  // Chorizo, sausage, tuna are real kitchen items with no published tray. They must still be
  // offerable — Dayan's order had a sausage croqueta line — but with no invented price.
  assert.equal(croqueta.flavors.sausage.from_cents, null);
  assert.deepEqual(croqueta.flavors.sausage.packs, []);
  assert.ok(croqueta.flavors.sausage.en, 'and it still has a name to show');
});

test('sauces are flagged as add-ons rather than a category to browse', async () => {
  const data = await get();
  const sauces = data.products.filter((p) => p.addon);
  assert.ok(sauces.length >= 10);
  assert.ok(sauces.every((p) => p.from_cents != null), 'every offered sauce must carry a price');
  assert.ok(data.products.filter((p) => !p.addon && !p.custom).length >= 15, 'the browse list is still the food');
});

test('a sold-out or unpublished tray disappears from the shop window, not just from checkout', async () => {
  const rows = structuredClone(items);
  rows.find((x) => x.id === 'catering_yuca-25').availability = 'sold_out';
  rows.find((x) => x.id === 'catering_yuca-10').active = 0;
  const yuca = find(await get(rows), 'yuca');
  assert.deepEqual(yuca.packs.map((p) => p.size), [1], 'only the single serving is still buyable');
  assert.equal(yuca.from_cents, 550);
});

test('custom lines are listed with no price at all, never a zero', async () => {
  const data = await get();
  const custom = data.products.filter((p) => p.custom);
  assert.ok(custom.length >= 3);
  for (const p of custom) {
    assert.equal(p.from_cents, undefined, 'a custom line must not carry a from-price');
    assert.deepEqual(p.packs, []);
  }
});

test('when the live menu is unreachable it says so instead of showing stale prices', async () => {
  const data = await (await onRequestGet({
    env: { DB: { prepare: () => ({ all: async () => { throw new Error('d1 down'); } }) } },
    request: new Request('https://example.com/api/catering-catalog'),
  })).json();
  assert.equal(data.live, false, 'the picker has to be told these are not live prices');
  assert.ok(data.products.every((p) => !p.packs.length), 'and must be given no prices to show');
});

test('the published discount tiers travel with the catalog so the form can show the ladder', async () => {
  const data = await get();
  assert.deepEqual(data.discount_tiers, [
    { from_cents: 50000, rate: 0.05 },
    { from_cents: 100000, rate: 0.10 },
    { from_cents: 200000, rate: 0.20 },
  ]);
});

test('the response is never cached — a stale price sits next to a Buy button', async () => {
  const res = await onRequestGet({ env: envWith(items), request: new Request('https://example.com/api/catering-catalog') });
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});
