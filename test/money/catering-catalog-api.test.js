// The catalog endpoint that puts a price and a photo on each catering product before it is
// picked. Its whole job is to agree with the estimator: any price it shows a customer must be a
// price the checkout will honour, because it is read from the same mapping and the same live menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/api/catering-catalog.js';
import { estimateCateringProducts } from '../../functions/_lib/catering-estimate.js';

const items = JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url)));
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
  // Dayan's 2026-09 ratification put 10 / 25 / 50 on every tray item (D-list, 2026-09-09), so the
  // sizes below are read straight off scripts/menu-2026-09/prices.mjs, not off the old ladders.
  assert.deepEqual(find(data, 'lechon').packs.map((p) => p.size), [1, 10, 25, 50]);
  assert.deepEqual(find(data, 'skewer').packs.map((p) => p.size), [1, 10, 25, 50]);
  assert.deepEqual(find(data, 'cup-fresa').packs.map((p) => p.size), [1, 10, 25, 50],
    'the 12-cup pack was retired; cups now come on the same 10/25/50 ladder as everything else');
  // catering_pizza-3 was retired. The single is all the menu publishes, so it is all we offer.
  assert.deepEqual(find(data, 'pizza').packs.map((p) => p.size), [1]);
});

test('yuca is offered — the product that made Dayan file his own order as a custom request', async () => {
  const yuca = find(await get(), 'yuca');
  assert.ok(yuca, 'yuca must be a first-class product now');
  assert.equal(yuca.unit_cents, 350, 'the ratified single is $3.50');
  assert.deepEqual(yuca.packs.map((p) => p.size), [1, 10, 25, 30, 50]);
  // The 50 tray at $65 works out to $1.30 a serving, the cheapest route in; that is the headline.
  assert.equal(yuca.from_cents, 130);
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
  // Dayan asked for 10 / 25 / 50 on every tray item and the 2026-09 menu publishes exactly that,
  // so most of these are now a single tray rather than a combination the picker had to invent.
  // The label is only honest if the server charges the same, which is what this pins.
  const m = { source: 'd1', items };
  const cases = [
    [{ id: 'lechon', quantity: 50 }, 16000, 'the published $160 fifty-tray'],
    [{ id: 'skewer', quantity: 10 }, 3000, 'the $30 ten-tray — the menu carries one now'],
    [{ id: 'yuca', quantity: 50 }, 6500, 'the $65 fifty-tray'],
    [{ id: 'cup-fresa', quantity: 25 }, 7000, 'the $70 twenty-five-tray, not 25 singles at $137.50'],
  ];
  for (const [row, cents, why] of cases) {
    const priced = estimateCateringProducts([row], m);
    assert.equal(priced.subtotal_cents, cents, `${row.id} x ${row.quantity}: ${why}`);
    assert.equal(priced.checkout_eligible, true, `${row.id} x ${row.quantity} must be buyable`);
  }
});

test('flavours are priced individually, and an unpriced filling stays visible instead of vanishing', async () => {
  const croqueta = find(await get(), 'croqueta');
  // 'croqueta' is the BOX: ten loose croquetas, no sauce, $10.00 — a dollar apiece. The sauced
  // platter is a separate product on its own thirties ladder, deliberately not folded in here.
  assert.equal(croqueta.flavors.ham.from_cents, 100, 'the $10 box of ten is $1.00 a piece');
  assert.equal(croqueta.flavors.chicken.from_cents, 100);
  // Chorizo, sausage and tuna were the fillings the old menu cooked but never published. The
  // 2026-09 ratification prices all six, which is what closed Dayan's own unquotable order.
  assert.equal(croqueta.flavors.sausage.from_cents, 100);
  assert.deepEqual(croqueta.flavors.sausage.packs.map((p) => p.size), [1, 10]);
  assert.ok(croqueta.flavors.sausage.en, 'and it still has a name to show');
});

