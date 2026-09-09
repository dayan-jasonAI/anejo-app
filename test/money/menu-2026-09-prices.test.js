// The ratified 2026-09 menu price table.
//
// Dayan dictated the whole menu on 2026-09-09 and then answered fifteen follow-up questions to
// resolve what the dictation left ambiguous. scripts/menu-2026-09/prices.mjs is the result, and
// migrations/0100_menu_2026_09.sql is generated from it — never hand-edited.
//
// THE PROPERTY THAT MATTERS. The quote engine prices a quantity with cheapestExact(), a bounded
// knapsack over the tray sizes. So a tray that costs more per piece than a combination of smaller
// trays CAN NEVER BE SELECTED. It is not a cosmetic wrinkle; it is a SKU that will never sell one
// unit, and nobody would notice for months. Two of Dayan's own ladders had this before the
// generator's checker caught them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PRODUCTS, RETIRE, FLAVORS } from '../../scripts/menu-2026-09/prices.mjs';

const SQL = readFileSync(new URL('../../migrations/0100_menu_2026_09.sql', import.meta.url), 'utf8');

function cheapestExact(want, packs) {
  const best = new Array(want + 1).fill(Infinity);
  best[0] = 0;
  for (let n = 1; n <= want; n++) {
    for (const [size, cents] of packs) if (size <= n) best[n] = Math.min(best[n], best[n - size] + cents);
  }
  return best[want];
}

test('no tray in the menu is unsellable', () => {
  for (const p of PRODUCTS) {
    for (let i = 0; i < p.trays.length; i++) {
      const [size, cents] = p.trays[i];
      const smaller = p.trays.slice(0, i);
      if (!smaller.length) continue;
      const alt = cheapestExact(size, smaller);
      assert.ok(alt >= cents,
        `${p.key}: the ${size}-count is $${(cents / 100).toFixed(2)} but $${(alt / 100).toFixed(2)} of ` +
        `smaller trays buys the same quantity — the engine would never pick this tray`);
    }
  }
});

