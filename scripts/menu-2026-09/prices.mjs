// THE añejo MENU — Dayan's ratified prices, 2026-09-09.
//
// Dictated in full, then every ambiguity resolved by him against the D1–D15 question list in the
// repricing spec. This file is the SOURCE the migration is generated from: change a number here
// and regenerate, never hand-edit the SQL.
//
// Money is INTEGER CENTS everywhere. A float in this file is a bug.
//
// TRAY LADDERS MUST FALL. Every product's per-piece price has to drop (or hold) as the tray gets
// bigger. The quote engine picks the cheapest exact combination, so a tray that costs more per
// piece than a smaller one is a tray that never sells a single unit. `npm run check:menu`
// enforces it; the one deliberate exception is croquetas, below.
//
// CROQUETAS ARE TWO PRODUCTS, NOT ONE LADDER.
//   · the 10-count is a BOX of croquetas, $10.00
//   · the 30 / 60 / 90 are PLATTERS, plated with the sauces in between, $35 per 30
// Three boxes cost $30 and one platter costs $35, and that is correct — the platter includes
// sauce and plating the box does not. They are separate families so the engine never substitutes
// one for the other. (Dayan, 2026-09-09, answering D1.)

export const FLAVORS = {
  croqueta: ['jamon', 'pollo', 'res', 'chorizo', 'sausage', 'tuna'],
  // D15: ham-cheese, guava-only and ropa-vieja are KEPT, not retired.
  empanadaA: ['guava', 'cheese', 'ham', 'dulce', 'ham-cheese', 'guava-only'],
  empanadaB: ['pollo', 'pulled-pork', 'tuna', 'res'],
  bocadito: ['jamon', 'atun'],
  papaA: ['queso', 'jamon', 'chorizo', 'perro'],
  papaB: ['jamon-queso', 'pollo', 'res'],
  tostonesA: ['cheese', 'ham'],
  tostonesB: ['pollo', 'ham-cheese', 'ropa-vieja', 'lechon', 'shrimp'],
  dessert: ['fresa', 'chocolate'],
};

// [size, cents] — the tray ladder for a family.
// Per-flavour photography, where it EXISTS. Only pollo and res croquetas and the guava-and-cheese
// empanada were ever shot individually; everything else falls back to the family's generic photo.
// Without this, `image` is one value per family and every croqueta on the site shows the CHICKEN
// one — ham, beef, chorizo, sausage and tuna included. A wrong photo of the right food is worse
// than an honest generic: the customer only finds out when the box is opened.
export const FLAVOR_IMAGES = {
  'croq-pollo': 'menu-launch/food-croq-pollo.webp',
  'croq-res': 'menu-launch/food-croq-res.webp',
  'emp-guava': 'menu-launch/food-emp-guava.webp',
  'cup-fresa': 'menu-launch/cup-fresa.webp',
  'cup-chocolate': 'menu-launch/cup-chocolate.webp',
};