test('every filling the form offers can be priced — verified against production', async () => {
  // This test used to bolt extra rows onto the fixture, because the fixture lagged what production
  // published. It no longer needs to: the fixture IS the ratified 2026-09 menu, generated from
  // scripts/menu-2026-09/prices.mjs and applied to production on 2026-09-10. Anything asserted
  // here is asserted against the same table the live site reads.
  //
  // The gap this closes is concrete and was Dayan's own order: a 50-piece SAUSAGE croqueta line
  // came back "quoted after review" because the menu cooked that filling and never priced it.
  const menu = { source: 'd1', items };

  // The exact line from that order, at the ratified price: croquetas by the box are $10 for ten.
  const sausage = estimateCateringProducts([{ id: 'croqueta', quantity: 50, flavor: 'sausage' }], menu);
  assert.equal(sausage.subtotal_cents, 5000, '50 sausage croquetas are five $10 boxes');
  assert.equal(sausage.checkout_eligible, true, 'and buyable, not "quoted after review"');
  assert.deepEqual(sausage.items, [{ id: 'catering_croq-sausage-10', qty: 5 }]);

  // Ropa vieja is the one empanada priced apart and must not inherit the ordinary ladder.
  assert.equal(estimateCateringProducts([{ id: 'empanada', quantity: 50, flavor: 'ropa-vieja' }], menu).subtotal_cents, 16500);
  assert.equal(estimateCateringProducts([{ id: 'empanada', quantity: 50, flavor: 'cheese' }], menu).subtotal_cents, 7500);

  // EVERY filling the picker offers must carry a price.
  const data = await get();
  for (const product of ['croqueta', 'empanada']) {
    const entry = data.products.find((p) => p.id === product);
    for (const [key, f] of Object.entries(entry.flavors)) {
      assert.notEqual(f.from_cents, null, `${product} · ${key} has no price`);
      assert.ok(f.packs.length >= 2, `${product} · ${key} should offer a single and trays`);
    }
  }
});

test('a filling with genuinely no published tray is still quoted by a person', async () => {
  // The rule did not change, only the list of what qualifies — the 2026-09 menu prices all six
  // croqueta fillings, so no filling is unpublished today. The rule still has to hold the day one
  // goes off the menu, which is what this builds: sausage with every sausage row taken away.
  const rows = structuredClone(items).filter((x) => !/sausage/.test(x.id));
  const s = estimateCateringProducts([{ id: 'croqueta', quantity: 50, flavor: 'sausage' }], { source: 'd1', items: rows });
  assert.equal(s.checkout_eligible, false, 'nothing may be sold at a price the menu does not publish');
  assert.equal(s.subtotal_cents, 0);
  assert.equal(s.unpriced.length, 1, 'and the line is reported, not dropped');
  assert.equal(s.unpriced[0].flavor, 'sausage', 'named by the filling that could not be priced');
  // The reason code differs by WHY: 'needs_custom_price' when nothing maps the product at all,
  // 'unavailable_exact_quantity' when it maps to SKUs the menu is not currently publishing. Both
  // refuse; the distinction tells whoever is reading whether to add a mapping or a menu row.
  assert.ok(['needs_custom_price', 'unavailable_exact_quantity'].includes(s.unpriced[0].reason));
});

// The check that would have caught both ways this has broken: FLAVOR_FAMILIES.roll spelled its
// fillings 'ham' and 'tuna' while the form spells them 'ham-spread' and 'tuna-spread', so no
// Hawaiian roll could ever be priced; and salami stayed on the form after migration 0100 retired
// it. Neither is visible from a single product's test — only from asking the whole form at once.
test('every product the form lists can be priced, except the bowls and the custom lines', async () => {
  const data = await get();
  // Fit bowls are configured in the bowl editor and refused by this path on purpose; a custom
  // line is by definition unpriced. Everything else the customer can see must carry a price.
  // cajita-custom is custom by id rather than by flag — functions/_lib/catering-products.js
  // special-cases it the same way, because it is the one product whose price is the conversation.
  const exempt = (p) => p.custom || p.addon || /^fit-/.test(p.id) || p.id === 'cajita-custom';
  const unpriced = data.products.filter((p) => !exempt(p) && p.from_cents == null).map((p) => p.id);
  assert.deepEqual(unpriced, [], 'listed on the order form with no published price');

  // And the same rule one level down: a filling the picker offers must resolve to a SKU too.
  const orphanFlavors = [];
  for (const p of data.products) {
    for (const [key, f] of Object.entries(p.flavors || {})) {
      if (f.from_cents == null) orphanFlavors.push(`${p.id}·${key}`);
    }
  }
  assert.deepEqual(orphanFlavors, [], 'offered as a filling but mapped to nothing the menu prices');
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
  assert.deepEqual(yuca.packs.map((p) => p.size), [1, 30, 50],
    'the two withdrawn trays are gone from the window; the two still published stay');
  // $65 for 50 is $1.30 a serving — the cheapest route left once the 10 and the 25 are pulled.
  assert.equal(yuca.from_cents, 130);
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
