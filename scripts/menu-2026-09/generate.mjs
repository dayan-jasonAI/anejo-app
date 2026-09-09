// Generate the 2026-09 menu migration from scripts/menu-2026-09/prices.mjs.
//
//   node scripts/menu-2026-09/generate.mjs --check   → validate only, exit 1 on a bad ladder
//   node scripts/menu-2026-09/generate.mjs           → validate, then write the migration
//
// The validation is the point. A tray whose per-piece price is higher than a smaller tray of the
// same product can never sell, because cheapestExact() always picks the cheaper combination —
// so it is a silent revenue hole, not a cosmetic problem. Croquetas are the one exception and
// they are modelled as two separate families precisely so the rule still holds within each.
import { writeFileSync } from 'node:fs';
import { PRODUCTS, SINGLES, TOSTONES, LUNCH, RETIRE } from './prices.mjs';

const TS = Date.parse('2026-09-09T12:00:00Z');
const ACTOR = 'Dayan ratified menu 2026-09-09';
const money = (c) => `$${(c / 100).toFixed(2)}`;
const q = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const FLAVOR_EN = {
  jamon: 'ham', pollo: 'chicken', res: 'beef', chorizo: 'chorizo', sausage: 'sausage',
  tuna: 'tuna', atun: 'tuna', guava: 'guava & cheese', cheese: 'cheese', ham: 'ham',
  dulce: 'dulce de leche', 'ham-cheese': 'ham & cheese', 'guava-only': 'guava',
  'pulled-pork': 'pulled pork', 'ropa-vieja': 'ropa vieja', queso: 'cheese',
  perro: 'hot dog', 'jamon-queso': 'ham & cheese', fresa: 'strawberry', chocolate: 'chocolate',
  lechon: 'lechón', shrimp: 'shrimp',
};
const FLAVOR_ES = {
  jamon: 'jamón', pollo: 'pollo', res: 'res', chorizo: 'chorizo', sausage: 'salchicha',
  tuna: 'atún', atun: 'atún', guava: 'guayaba y queso', cheese: 'queso', ham: 'jamón',
  dulce: 'dulce de leche', 'ham-cheese': 'jamón y queso', 'guava-only': 'guayaba',
  'pulled-pork': 'lechón', 'ropa-vieja': 'ropa vieja', queso: 'queso',
  perro: 'perro caliente', 'jamon-queso': 'jamón y queso', fresa: 'fresa', chocolate: 'chocolate',
  lechon: 'lechón', shrimp: 'camarón',
};

// ---------------------------------------------------------------- validation

const problems = [];
const warnings = [];

// Cheapest way to reach EXACTLY `want` using the given packs — the same bounded-knapsack the
// quote engine runs. Infinity when the quantity cannot be hit at all.
function cheapestExact(want, packs) {
  const best = new Array(want + 1).fill(Infinity);
  best[0] = 0;
  for (let n = 1; n <= want; n++) {
    for (const [size, cents] of packs) {
      if (size <= n && best[n - size] + cents < best[n]) best[n] = best[n - size] + cents;
    }
  }
  return best[want];
}

for (const p of PRODUCTS) {
  const sizes = p.trays.map(([s]) => s);
  if (new Set(sizes).size !== sizes.length) problems.push(`${p.key}: duplicate tray size`);
  if (sizes.some((s, i) => i && s <= sizes[i - 1])) problems.push(`${p.key}: tray sizes are not ascending`);
  for (const [size, cents] of p.trays) {
    if (!Number.isInteger(cents) || cents <= 0) problems.push(`${p.key}/${size}: ${cents} is not a positive integer of cents`);
  }

  // THE REAL TEST, and the only one that predicts what the engine does: for each tray, what
  // would the customer pay for the same quantity built from SMALLER trays of the same product?
  //   cheaper elsewhere  → this tray is DEAD. It can never be selected. That is a revenue hole.
  //   exactly equal      → redundant. It sells only by luck of tie-breaking, and buys no volume
  //                        discount at all — worth knowing, not worth blocking.
  //   more expensive     → the tray earns its place.
  // Comparing a tray against SINGLES is deliberately NOT done here: singles are sold on the
  // à la carte page and trays through the catering quote, and the engine never mixes the two.
  for (let i = 0; i < p.trays.length; i++) {
    const [size, cents] = p.trays[i];
    const smaller = p.trays.slice(0, i);
    if (!smaller.length) continue;
    const alt = cheapestExact(size, smaller);
    if (alt < cents) {
      problems.push(`${p.key}: the ${size}-count costs ${money(cents)} but ${money(alt)} of smaller trays ` +
        `buys the same ${size} — the engine will always take the cheaper one, so this tray never sells`);
    } else if (alt === cents) {
      warnings.push(`${p.key}: the ${size}-count at ${money(cents)} is exactly what smaller trays cost — ` +
        `it offers the customer no volume saving over combining them`);
    }
  }
}
const seen = new Set();
const claim = (id) => { if (seen.has(id)) problems.push(`duplicate SKU: ${id}`); seen.add(id); return id; };

