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

test('the 10/25/50 buttons the picker offers are prices the estimator actually charges', async () => {
  // Dayan asked for 10 / 25 / 50 on every tray item. The menu publishes no product with all three
  // — servings come as 10 and 25, pieces as 25 and 50, dessert cups by the 12 — so the picker
  // builds the missing sizes out of the trays that exist and labels them with the exact cost.
  // That label is only honest if the server charges the same, which is what this pins.
  const m = { source: 'd1', items };
  const cases = [
    [{ id: 'lechon', quantity: 50 }, 48000, 'two $240 trays, not a rounded-up 3rd'],
    [{ id: 'skewer', quantity: 10 }, 3000, 'ten singles — no 10-tray exists'],
    [{ id: 'yuca', quantity: 50 }, 21000, 'two $105 trays'],
    // The cheapest exact combination is 12 + 12 + 1 at $125.50, NOT 25 singles at $137.50.
    [{ id: 'cup-fresa', quantity: 25 }, 12550, 'two 12-packs and a single'],
  ];
  for (const [row, cents, why] of cases) {
    const priced = estimateCateringProducts([row], m);
    assert.equal(priced.subtotal_cents, cents, `${row.id} x ${row.quantity}: ${why}`);
    assert.equal(priced.checkout_eligible, true, `${row.id} x ${row.quantity} must be buyable`);
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

test('every filling the form offers can be priced — verified against production', async () => {
  // The snapshot fixture predates the 2026-09-08 menu expansion. These rows were read out of the
  // live D1 on 2026-09-09; they are here so the mapping is pinned against what production really
  // publishes, not against a fixture that lags it. The gap they close is concrete: a 50-piece
  // sausage croqueta line on a real order came back "quoted after review" while a $75 tray for
  // exactly that item was already on sale.
  const LIVE_EXTRA = [
    ['croq-chorizo', 250, 4000, 7500], ['croq-sausage', 250, 4000, 7500], ['croq-tuna', 250, 4000, 7500],
    ['emp-cheese', 350, 7500, 14500], ['emp-ham', 350, 7500, 14500], ['emp-tuna', 350, 7500, 14500],
    ['emp-pollo', 350, 7500, 14500], ['emp-res', 350, 7500, 14500], ['emp-ham-cheese', 350, 7500, 14500],
    ['emp-guava-only', 350, 7500, 14500], ['emp-ropa-vieja', 400, 8500, 16500],
    ['emp-pulled-pork', 350, 7500, 14500],
  ];
  const rows = structuredClone(items);
  for (const [base, one, t25, t50] of LIVE_EXTRA) {
    rows.push({ id: `traditional_${base}`, kind: 'addon', price_cents: one, active: 1, image: `menu-launch/food-${base}.webp` });
    rows.push({ id: `catering_${base}-25`, kind: 'addon', price_cents: t25, active: 1, image: `menu-launch/food-${base}-25.webp` });
    rows.push({ id: `catering_${base}-50`, kind: 'addon', price_cents: t50, active: 1, image: `menu-launch/food-${base}-50.webp` });
  }
  const menu = { source: 'd1', items: rows };

  // The exact line from the real order, at the real published price.
  const sausage = estimateCateringProducts([{ id: 'croqueta', quantity: 50, flavor: 'sausage' }], menu);
  assert.equal(sausage.subtotal_cents, 7500, '50 sausage croquetas are one $75 tray');
  assert.equal(sausage.checkout_eligible, true, 'and buyable, not "quoted after review"');
  assert.deepEqual(sausage.items, [{ id: 'catering_croq-sausage-50', qty: 1 }]);

  // Ropa vieja is the one empanada priced differently; it must not inherit the $75/$145 pair.
  assert.equal(estimateCateringProducts([{ id: 'empanada', quantity: 50, flavor: 'ropa-vieja' }], menu).subtotal_cents, 16500);
  assert.equal(estimateCateringProducts([{ id: 'empanada', quantity: 50, flavor: 'cheese' }], menu).subtotal_cents, 14500);

  // EVERY filling the picker offers must now carry a price.
  const data = await get(rows);
  for (const product of ['croqueta', 'empanada']) {
    const entry = data.products.find((p) => p.id === product);
    for (const [key, f] of Object.entries(entry.flavors)) {
      assert.notEqual(f.from_cents, null, `${product} · ${key} has no price`);
      assert.ok(f.packs.length >= 2, `${product} · ${key} should offer a single and trays`);
    }
  }
});

test('a filling with genuinely no published tray is still quoted by a person', async () => {
  // The rule did not change, only the list of what qualifies. With the SNAPSHOT menu (which has
  // no sausage SKUs), sausage must still refuse rather than invent a price.
  const s = estimateCateringProducts([{ id: 'croqueta', quantity: 50, flavor: 'sausage' }], { source: 'd1', items });
  assert.equal(s.checkout_eligible, false, 'nothing may be sold at a price the menu does not publish');
  assert.equal(s.subtotal_cents, 0);
  assert.equal(s.unpriced.length, 1, 'and the line is reported, not dropped');
  assert.equal(s.unpriced[0].flavor, 'sausage', 'named by the filling that could not be priced');
  // The reason code differs by WHY: 'needs_custom_price' when nothing maps the product at all,
  // 'unavailable_exact_quantity' when it maps to SKUs the menu is not currently publishing. Both
  // refuse; the distinction tells whoever is reading whether to add a mapping or a menu row.
  assert.ok(['needs_custom_price', 'unavailable_exact_quantity'].includes(s.unpriced[0].reason));
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
