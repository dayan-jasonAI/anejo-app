import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateCateringProducts } from '../../functions/_lib/catering-estimate.js';

const catalog = JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url)));
const menu = () => ({ source: 'd1', items: structuredClone(catalog) });
const estimate = (rows, m = menu(), options) => estimateCateringProducts(rows, m, options);

test('live tray and singles pricing preserves exact quantities at cheapest published price', () => {
  // 76 ham croquetas. The 2026-09 menu sells the plain croqueta in boxes of ten at $10 and
  // singles at $1.50, so the only exact route to 76 is seven boxes and six singles — $79.00.
  // (The 30/60/90 platters are a DIFFERENT product and must not be substituted in here; if they
  // ever were, this would come back as two platters plus change and cost the customer more.)
  const result = estimate([{ id: 'croqueta', flavor: 'ham', quantity: 76 }]);
  assert.equal(result.subtotal_cents, 7 * 1000 + 6 * 150);
  assert.equal(result.checkout_eligible, true);
  assert.deepEqual(new Map(result.items.map(x => [x.id, x.qty])), new Map([
    ['traditional_croq-jamon', 6], ['catering_croq-jamon-10', 7],
  ]));
});

test('prices come from current menu, not the catalog fixture or hardcoded fallback', () => {
  const m = menu();
  m.items.find(x => x.id === 'traditional_lechon').price_cents = 100;
  assert.equal(estimate([{ id: 'lechon', quantity: 25 }], m).subtotal_cents, 2500);
  assert.equal(estimate([{ id: 'lechon', quantity: 1 }], { ...m, source: 'fallback' }).checkout_eligible, false);
});

test('duplicate identical flavor rows aggregate without overselling stock', () => {
  const m = menu();
  m.items = m.items.filter(x => x.id === 'traditional_croq-jamon');
  m.stock = { 'traditional_croq-jamon': 2 };
  assert.equal(estimate([{ id: 'croqueta', flavor: 'ham', quantity: 2 }, { id: 'croqueta', flavor: 'ham', quantity: 1 }], m).checkout_eligible, false);
});

test('out of stock packs can use exact available alternatives, never a fallback or excess quantity', () => {
  const m = menu();
  m.items = m.items.filter(x => x.id === 'catering_emp-guava-25');
  assert.equal(estimate([{ id: 'empanada', flavor: 'guava-cheese', quantity: 26 }], m).subtotal_cents, 0);
  assert.equal(estimate([{ id: 'empanada', flavor: 'guava-cheese', quantity: 25 }], m).checkout_eligible, true);
  m.items[0].availability = 'sold_out';
  assert.equal(estimate([{ id: 'empanada', flavor: 'guava-cheese', quantity: 25 }], m).checkout_eligible, false);
});

test('bespoke notes, missing price equivalence and unknown flavors never silently enter checkout', () => {
  // cajita-standard, tuna croquetas and beef empanadas USED to be here. The 2026-09 menu
  // publishes all three, so they are priced now — that is the menu doing its job. What must
  // still refuse: a flavour nobody sells, a product with no mapping, and the bespoke cajita.
  for (const row of [{id:'roll',flavor:'ham-spread'}, {id:'tres-leches'}, {id:'cajita-custom'},
                     {id:'croqueta',flavor:'lobster'}, {id:'empanada',flavor:'nutella'}]) {
    const result = estimate([{...row,quantity:1}]);
    assert.equal(result.checkout_eligible, false);
    assert.equal(result.unpriced.length, 1);
  }
  // A NOTED LINE IS NOW EXCLUDED FROM THE CART RATHER THAN REFUSING THE WHOLE ORDER (2026-09-09).
  // Someone who wrote "change ingredients" must never be charged for the standard item — that is
  // the guarantee this test was written for, and it is stronger now: the line is not in `items`
  // at all, so there is no path by which it could be sold. It keeps an indicative price so the
  // Hub can suggest a number instead of showing an empty box.
  const result = estimate([{id:'lechon',quantity:1,notes:'Change ingredients'}]);
  assert.equal(result.subtotal_cents, 0, 'a noted line is not sellable food');
  assert.deepEqual(result.items, [], 'and can never reach the checkout cart');
  assert.equal(result.needs_review, true);
  assert.equal(result.checkout_eligible, false, 'nothing else in this order was priced');
  assert.equal(result.unpriced[0].reason, 'custom_request');
  assert.equal(result.unpriced[0].indicative_cents, 650, 'the Hub still gets a starting number');

  // The same note alongside a clean line sells the clean one and holds the noted one back.
  const mixed = estimate([{id:'lechon',quantity:2}, {id:'lechon',quantity:1,notes:'no salt'}]);
  assert.equal(mixed.checkout_eligible, true);
  assert.equal(mixed.subtotal_cents, 1300, 'two plain servings, not three');
  assert.equal(mixed.unpriced.length, 1);

  // An event-level design request no longer withholds the food price.
  assert.equal(estimate([{id:'lechon',quantity:1}], menu(), {needsReview:true}).checkout_eligible, true);
});

test('invalid selections and invalid prices fail closed; 5000 pieces remain exact', () => {
  for (const rows of [[],null,[{id:'lechon',quantity:0}],[{id:'lechon',quantity:1.5}],[{id:'lechon',quantity:5001}]]) assert.equal(estimate(rows).checkout_eligible, false);
  const m = menu();
  m.items = [{id:'traditional_lechon',kind:'addon',price_cents:NaN}];
  assert.equal(estimate([{id:'lechon',quantity:1}],m).checkout_eligible,false);
  const result = estimate([{id:'croqueta',flavor:'ham',quantity:5000}]);
  assert.deepEqual(result.items,[{id:'catering_croq-jamon-10',qty:500}]);
});

test('Fit IDs map only recognized orderable live bowls', () => {
  const m = {source:'d1',items:[{id:'fuego',kind:'bowl',price_cents:2399}]};
  assert.deepEqual(estimate([{id:'fit-fuego',quantity:2}],m).items,[{id:'fuego',qty:2}]);
  assert.equal(estimate([{id:'fit-invented',quantity:2}],m).checkout_eligible,false);
});