export const PRODUCTS = [
  // ---------------------------------------------------------------- croquetas (D1)
  { key: 'croq-box', base: 'croq', label: 'Croqueta', labelEs: 'Croqueta',
    flavors: FLAVORS.croqueta, single: 150, trays: [[10, 1000]], unit: 'pieces',
    note: 'box — no sauce', image: 'menu-launch/croqueta-single.webp' },
  { key: 'croq-platter', base: 'platter', label: 'Croqueta platter', labelEs: 'Bandeja de croquetas',
    flavors: FLAVORS.croqueta, single: null, trays: [[30, 3500], [60, 7000], [90, 10500]], unit: 'pieces',
    note: 'plated with sauces', image: 'menu-launch/tray-croquetas.webp' },
  { key: 'dressed', base: 'dressed', label: 'Dressed croqueta platter', labelEs: 'Bandeja de croquetas preparadas',
    flavors: null, single: 325, trays: [[30, 4500], [60, 9000], [90, 13500]], unit: 'pieces',
    image: 'menu-launch/tray-dressed.webp' },

  // ---------------------------------------------------------------- empanadas (D4, D15)
  { key: 'empA', base: 'emp', label: 'Empanada', labelEs: 'Empanada',
    flavors: FLAVORS.empanadaA, single: 250, trays: [[10, 2500], [25, 5000], [50, 7500]], unit: 'pieces',
    image: 'menu-launch/empanada-single.webp' },
  { key: 'empB', base: 'emp', label: 'Empanada', labelEs: 'Empanada',
    flavors: FLAVORS.empanadaB, single: 275, trays: [[10, 3000], [25, 6000], [50, 11000]], unit: 'pieces',
    image: 'menu-launch/empanada-single.webp' },
  // Ropa vieja keeps its own higher price — unchanged, and explicitly kept (D15).
  { key: 'empRopa', base: 'emp', label: 'Empanada', labelEs: 'Empanada',
    flavors: ['ropa-vieja'], single: 400, trays: [[25, 8500], [50, 16500]], unit: 'pieces',
    image: 'menu-launch/empanada-single.webp', unchanged: true },

  // ---------------------------------------------------------------- bites
  { key: 'bomba', base: 'bomba', label: 'La Bomba Tropical', labelEs: 'La Bomba Tropical',
    flavors: null, single: 300, trays: [[10, 3000], [25, 6875], [50, 12500]], unit: 'pieces',
    image: 'menu-launch/food-bomba.webp' },
  { key: 'bocadito', base: 'bocadito', label: 'Bocadito', labelEs: 'Bocadito',
    flavors: FLAVORS.bocadito, single: 150, trays: [[10, 1500], [25, 3125], [50, 5000]], unit: 'pieces',
    image: 'menu-launch/food-bocadito.webp' },
  { key: 'skewer', base: 'skewer', label: 'Skewer', labelEs: 'Brocheta',
    flavors: null, single: 300, trays: [[10, 3000], [25, 6500], [50, 10000]], unit: 'pieces',
    image: 'menu-launch/food-skewer.webp' },
  { key: 'papaA', base: 'papa', label: 'Papa rellena', labelEs: 'Papa rellena',
    flavors: FLAVORS.papaA, single: 200, trays: [[10, 2000], [25, 5000], [50, 7500]], unit: 'pieces',
    image: null },
  { key: 'papaB', base: 'papa', label: 'Papa rellena', labelEs: 'Papa rellena',
    flavors: FLAVORS.papaB, single: 250, trays: [[10, 2000], [25, 5000], [50, 7500]], unit: 'pieces',
    image: null },

  // ---------------------------------------------------------------- by the serving
  { key: 'lechon', base: 'lechon', label: 'Lechón asado', labelEs: 'Lechón asado',
    flavors: null, single: 650, trays: [[10, 5000], [25, 8500], [50, 16000]], unit: 'servings',
    image: 'menu-launch/food-lechon.webp' },
  { key: 'congri', base: 'congri', label: 'Congrí', labelEs: 'Congrí',
    flavors: null, single: 350, trays: [[10, 3500], [25, 6000], [30, 7000], [50, 12000]], unit: 'servings',
    image: 'menu-launch/congri-single.webp' },
  { key: 'yuca', base: 'yuca', label: 'Yuca with onion & chicharrones', labelEs: 'Yuca con cebolla y chicharrones',
    flavors: null, single: 350, trays: [[10, 3000], [25, 4500], [30, 5000], [50, 6500]], unit: 'servings',
    image: 'menu-launch/yuca-single.webp' },
  { key: 'fria', base: 'fria', label: 'Cold macaroni salad', labelEs: 'Ensalada fría de coditos',
    flavors: null, single: 500, trays: [[10, 4500], [25, 6500], [50, 10000]], unit: 'servings',
    image: 'menu-launch/fria-single.webp' },
  { key: 'verde', base: 'verde', label: 'Fresh salad', labelEs: 'Ensalada fresca',
    flavors: null, single: 450, trays: [[10, 3000], [25, 4500], [50, 6000]], unit: 'servings',
    image: 'menu-launch/salad-side.webp' },
  { key: 'tamal', base: 'tamal', label: 'Cuban tamal', labelEs: 'Tamal cubano',
    flavors: null, single: 450, trays: [[10, 4500], [25, 7000], [50, 9500]], unit: 'servings',
    image: 'menu-launch/tamal-single.webp' },

  // ---------------------------------------------------------------- dessert
  { key: 'cups', base: 'cup', label: 'Tres leches cup', labelEs: 'Vasito de tres leches',
    flavors: FLAVORS.dessert, single: 550, trays: [[10, 4000], [25, 7000], [50, 11000]], unit: 'cups',
    image: 'menu-launch/cup-fresa.webp' },

  // ---------------------------------------------------------------- la cajita
  { key: 'cajita', base: 'cajita', label: 'La Cajita', labelEs: 'La Cajita',
    flavors: null, single: 1750, trays: [[10, 16000], [25, 38500], [50, 72500]], unit: 'cajitas',
    image: 'menu-launch/cajitas-collection.webp' },
];

