// Meal-plan rotation bowl sold out → the kitchen ticket must say so.
//
// This is deliberately NOT the same guard as menu-availability.test.js (priceCustomBowl). That
// guard stops a NEW purchase before money changes hands. This one runs AFTER the money already
// changed hands: a subscription delivery is a paid, already-committed ticket, and by the time the
// kitchen reads it the rotation bowl it promised may have sold out same-day. There is no "reject
// the order" move available anymore — the order already happened. The only honest response is to
// say so, loudly, and let a person decide. No auto-substitution: this function never picks a
// replacement bowl, and the order must never disappear from the board for being sold out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rotationBowlSoldOut, planRotationWarnings } from '../../functions/_lib/menu.js';

const ORDERS_API = readFileSync(new URL('../../functions/api/hub/kitchen/orders.js', import.meta.url), 'utf8');
const BOARD_HTML = readFileSync(new URL('../../public/hub/kitchen/index.html', import.meta.url), 'utf8');

// A menu shaped the way loadMenu() returns one: VIDA is 86'd, FUEGO ran out today (count = 0),
// LIGERO has a count but is not exhausted, MAR is untouched (no availability/stock data at all).
const MENU = {
  availability: { vida: 'sold_out', fuego: 'available', ligero: 'available' },
  stock: { fuego: 0, ligero: 4 },
};

// ---------- rotationBowlSoldOut: the two signals, one at a time ----------

test('an availability state other than available is sold out', () => {
  assert.equal(rotationBowlSoldOut(MENU, 'vida'), 'availability');
});

test('every non-available state reports the same reason', () => {
  for (const state of ['sold_out', 'out_of_stock', 'unavailable', 'coming_soon']) {
    assert.equal(rotationBowlSoldOut({ availability: { x: state } }, 'x'), 'availability', state);
  }
});

test('a manual count at zero is sold out even when the dropdown still says available', () => {
  assert.equal(rotationBowlSoldOut(MENU, 'fuego'), 'stock');
});

test('a manual count above zero is not sold out', () => {
  assert.equal(rotationBowlSoldOut(MENU, 'ligero'), null);
});

test('no availability or stock data at all reads as UNKNOWN, not sold out', () => {
  // MAR is a real, active bowl — it simply has never had either column touched.
  assert.equal(rotationBowlSoldOut(MENU, 'mar'), null);
});

test('a bowl id absent from the loaded menu entirely is UNKNOWN, not sold out', () => {
  // Covers a deleted item, a stale rotation referencing a bowl no longer on the menu, and the
  // loadMenu() fallback shape (no availability/stock maps at all when D1 is unreachable).
  assert.equal(rotationBowlSoldOut({}, 'vida'), null);
  assert.equal(rotationBowlSoldOut({ availability: {}, stock: {} }, 'vida'), null);
  assert.equal(rotationBowlSoldOut(null, 'vida'), null);
});

// ---------- planRotationWarnings: what actually reaches the ticket ----------

test('a sold-out rotation bowl warns, naming the bowl', () => {
  const items = [{ id: 'bowl_vida', name: 'VIDA Bowl', qty: 1 }];
  const warnings = planRotationWarnings(items, MENU);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].bowl, 'VIDA Bowl');
  assert.equal(warnings[0].reason, 'availability');
  assert.match(warnings[0].label, /sold out/i);
});

test('an in-stock rotation bowl is silent', () => {
  const items = [{ id: 'bowl_ligero', name: 'LIGERO Bowl', qty: 2 }];
  assert.deepEqual(planRotationWarnings(items, MENU), []);
});

test('unknown / never-tracked availability is silent, not a false alarm', () => {
  const items = [{ id: 'bowl_mar', name: 'MAR Bowl', qty: 1 }];
  assert.deepEqual(planRotationWarnings(items, MENU), []);
});

test('multiple sold-out bowls on one ticket are each named', () => {
  const items = [
    { id: 'bowl_vida', name: 'VIDA Bowl', qty: 1 },
    { id: 'bowl_fuego', name: 'FUEGO Bowl', qty: 1 },
    { id: 'bowl_ligero', name: 'LIGERO Bowl', qty: 1 }, // in stock — must NOT show up
  ];
  const warnings = planRotationWarnings(items, MENU);
  assert.equal(warnings.length, 2);
  const bowls = warnings.map((w) => w.bowl).sort();
  assert.deepEqual(bowls, ['FUEGO Bowl', 'VIDA Bowl']);
  const reasons = Object.fromEntries(warnings.map((w) => [w.bowl, w.reason]));
  assert.equal(reasons['VIDA Bowl'], 'availability');
  assert.equal(reasons['FUEGO Bowl'], 'stock');
});

test('an à-la-carte item never triggers the plan warning, even if sold out', () => {
  // checkout.js prices an à-la-carte bowl with the bare menu id ('vida'), never 'bowl_vida'.
  // Sold-out à-la-carte items are handled entirely by priceCustomBowl (menu-availability.test.js)
  // before the order can even be created — this function must stay silent on that shape.
  const items = [{ id: 'vida', name: 'VIDA Bowl', qty: 1 }];
  assert.deepEqual(planRotationWarnings(items, MENU), []);
});

test('a rotation-less plan line ("Weekly plan — N bowls") has no specific bowl to warn about', () => {
  const items = [{ id: 'sub', name: 'Weekly plan — 5 bowls', qty: 1 }];
  assert.deepEqual(planRotationWarnings(items, MENU), []);
});

test('empty / malformed items never throw', () => {
  assert.deepEqual(planRotationWarnings([], MENU), []);
  assert.deepEqual(planRotationWarnings(null, MENU), []);
  assert.deepEqual(planRotationWarnings([null, {}, { id: 42 }], MENU), []);
});

// ---------- wiring: the board actually calls this, live, per request ----------

test('the kitchen orders endpoint computes warnings fresh from the current menu, not at ticket creation', () => {
  assert.match(ORDERS_API, /import \{ loadMenu, planRotationWarnings \} from '\.\.\/\.\.\/\.\.\/_lib\/menu\.js'/);
  assert.match(ORDERS_API, /const menu = await loadMenu\(env\);/);
  assert.match(ORDERS_API, /rotation_warnings: planRotationWarnings\(items, menu\)/);
});

test('the board renders the warning and never gates the ticket on it', () => {
  assert.match(BOARD_HTML, /function rotationWarn\(o\)/);
  assert.match(BOARD_HTML, /o\.rotation_warnings/);
  // The warning is concatenated alongside the existing allergy alert and the item body — never
  // wrapped in a condition that could hide the card, disable "Start prep", or skip the actions.
  assert.match(BOARD_HTML, /allerg \+ rotWarn \+\s*\n\s*body \+ actions/);
});