// ---------------------------------------------------------------- rows

const rows = [];   // { id, name, nameEs, cents, image, sort, kind }
let sort = 100;

for (const p of PRODUCTS) {
  const flavors = p.flavors || [null];
  for (const f of flavors) {
    // English puts the flavour first ("Ham croqueta"); Spanish puts it after ("Croqueta de
    // jamón"). Building both from one template is how "Croqueta de sausage" happens.
    const flavEn = f ? (FLAVOR_EN[f] || f) : '';
    const nameEn = f ? `${flavEn.charAt(0).toUpperCase()}${flavEn.slice(1)} ${p.label.toLowerCase()}` : p.label;
    const nameEs = f ? `${p.labelEs} de ${FLAVOR_ES[f] || f}` : p.labelEs;
    const suffix = f ? `-${f}` : '';
    if (p.single != null) {
      rows.push({ id: claim(`traditional_${p.base}${suffix}`), cents: p.single, image: p.image, sort: sort++,
        name: nameEn, nameEs });
    }
    for (const [size, cents] of p.trays) {
      const unitEn = p.unit === 'servings' ? 'servings' : p.unit;
      const unitEs = p.unit === 'servings' ? 'porciones' : p.unit === 'cups' ? 'vasitos' : p.unit === 'cajitas' ? 'cajitas' : 'unidades';
      rows.push({ id: claim(`catering_${p.base}${suffix}-${size}`), cents, image: p.image, sort: sort++,
        name: `${nameEn} — ${size} ${unitEn}${p.note ? ` (${p.note})` : ''}`,
        nameEs: `${nameEs} — ${size} ${unitEs}` });
    }
  }
}
for (const s of SINGLES) rows.push({ id: claim(s.id), cents: s.cents, image: s.image, sort: sort++, name: s.name, nameEs: s.nameEs });
for (const t of TOSTONES) rows.push({ id: claim(t.id), cents: t.cents, image: null, sort: null, priceOnly: true });
for (const l of LUNCH) rows.push({ id: claim(l.id), cents: l.cents, image: l.image || null, sort: null,
  name: l.name, nameEs: l.nameEs, priceOnly: !l.name });

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} with the price table:\n`);
  for (const p of problems) console.error(`  · ${p}`);
  console.error('');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n${warnings.length} tray${warnings.length === 1 ? '' : 's'} that no customer gains from:\n`);
  for (const w of warnings) console.warn(`  · ${w}`);
  console.warn('');
}

const trayCount = rows.filter((r) => r.id.startsWith('catering_')).length;
console.log(`${rows.length} SKUs — ${trayCount} catering trays, ${rows.length - trayCount} singles/plates`);
console.log(`${RETIRE.length} retiring`);
console.log('no tray in the table is unsellable — every one is the cheapest route to its own quantity, or ties');

if (process.argv.includes('--check')) process.exit(0);

// ---------------------------------------------------------------- SQL

const out = [`-- Añejo menu, ratified by Dayan on 2026-09-09.
-- GENERATED — do not hand-edit. Source: scripts/menu-2026-09/prices.mjs
--   node scripts/menu-2026-09/generate.mjs
--
-- Every tray ladder in the source is machine-checked to fall: a tray priced above a smaller one
-- per piece never sells, because the quote engine always takes the cheapest exact combination.
--
-- Retirement is active=0, never DELETE. Past orders reference these ids and must stay readable.
`];

for (const r of rows) {
  if (r.priceOnly) {
    out.push(`UPDATE menu_items SET price_cents=${r.cents}, updated_at=${TS} WHERE id=${q(r.id)};`);
  } else {
    out.push(`INSERT INTO menu_items (id,kind,name,name_es,price_cents,image,sort,active,created_at,updated_at)
  VALUES (${q(r.id)},'addon',${q(r.name)},${q(r.nameEs)},${r.cents},${q(r.image)},${r.sort ?? 500},1,${TS},${TS})
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_es=excluded.name_es,
    price_cents=excluded.price_cents, image=COALESCE(excluded.image, menu_items.image),
    sort=excluded.sort, active=1, updated_at=${TS};`);
  }
  out.push(`INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES (${q(`m2609-${r.id}`)},${q(r.id)},'price_cents',NULL,${r.cents},${q(ACTOR)},${TS});`);
}
for (const id of RETIRE) {
  out.push(`UPDATE menu_items SET active=0, updated_at=${TS} WHERE id=${q(id)};`);
  out.push(`INSERT OR IGNORE INTO menu_price_log (id,item_id,field,old_cents,new_cents,changed_by,created_at)
  VALUES (${q(`m2609-retire-${id}`)},${q(id)},'availability:retired',NULL,NULL,${q(ACTOR)},${TS});`);
}

writeFileSync(new URL('../../migrations/0100_menu_2026_09.sql', import.meta.url), out.join('\n') + '\n');
console.log('\nwrote migrations/0100_menu_2026_09.sql');
