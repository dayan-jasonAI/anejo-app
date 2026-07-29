// Marking an item sold out / out of stock / coming soon.
//
// The whole risk is one sentence: A BADGE IS NOT A GUARD. checkout accepts whatever item ids are
// in the request body, so a cart built before the owner flipped the switch, a tab left open, the
// 60-second menu cache, or a hand-crafted POST all arrive after the badge appeared. If the only
// change were on the order page, the bowl would still sell — and the kitchen would find out when
// the ticket printed.
//
// The second risk is the opposite failure: a sold-out state that fails CLOSED when D1 is
// unreachable would take the entire storefront off sale over one missing column.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { priceCustomBowl } from '../../functions/api/checkout.js';
import { AVAILABILITY, AVAILABILITY_KEYS, availabilityOf, isAvailable, isOrderable, publicCatalog } from '../../functions/_lib/menu.js';

const MIG = readFileSync(new URL('../../migrations/0059_menu_availability.sql', import.meta.url), 'utf8');
const CHECKOUT = readFileSync(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');
const ORDER = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
const HUBAPI = readFileSync(new URL('../../functions/api/hub/owner/menu.js', import.meta.url), 'utf8');

// A menu shaped the way loadMenu returns one: VIDA is off, MAR is on.
// `modifiers` is deliberately omitted so priceCustomBowl falls back to its own constants — an
// empty object here is TRUTHY and would blank every extra price, which is a broken fixture rather
// than a realistic menu (loadMenu always spreads FALLBACK_MODIFIERS into it).
const MENU = {
  bowls: { vida: 2299, mar: 2499 },
  nonBowls: {},
  availability: { vida: 'sold_out', mar: 'available' },
  source: 'd1',
};

// ---------- the guard, not the badge ----------

test('a sold-out bowl CANNOT be bought, even with a valid cart', () => {
  const r = priceCustomBowl('vida', {}, MENU);
  assert.ok(r.error, 'it must not price');
  assert.equal(r.unavailable, true);
});

test('an available bowl is untouched', () => {
  const r = priceCustomBowl('mar', {}, MENU);
  assert.equal(r.error, undefined);
  assert.ok(r.unitCents >= 1899);
});

test('the refusal NAMES the bowl and the reason', () => {
  // "Unknown bowl: vida" would be a lie — it is a real bowl. Whoever reads this (a customer, or
  // Dayan reading a support message) should not have to guess whether it is a typo or the kitchen.
  const r = priceCustomBowl('vida', {}, MENU);
  assert.match(r.error, /VIDA/);
  assert.match(r.error, /sold out/i);
  assert.ok(!/Unknown bowl/.test(r.error));
});

test('every non-available state blocks the sale', () => {
  // Four labels, one behaviour. A state that reads as unavailable but sells is the worst outcome.
  for (const state of AVAILABILITY_KEYS.filter((k) => k !== 'available')) {
    const menu = { ...MENU, availability: { vida: state } };
    assert.ok(priceCustomBowl('vida', {}, menu).error, `${state} must block`);
  }
  assert.equal(AVAILABILITY.available.sells, true);
});

test('an unrecognised value is treated as UNAVAILABLE, never as sellable', () => {
  // Garbage in the column, a half-finished migration, a typo in a manual UPDATE — none of them
  // may resolve to "on sale".
  assert.equal(availabilityOf({ availability: 'sould_out' }), 'unavailable');
  assert.equal(isAvailable({ availability: 'sould_out' }), false);
  assert.ok(priceCustomBowl('vida', {}, { ...MENU, availability: { vida: 'nonsense' } }).error);
});

test('drinks and add-ons are guarded too, not just bowls', () => {
  assert.match(CHECKOUT, /const av = \(menu\.availability && menu\.availability\[it\.id\]\) \|\| 'available'/);
  assert.match(CHECKOUT, /is \$\{label\} right now — please remove it from your order/);
});

// ---------- it must fail OPEN, not closed ----------

test('with no availability data at all, everything still sells', () => {
  // Unit tests, and more importantly the D1-unreachable fallback. A missing column must not take
  // the storefront off sale.
  assert.equal(priceCustomBowl('vida', {}).error, undefined, 'no pricing arg at all');
  assert.equal(priceCustomBowl('vida', {}, { bowls: { vida: 2299 } }).error, undefined, 'pricing with no availability map');
  assert.equal(isAvailable({}), true);
  assert.equal(isAvailable({ availability: null }), true);
});

// ---------- it is a SEPARATE axis from active and from orderable ----------

test('availability is its own column, not a reuse of active', () => {
  // loadMenu queries WHERE active = 1, so setting active=0 removes the row from /api/menu — the
  // bowl vanishes instead of greying out, and the customer cannot tell "we stopped making it"
  // from "it ran out this morning".
  assert.match(MIG, /ALTER TABLE menu_items ADD COLUMN availability TEXT NOT NULL DEFAULT 'available'/);
  assert.ok(!/ALTER TABLE menu_items[\s\S]*DROP/.test(MIG), 'active is left alone');
});

test('sold out does not mean "can\'t be bought" — they need different fixes', () => {
  // orderable = no recipe exists, needs a developer. availability = the kitchen ran out, needs a
  // dropdown. Collapsing them would send the owner to the wrong one.
  const soldOutButValid = { kind: 'bowl', id: 'vida', availability: 'sold_out' };
  assert.equal(isOrderable(soldOutButValid), true, 'it still has a recipe');
  assert.equal(isAvailable(soldOutButValid), false, 'it is just not on sale');
});

test('a sold-out item is still LISTED, with its label', () => {
  // The point of the feature: visible and greyed, not gone.
  const cat = publicCatalog({
    items: [{ id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 2299, availability: 'sold_out' }],
    modifiers: {},
  });
  assert.equal(cat.bowls.length, 1, 'still advertised');
  assert.equal(cat.bowls[0].available, false);
  assert.equal(cat.bowls[0].availability_label, 'Sold out');
  assert.equal(cat.bowls[0].availability_label_es, 'Agotado');
});

// ---------- the storefront ----------

test('the order page blocks the add control, not just the badge', () => {
  // The badge alone leaves "Add another" live on a bowl already in the cart.
  assert.match(ORDER, /function isOffMenu\(idv\)\{ const it = PRICE\[idv\]; return !!\(it && it\.available === false\); \}/);
  assert.match(ORDER, /function maxFor\(idv\)\{ if\(isOffMenu\(idv\)\) return 0;/);
});

test('a sold-out state is shown for scheduled orders too, not only same-day', () => {
  // The existing sold-out UI was gated on mode==='ondemand' because it meant the daily production
  // cap. An owner-set state applies to next Tuesday as much as to today.
  assert.match(ORDER, /const offMenu = i\.available === false;/);
  assert.match(ORDER, /const soldOut = offMenu \|\| \(onD && bowl && avail && rem<=0\);/);
});

test('a stale cart drops the item rather than failing at the till', () => {
  assert.match(ORDER, /const gone = \(k\) => !PRICE\[k\] \|\| PRICE\[k\]\.available === false;/);
});

// ---------- the HUB ----------

test('a bad availability value is rejected, not coerced', () => {
  // Coercing a typo to 'available' would put a bowl the owner meant to 86 back on sale.
  assert.match(HUBAPI, /if \(!AVAILABILITY_KEYS\.includes\(v\)\) errors\.push/);
});

test('taking an item off sale is written to the price log', () => {
  // "When did VIDA come off sale, and who did it?" is the same question the log already answers
  // for prices.
  assert.match(HUBAPI, /'availability:' \+ \(next\.availability \|\| 'available'\)/);
});

test('the UPDATE actually persists the column', () => {
  assert.match(HUBAPI, /UPDATE menu_items SET name=\?, name_es=\?, price_cents=\?, description=\?, description_es=\?,\s*image=\?, sort=\?, active=\?, availability=\?/);
});

// ---------- the HUB page must not swallow fields the API adds ----------

test('the menu page does not rebuild `data` with a hand-listed set of fields', () => {
  // It did, and that is how the availability dropdown shipped with only "Available" in it: the API
  // returned availability_options, both assignment sites listed fields explicitly, and the new one
  // was dropped on the floor. Spreading the response means the next field the server grows shows
  // up without a second edit here. (The campaigns page had the identical bug.)
  const PAGE = readFileSync(new URL('../../public/hub/owner/menu.html', import.meta.url), 'utf8');
  // Only assignments FROM a response — the initial `var data = { items: [] ... }` empty state has
  // nothing to spread and is not the bug.
  const assigns = PAGE.match(/data = \{[^}]*d\.items/g) || [];
  assert.ok(assigns.length >= 2, 'both the save path and the load path assign data');
  for (const a of assigns) assert.match(a, /\.\.\.d/, 'every assignment spreads the response');
});

test('the availability dropdown never degrades to a single option', () => {
  // A one-choice dropdown reads as "this feature does not exist", not as "data failed to load".
  const PAGE = readFileSync(new URL('../../public/hub/owner/menu.html', import.meta.url), 'utf8');
  const i = PAGE.indexOf('data.availability_options');
  const fallback = PAGE.slice(i, i + 500);
  for (const k of ['sold_out', 'out_of_stock', 'unavailable', 'coming_soon']) {
    assert.ok(fallback.includes(k), `${k} is in the hardcoded fallback too`);
  }
});

// ---------- manual per-item counts ----------
//
// A count is a CEILING FOR TODAY, not a stored running tally. What is left is derived as
// (count − sold today) from the orders table. A number that decremented on each sale would have
// to be reconciled against cancellations, refunds, expired pending checkouts and re-counts, and
// every one of those is a way for the shelf number to drift without anyone noticing.

const ONDEMAND = readFileSync(new URL('../../functions/_lib/ondemand.js', import.meta.url), 'utf8');
const INVAPI = readFileSync(new URL('../../functions/api/hub/kitchen/inventory.js', import.meta.url), 'utf8');
const MIG60 = readFileSync(new URL('../../migrations/0060_menu_stock_count.sql', import.meta.url), 'utf8');

test('a manual count overrides the global daily throttle, in both directions', () => {
  // The owner saying "I made 6" beats a launch default of 10 — and "I made 30" does too.
  assert.match(ONDEMAND, /remaining\[id\] = stock\[id\] != null \? stock\[id\] : limit/);
});

test('a count brings a DRINK into the cap, which is otherwise uncapped', () => {
  assert.match(ONDEMAND, /for \(const id of Object\.keys\(stock\)\) if \(remaining\[id\] == null\) remaining\[id\] = stock\[id\]/);
});

test('checkout tallies what is actually capped, not a hardcoded bowl list', () => {
  // The old tally used ondemand.BOWL_IDS, so a bowl added in the HUB was silently uncapped — and
  // it would now also miss a drink the owner had put a count on.
  assert.match(CHECKOUT, /for \(const it of orderItems\) if \(remaining\[it\.id\] != null\)/);
  assert.ok(!/BOWL_IDS/.test(CHECKOUT), 'the hardcoded list is gone from checkout entirely');
});

test('the cap message names a drink as a drink, not as a bowl', () => {
  // "Gold Vitality Bowl" would read as us having lost track of our own menu.
  assert.match(CHECKOUT, /const isBowl = menu\.bowls\[itemId\] != null;/);
});

test('blank means NO LIMIT and zero means NONE LEFT — never conflated', () => {
  // Collapsing them would take an uncapped drink off sale the moment the column existed, or put a
  // sold-out item back on sale when someone cleared the box.
  assert.match(MIG60, /NULL means "no manual count"/);
  assert.match(HUBAPI, /if \(raw === '' \|\| raw == null\) next\.stock_count = null;/);
  assert.match(INVAPI, /if \(raw !== '' && raw != null\)/);
});

test('what is LEFT is derived, never stored', () => {
  // The whole reason a count cannot drift.
  assert.ok(!/stock_count\s*=\s*stock_count\s*-/.test(INVAPI), 'nothing decrements the stored count');
  assert.ok(!/UPDATE menu_items SET stock_count=stock_count/.test(CHECKOUT), 'checkout never writes it back');
  assert.match(INVAPI, /remaining: remaining && remaining\[it\.id\] != null \? remaining\[it\.id\] : null/);
});

test('the kitchen can set counts from the inventory page', () => {
  assert.match(INVAPI, /action === 'menu_count'/);
  assert.match(INVAPI, /UPDATE menu_items SET stock_count=\?, updated_at=\? WHERE id=\?/);
  const INVPAGE = readFileSync(new URL('../../public/hub/kitchen/inventory.html', import.meta.url), 'utf8');
  assert.match(INVPAGE, /Ready to sell today/);
  assert.match(INVPAGE, /action: 'menu_count'/);
});

test('finished items and ingredients are kept distinct', () => {
  // inventory_items is POUNDS OF TUNA; menu_items.stock_count is BOWLS MADE. There is no recipe
  // deduction between them, and the code says so rather than letting someone assume there is.
  assert.match(INVAPI, /no recipe deduction exists, so making a\s*\/\/\s*bowl does not draw down tuna/);
});
