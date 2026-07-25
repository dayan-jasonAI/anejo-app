// Checkout — per-bowl server-side pricing (priceCustomBowl in functions/api/checkout.js).
//
// This is the function that decides what a customer is charged. The browser sends only a bowl id
// and a mods object; every cent below is computed here. A silent regression is a real money leak
// (or an angry customer), so the exact cents are asserted, not just "greater than base".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCustomBowl } from '../../functions/api/checkout.js';

// VIDA: base $19.99. build = Seared tuna (protein) / Quinoa / Cucumber / Mango / Mixed greens /
// Chia seeds / Mango Omega / Ajo Cítrico. See functions/_lib/bowlspec.js.
const VIDA_BASE = 1999;

test('an unmodified bowl prices at its base and carries no kitchen note', () => {
  const p = priceCustomBowl('vida', {});
  assert.equal(p.error, undefined);
  assert.equal(p.unitCents, VIDA_BASE);
  assert.equal(p.notes, null);
  assert.deepEqual(p.removed, []);
  assert.equal(p.base, null);
  assert.equal(p.avocado, false);
});

test('mods:null and mods:undefined price the same as an empty mods object', () => {
  assert.equal(priceCustomBowl('vida', null).unitCents, VIDA_BASE);
  assert.equal(priceCustomBowl('vida').unitCents, VIDA_BASE);
});

test('every orderable bowl has a base price and a spec', () => {
  for (const key of ['vida', 'fuego', 'ligero', 'mar', 'coco', 'congreen', 'raiz']) {
    const p = priceCustomBowl(key, {});
    assert.equal(p.error, undefined, `${key} must price`);
    assert.ok(p.unitCents >= 1899, `${key} base looks wrong: ${p.unitCents}`);
    assert.ok(p.build.length > 0, `${key} must carry a kitchen build`);
  }
});

test('the FIRST added sauce is free — every additional one is $1.50', () => {
  assert.equal(priceCustomBowl('vida', { sauces: ['Mango Omega'] }).unitCents, VIDA_BASE);
  assert.equal(priceCustomBowl('vida', { sauces: ['Mango Omega', 'Chimichurri Vital'] }).unitCents, VIDA_BASE + 150);
  assert.equal(
    priceCustomBowl('vida', { sauces: ['Mango Omega', 'Chimichurri Vital', 'Golden Turmeric'] }).unitCents,
    VIDA_BASE + 300
  );
});

test('duplicate sauces are collapsed — you cannot be charged twice for the same sauce', () => {
  const p = priceCustomBowl('vida', { sauces: ['Mango Omega', 'Mango Omega', 'Mango Omega'] });
  assert.equal(p.unitCents, VIDA_BASE, 'three of the same sauce is one sauce');
  assert.deepEqual(p.sauces, ['Mango Omega']);
});

test('an unknown sauce is ignored, not charged', () => {
  const p = priceCustomBowl('vida', { sauces: ['Ketchup'] });
  assert.equal(p.unitCents, VIDA_BASE);
  assert.deepEqual(p.sauces, []);
});

test('the sauce note marks which ones cost money', () => {
  const p = priceCustomBowl('vida', { sauces: ['Mango Omega', 'Chimichurri Vital'] });
  assert.match(p.notes, /\+Mango Omega/);
  assert.match(p.notes, /\+Chimichurri Vital \(\$1\.50\)/);
});

test('extra of a PREMIUM ingredient is $3.00, a standard one is $1.50', () => {
  // PREMIUM_RE matches proteins + the pricey adds (tuna, salmon, steak, shrimp, chicken, tofu,
  // avocado, queso, cheese, almond, pecan).
  assert.equal(
    priceCustomBowl('vida', { extras: [{ type: 'ingredient', name: 'Seared tuna' }] }).unitCents,
    VIDA_BASE + 300
  );
  assert.equal(
    priceCustomBowl('vida', { extras: [{ type: 'ingredient', name: 'Cucumber' }] }).unitCents,
    VIDA_BASE + 150
  );
  assert.equal(
    priceCustomBowl('raiz', { extras: [{ type: 'ingredient', name: 'Crispy tofu' }] }).unitCents,
    1899 + 300,
    'tofu is the RAÍZ protein and prices as premium'
  );
  assert.equal(
    priceCustomBowl('congreen', { extras: [{ type: 'ingredient', name: 'Queso fresco' }] }).unitCents,
    2099 + 300,
    'queso is premium'
  );
});

