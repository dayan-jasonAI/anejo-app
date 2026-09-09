import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateCateringProducts } from '../../functions/_lib/catering-estimate.js';

const catalog = JSON.parse(readFileSync(new URL('../../docs/menu-launch/catalog.json', import.meta.url)));
const menu = () => ({ source: 'd1', items: structuredClone(catalog) });
const estimate = (rows, m = menu(), options) => estimateCateringProducts(rows, m, options);

test('live tray and singles pricing preserves exact quantities at cheapest published price', () => {
  const result = estimate([{ id: 'croqueta', flavor: 'ham', quantity: 76 }]);
  assert.equal(result.subtotal_cents, 7500 + 4000 + 250);
  assert.equal(result.checkout_eligible, true);
  assert.deepEqual(new Map(result.items.map(x => [x.id, x.qty])), new Map([
    ['traditional_croq-jamon', 1], ['catering_croq-jamon-25', 1], ['catering_croq-jamon-50', 1],
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
  for (const row of [{id:'roll',flavor:'ham-spread'}, {id:'tres-leches'}, {id:'cajita-standard'}, {id:'croqueta',flavor:'tuna'}, {id:'empanada',flavor:'beef'}]) {
    const result = estimate([{...row,quantity:1}]);
    assert.equal(result.checkout_eligible, false);
    assert.equal(result.unpriced.length, 1);
  }
  const result = estimate([{id:'lechon',quantity:1,notes:'Change ingredients'}]);
  assert.equal(result.subtotal_cents, 1095);
  assert.equal(result.needs_review, true);
  assert.equal(result.checkout_eligible, false);
  assert.equal(estimate([{id:'lechon',quantity:1}], menu(), {needsReview:true}).checkout_eligible, false);
});

test('invalid selections and invalid prices fail closed; 5000 pieces remain exact', () => {
  for (const rows of [[],null,[{id:'lechon',quantity:0}],[{id:'lechon',quantity:1.5}],[{id:'lechon',quantity:5001}]]) assert.equal(estimate(rows).checkout_eligible, false);
  const m = menu();
  m.items = [{id:'traditional_lechon',kind:'addon',price_cents:NaN}];
  assert.equal(estimate([{id:'lechon',quantity:1}],m).checkout_eligible,false);
  const result = estimate([{id:'croqueta',flavor:'ham',quantity:5000}]);
  assert.deepEqual(result.items,[{id:'catering_croq-jamon-50',qty:100}]);
});

test('Fit IDs map only recognized orderable live bowls', () => {
  const m = {source:'d1',items:[{id:'fuego',kind:'bowl',price_cents:2399}]};
  assert.deepEqual(estimate([{id:'fit-fuego',quantity:2}],m).items,[{id:'fuego',qty:2}]);
  assert.equal(estimate([{id:'fit-invented',quantity:2}],m).checkout_eligible,false);
});