test('the generator agrees — running its own checker passes', () => {
  // Belt and braces: the check that gates generation is executed here too, so CI fails on a bad
  // edit even if someone changes the test's copy of the rule.
  const out = execFileSync('node', ['scripts/menu-2026-09/generate.mjs', '--check'],
    { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8' });
  assert.match(out, /no tray in the table is unsellable/);
});

test('every price is a whole number of cents', () => {
  for (const p of PRODUCTS) {
    if (p.single != null) assert.ok(Number.isInteger(p.single), `${p.key} single`);
    for (const [size, cents] of p.trays) {
      assert.ok(Number.isInteger(cents), `${p.key}/${size} is not an integer`);
      assert.ok(cents > 0, `${p.key}/${size} must be positive`);
    }
  }
});

// ---------------------------------------------------------------- Dayan's answers, pinned

test('croquetas are two products, so three boxes never undercut a platter', () => {
  // D1. He gave both "ten croquetas is ten dollars" and "thirty at a time, $35 per tray". As one
  // ladder those cannot coexist — 3 × $10 beats $35 and the platter dies. They are two families:
  // a box with no sauce, and a platter plated with the sauces between them.
  const box = PRODUCTS.find((p) => p.key === 'croq-box');
  const platter = PRODUCTS.find((p) => p.key === 'croq-platter');
  assert.deepEqual(box.trays, [[10, 1000]]);
  assert.deepEqual(platter.trays, [[30, 3500], [60, 7000], [90, 10500]]);
  assert.notEqual(box.base, platter.base, 'different SKU bases, so the engine cannot substitute');
  assert.match(box.note, /no sauce/);
  assert.match(platter.note, /sauces/);
});

test('the answers to D2–D6 are the numbers in the table', () => {
  const at = (key, size) => PRODUCTS.find((p) => p.key === key).trays.find(([s]) => s === size)[1];
  assert.equal(at('lechon', 50), 16000, 'D2: $160, not $175');
  assert.equal(at('yuca', 10), 3000, 'D3: $30 is the floor he will sell a tray at');
  assert.equal(at('empB', 25), 6000, 'D4: clean $60');
  assert.equal(at('empB', 50), 11000, 'D4: clean $110');
  assert.equal(at('skewer', 25), 6500, 'D5: raised from $55 to $65');
  assert.deepEqual(PRODUCTS.find((p) => p.key === 'verde').trays, [[10, 3000], [25, 4500], [50, 6000]], 'D6');
});

test('D12: congrí and yuca keep their 30-count trays', () => {
  for (const key of ['congri', 'yuca']) {
    const sizes = PRODUCTS.find((p) => p.key === key).trays.map(([s]) => s);
    assert.deepEqual(sizes, [10, 25, 30, 50], `${key} keeps the 30`);
  }
});

test('D15: the three empanada flavours he asked to keep are still on the menu', () => {
  for (const f of ['ham-cheese', 'guava-only']) {
    assert.ok(FLAVORS.empanadaA.includes(f), `${f} must survive`);
    assert.ok(!RETIRE.some((id) => id.includes(`emp-${f}`)), `${f} must not be retired`);
  }
  assert.ok(PRODUCTS.some((p) => p.key === 'empRopa'), 'ropa vieja keeps its own priced product');
  assert.ok(!RETIRE.some((id) => id.includes('ropa-vieja')));
});

test('D8: tostones are priced per piece, in two tiers', () => {
  assert.deepEqual(FLAVORS.tostonesA, ['cheese', 'ham'], '$2.50 tier');
  assert.ok(FLAVORS.tostonesB.includes('lechon'), 'lechón was kept, not retired');
  assert.ok(FLAVORS.tostonesB.includes('shrimp') && FLAVORS.tostonesB.includes('ropa-vieja'));
  assert.match(SQL, /traditional_tostones-cheese[\s\S]{0,200}?250/);
});

// ---------------------------------------------------------------- the migration itself

test('D13: every combo is retired, and retirement never deletes', () => {
  for (const combo of ['catering_combo-bites75', 'catering_combo-bites150', 'catering_combo-table10',
                       'catering_combo-table25', 'catering_combo-table50', 'catering_combo-dessert24',
                       'catering_combo-tamal-croq', 'traditional_combo-bites-snack']) {
    assert.ok(RETIRE.includes(combo), `${combo} must retire`);
    assert.match(SQL, new RegExp(`UPDATE menu_items SET active=0[^;]*'${combo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`),
      `${combo} must be deactivated in the migration`);
  }
  assert.ok(!/\bDELETE\s+FROM\s+menu_items\b/i.test(SQL),
    'a deleted row leaves every past order that contains it pointing at nothing');
});

test('the migration is idempotent — applying it twice changes nothing', () => {
  const inserts = SQL.match(/INSERT INTO menu_items/g) || [];
  const upserts = SQL.match(/ON CONFLICT\(id\) DO UPDATE/g) || [];
  assert.equal(inserts.length, upserts.length, 'every insert must be an upsert');
  assert.ok((SQL.match(/INSERT OR IGNORE INTO menu_price_log/g) || []).length > 100,
    'audit rows must not duplicate on a re-run');
});

test('every price change leaves an audit row', () => {
  // menu_price_log is how "who dropped lechón to $50, and when" gets answered later.
  assert.match(SQL, /Dayan ratified menu 2026-09-09/);
  const items = new Set([...SQL.matchAll(/WHERE id='([^']+)'/g)].map((m) => m[1]));
  const logged = new Set([...SQL.matchAll(/VALUES \('m2609-(?:retire-)?([^']+)'/g)].map((m) => m[1]));
  for (const id of items) assert.ok(logged.has(id), `${id} changed with no audit row`);
});

test('a rollback exists and restores the prices that were live', () => {
  const rb = readFileSync(new URL('../../scripts/menu-2026-09/rollback.sql', import.meta.url), 'utf8');
  assert.match(rb, /catering_lechon-25[^;]*/);
  assert.match(rb, /price_cents=24000/, 'the lechón tray goes back to $240.00');
  // Match a real statement, not the word in the file's own comment explaining why it deletes nothing.
  assert.ok(!/\bDELETE\s+FROM\b/i.test(rb), 'a rollback must not delete rows either');
  const before = JSON.parse(readFileSync(new URL('../../scripts/menu-2026-09/before.json', import.meta.url), 'utf8'));
  assert.equal(before.rows.length, 144, 'the snapshot must cover every SKU that was live');
  assert.match(before.read_from, /production D1/);
});
