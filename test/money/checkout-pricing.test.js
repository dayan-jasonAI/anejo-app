// Checkout — per-bowl server-side pricing (priceCustomBowl in functions/api/checkout.js).
//
// This is the function that decides what a customer is charged. The browser sends only a bowl id
// and a mods object; every cent below is computed here. A silent regression is a real money leak
// (or an angry customer), so the exact cents are asserted, not just "greater than base".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCustomBowl } from '../../functions/api/checkout.js';
import { FALLBACK_BOWLS } from '../../functions/_lib/menu.js';

// VIDA build = Seared tuna (protein) / Quinoa / Cucumber / Mango / Mixed greens / Chia seeds /
// Mango Omega / Ajo Cítrico. See functions/_lib/bowlspec.js.
//
// DERIVED, NEVER RETYPED. This was `const VIDA_BASE = 1999`, and it quietly went stale: the owner
// repriced VIDA to $22.99 from the HUB, checkout followed (it resolves through loadMenu/D1), and
// this suite carried on asserting $19.99 and passing — a green test pinning a price the business
// had stopped charging. Reading the shared constant means the base can only ever be wrong here if
// it is wrong everywhere, and `npm run verify:live` is what checks THAT against live D1.
// The arithmetic below (base + extras) is what this file actually exists to prove, and it holds
// at any base.
const VIDA_BASE = FALLBACK_BOWLS.vida;

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
    FALLBACK_BOWLS.raiz + 300,
    'tofu is the RAÍZ protein and prices as premium'
  );
  assert.equal(
    priceCustomBowl('congreen', { extras: [{ type: 'ingredient', name: 'Queso fresco' }] }).unitCents,
    FALLBACK_BOWLS.congreen + 300,
    'queso is premium'
  );
});

// Regression: PREMIUM_RE originally listed only the SINGULAR `almond`/`pecan`, and \b…\b made it
// miss the plural spelling bowlspec actually ships ("Toasted almonds"), so extra almonds billed at
// the $1.50 standard rate instead of $3.00 — a live undercharge on LIGERO.
test('extra almonds bill at the PREMIUM rate (plural must match)', () => {
  assert.equal(
    priceCustomBowl('ligero', { extras: [{ type: 'ingredient', name: 'Toasted almonds' }] }).unitCents,
    FALLBACK_BOWLS.ligero + 300
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