// Single SKUs with no tray ladder.
export const SINGLES = [
  { id: 'traditional_tamal-full', name: 'Whole tamal — 6 slices', nameEs: 'Tamal entero — 6 rodajas', cents: 550, image: 'menu-launch/food-tamal.webp' },
  { id: 'traditional_arroz-blanco', name: 'White rice — 8 oz', nameEs: 'Arroz blanco — 8 oz', cents: 300, image: 'menu-launch/rice-side.webp' },
  { id: 'traditional_arroz-frito-side', name: 'Fried rice — 6 oz', nameEs: 'Arroz frito — 6 oz', cents: 650, image: 'menu-launch/arroz-frito.webp' },
  { id: 'catering_cake-fresa-c', name: 'Strawberry tres leches — 10-inch cake', nameEs: 'Tres leches de fresa — pastel de 10 pulgadas', cents: 4500, image: 'menu-launch/food-cake-fresa-c.webp' },
  { id: 'catering_cake-chocolate-c', name: 'Chocolate tres leches — 10-inch cake', nameEs: 'Tres leches de chocolate — pastel de 10 pulgadas', cents: 4500, image: 'menu-launch/food-cake-chocolate-c.webp' },
];

// Tostones rellenos, per piece (D8).
export const TOSTONES = [
  ...FLAVORS.tostonesA.map((f) => ({ id: `traditional_tostones-${f}`, cents: 250 })),
  ...FLAVORS.tostonesB.map((f) => ({ id: `traditional_tostones-${f}`, cents: 325 })),
];

// Both whole-cake ids carry the same product; pricing only one leaves the site showing $50
// beside $45 for the same cake.
export const CAKES = [
  { id: 'traditional_cake-fresa', cents: 4500 },
  { id: 'traditional_cake-chocolate', cents: 4500 },
];

// Lunch plates (D9, D10, D11).
export const LUNCH = [
  { id: 'traditional_meal-tacos-pollo', cents: 1000 },
  { id: 'traditional_meal-tacos-lechon', cents: 1000 },
  { id: 'traditional_meal-lasagna', cents: 1000 },
  { id: 'traditional_meal-sandwich-pollo', cents: 1000 },
  { id: 'traditional_pizza', cents: 1000 },
  { id: 'traditional_pizza-loaded', cents: 1200, name: 'Cuban pizza with toppings', nameEs: 'Pizza cubana con ingredientes', image: 'menu-launch/pizza-plated.webp' },
  { id: 'traditional_meal-uruguayo-congri', cents: 1600 },
  { id: 'traditional_meal-uruguayo-arroz', cents: 1600 },
  { id: 'traditional_meal-chuleta', cents: 1400 },
  { id: 'traditional_meal-enchilado-pollo', cents: 1275 },
  { id: 'traditional_combo-traditional-meal', cents: 1400 },
  { id: 'traditional_ropa-vieja-meal', cents: 1650 },
  { id: 'traditional_meal-garbanzos', cents: 1200 },
  { id: 'traditional_meal-arroz-frito', cents: 1275 },
  { id: 'traditional_meal-pan-lechon', cents: 1000 },
];

// D13: every combo retires. Deactivated (active=0), never deleted — a deleted row leaves past
// orders pointing at nothing.
export const RETIRE = [
  'catering_combo-bites75', 'catering_combo-bites150',
  'catering_combo-table10', 'catering_combo-table25', 'catering_combo-table50',
  'catering_combo-dessert24', 'catering_combo-tamal-croq',
  'traditional_combo-bites-snack',
  // The old croqueta/empanada 25- and 50-count trays are replaced by the new ladders.
  ...FLAVORS.croqueta.flatMap((f) => [`catering_croq-${f}-25`, `catering_croq-${f}-50`]),
  'catering_dressed-25', 'catering_dressed-50',
  'traditional_salami', 'catering_salami-25', 'catering_salami-50',
  'catering_pizza-3',
  // Superseded by the 10/25/50 cup ladder. Left active they would sit beside it at $60 for 12.
  'catering_cups-fresa', 'catering_cups-chocolate',
];