// KNOWN GAP (pins current behaviour, not desired behaviour): PREMIUM_RE lists `almond` and
// `pecan`, but the \b…\b word boundary makes the pattern miss the PLURAL spelling the spec
// actually uses ("Toasted almonds", "Toasted pecans"), so extra almonds bill at the $1.50
// standard rate instead of $3.00. LIGERO is the only live bowl affected (FUERZA is hidden).
// Fixing it is a one-token change in functions/api/checkout.js — `almonds?|pecans?` — outside
// this lane. When that lands, move the assertion below up into the test above.
test('extra almonds currently UNDERCHARGE at the standard rate (PREMIUM_RE misses the plural)', () => {
  assert.equal(
    priceCustomBowl('ligero', { extras: [{ type: 'ingredient', name: 'Toasted almonds' }] }).unitCents,
    1899 + 150,
    'documents a $1.50/bowl undercharge — see the note above'
  );
});

test('extras stack, and stack with paid sauces', () => {
  const p = priceCustomBowl('vida', {
    sauces: ['Mango Omega', 'Chimichurri Vital'],          // +150
    extras: [
      { type: 'ingredient', name: 'Seared tuna' },          // +300
      { type: 'ingredient', name: 'Quinoa' },               // +150
      { type: 'addon', id: 'avocado_half' },                // +200
    ],
  });
  assert.equal(p.unitCents, VIDA_BASE + 150 + 300 + 150 + 200);
  assert.equal(p.avocado, true, 'the kitchen has to know to add the avocado');
});

test('each priced addon charges its catalog price', () => {
  const at = (id) => priceCustomBowl('vida', { extras: [{ type: 'addon', id }] }).unitCents - VIDA_BASE;
  assert.equal(at('avocado_half'), 200);
  assert.equal(at('extra_protein'), 450);
  assert.equal(at('sweet_potato'), 200);
  assert.equal(at('sauce_cup'), 150);
});

test('THE PROTEIN CANNOT BE REMOVED — it is the bowl', () => {
  const p = priceCustomBowl('vida', { removed: ['Seared tuna'] });
  assert.match(p.error, /protein can't be removed/i);
  assert.equal(p.unitCents, undefined, 'a rejected bowl must not price at all');
});

test('a removable ingredient drops out of the kitchen build at no discount', () => {
  const p = priceCustomBowl('vida', { removed: ['Mango'] });
  assert.equal(p.unitCents, VIDA_BASE, 'removals do not reduce the price');
  assert.deepEqual(p.removed, ['Mango']);
  assert.ok(!p.ingredients.includes('Mango'), 'the kitchen build must lose it');
  assert.ok(p.ingredients.includes('Seared tuna'));
  assert.match(p.notes, /no mango/);
});

test('an ingredient that is not on THIS bowl cannot be removed', () => {
  assert.match(priceCustomBowl('vida', { removed: ['Bacon'] }).error, /Can't remove "Bacon"/);
  // On another bowl, but not this one.
  assert.match(priceCustomBowl('vida', { removed: ['Arugula'] }).error, /Can't remove "Arugula"/);
});

test('a non-string removal is rejected rather than coerced', () => {
  assert.match(priceCustomBowl('vida', { removed: [{ item: 'Mango' }] }).error, /Can't remove/);
});

test('an ingredient that is not on THIS bowl cannot be added as an extra', () => {
  // Otherwise the browser could invent an ingredient and be charged only the $1.50 standard rate
  // for something the kitchen never priced.
  assert.match(priceCustomBowl('vida', { extras: [{ type: 'ingredient', name: 'Wagyu' }] }).error, /Can't add extra/);
});

test('an unknown addon id is rejected, not silently free', () => {
  assert.match(priceCustomBowl('vida', { extras: [{ type: 'addon', id: 'gold_leaf' }] }).error, /Invalid extra/);
  assert.match(priceCustomBowl('vida', { extras: [{ type: 'nonsense' }] }).error, /Invalid extra/);
  assert.match(priceCustomBowl('vida', { extras: [null] }).error, /Invalid extra/);
});

test('unknown and hidden bowls are refused', () => {
  assert.match(priceCustomBowl('lobster', {}).error, /Unknown bowl/);
  assert.match(priceCustomBowl('fuerza', {}).error, /Unknown bowl/, 'FUERZA is spec-only, not on the site');
  assert.match(priceCustomBowl('', {}).error, /Unknown bowl/);
  assert.match(priceCustomBowl(undefined, {}).error, /Unknown bowl/);
});

test('the brown-rice base swap is free and reaches the kitchen note', () => {
  const p = priceCustomBowl('vida', { base: 'brown_rice' });
  assert.equal(p.unitCents, VIDA_BASE);
  assert.equal(p.base, 'brown_rice');
  assert.match(p.notes, /brown rice/);
});

test('extras are capped at 12 so a scripted cart cannot build an unbounded ticket', () => {
  const extras = Array.from({ length: 30 }, () => ({ type: 'addon', id: 'sauce_cup' }));
  assert.equal(priceCustomBowl('vida', { extras }).unitCents, VIDA_BASE + 12 * 150);
});
