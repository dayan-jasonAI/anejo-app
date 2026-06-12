// Añejo 16 oz bowl spec — the SINGLE SOURCE OF TRUTH (the "macro template"/product spec sheet).
// Per-bowl macros + the per-ingredient BUILD (oz) are taken verbatim from the kitchen manual
// (Añejo Fit Bowls — Manual de Operaciones de Cocina, "13 recetas finales", build-por-bowl column).
// The AI planner, the plan page, and the kitchen ticket all read from here; the kitchen scales every
// macro AND every ingredient weight by the client's bowl_size_factor so each bowl carries that
// client's specific portions. fiber_g are estimates (not in the manual).
// NOTE: site keys MAR/RAIZ map to the manual's SALMÓN/TOFU recipes. The manual also defines an 8th
// bowl (FUERZA) not yet on the site — see the handoff note.
// Files under functions/_lib are not routed.

export const BOWLS = [
  { name: 'VIDA',     image: '/assets/img/bowl_vida.jpg',     kcal: 510, protein_g: 40, carbs_g: 36, fat_g: 22, fiber_g: 12,
    description: 'Coastal tuna bowl: seared tuna with mango + cucumber over quinoa, greens, chia, Mango Omega + Ajo Cítrico.',
    build: [
      { item: 'Seared tuna', oz: 4.5 }, { item: 'Quinoa', oz: 3.0 }, { item: 'Cucumber', oz: 1.5 },
      { item: 'Mango', oz: 1.0 }, { item: 'Mixed greens', oz: 1.0 }, { item: 'Chia seeds', oz: 0.2 },
      { item: 'Mango Omega', oz: 1.0 }, { item: 'Ajo Cítrico', oz: 0.5 },
    ],
    tags: ['pescatarian','anti-inflammatory','flagship'] },
  { name: 'FUEGO',    image: '/assets/img/bowl_fuego.jpg',    kcal: 580, protein_g: 42, carbs_g: 35, fat_g: 28, fiber_g:  9,
    description: 'Steak bowl: Chimichurri-marinated steak, quinoa, roasted zucchini + peppers, arugula, pickled onions, pumpkin seeds.',
    build: [
      { item: 'Marinated steak', oz: 5.0 }, { item: 'Quinoa', oz: 3.0 }, { item: 'Roasted zucchini + peppers', oz: 2.0 },
      { item: 'Arugula', oz: 1.0 }, { item: 'Pickled onions', oz: 0.5 }, { item: 'Pumpkin seeds', oz: 0.3 },
      { item: 'Chimichurri Vital', oz: 1.0 }, { item: 'Ajo Cítrico', oz: 0.5 },
    ],
    tags: ['high-protein','mediterranean'] },
  { name: 'LIGERO',   image: '/assets/img/bowl_ligero.jpg',   kcal: 520, protein_g: 45, carbs_g: 38, fat_g: 20, fiber_g:  9,
    description: 'Golden Turmeric chicken, brown rice or quinoa, roasted carrot/sweet potato, spinach, tomato, cucumber, toasted almonds.',
    build: [
      { item: 'Golden Turmeric chicken', oz: 5.0 }, { item: 'Brown rice or quinoa', oz: 3.0 }, { item: 'Roasted carrot/sweet potato', oz: 1.5 },
      { item: 'Spinach', oz: 1.0 }, { item: 'Tomato', oz: 1.0 }, { item: 'Cucumber', oz: 0.5 },
      { item: 'Toasted almonds', oz: 0.3 }, { item: 'Golden Turmeric', oz: 1.25 },
    ],
    tags: ['high-protein','lean','workhorse'] },
  { name: 'MAR',      image: '/assets/img/bowl_mar.jpg',      kcal: 620, protein_g: 40, carbs_g: 30, fat_g: 32, fiber_g:  8,
    description: 'Premium omega-3 salmon over quinoa, arugula, roasted vegetables, roasted asparagus, pickled onions, black sesame, Ajo Cítrico.',
    build: [
      { item: 'Salmon', oz: 5.0 }, { item: 'Quinoa', oz: 3.0 }, { item: 'Arugula', oz: 1.0 },
      { item: 'Roasted vegetables', oz: 2.0 }, { item: 'Roasted asparagus', oz: 1.0 }, { item: 'Pickled onions', oz: 0.5 },
      { item: 'Black sesame', oz: 0.3 }, { item: 'Ajo Cítrico', oz: 1.0 },
    ],
    tags: ['pescatarian','omega-3','anti-inflammatory','high-protein'] },
  { name: 'COCO',     image: '/assets/img/bowl_coco.jpg',     kcal: 590, protein_g: 40, carbs_g: 37, fat_g: 27, fiber_g:  9,
    description: 'Coconut-lime shrimp over quinoa-corn-edamame, spinach, cherry tomatoes, avocado, cucumber, sesame, Ajo Cítrico, toasted coconut.',
    build: [
      { item: 'Coconut-lime shrimp', oz: 5.0 }, { item: 'Quinoa-corn-edamame', oz: 3.75 }, { item: 'Spinach', oz: 1.0 },
      { item: 'Cherry tomatoes', oz: 0.8 }, { item: 'Avocado', oz: 0.9 }, { item: 'Cucumber', oz: 0.7 },
      { item: 'Sesame seasoning', oz: 0.1 }, { item: 'Ajo Cítrico', oz: 0.5 }, { item: 'Toasted coconut', oz: 0.1 },
    ],
    tags: ['pescatarian','lean','tropical'] },
  { name: 'CONGREEN', image: '/assets/img/bowl_congreen.jpg', kcal: 575, protein_g: 41, carbs_g: 39, fat_g: 25, fiber_g: 11,
    description: 'Reinvented congrí: tuna-mango-lime sauté over quinoa-blueberry congrí, spinach, tomato, avocado, pickled onions, pumpkin seeds, queso fresco, Ajo Cítrico.',
    build: [
      { item: 'Tuna-mango-lime sauté', oz: 4.8 }, { item: 'Quinoa-blueberry congrí', oz: 3.5 }, { item: 'Spinach', oz: 1.2 },
      { item: 'Tomato', oz: 0.8 }, { item: 'Avocado', oz: 0.9 }, { item: 'Pickled onions', oz: 0.5 },
      { item: 'Pumpkin seeds', oz: 0.3 }, { item: 'Queso fresco', oz: 0.3 }, { item: 'Ajo Cítrico', oz: 0.9 },
    ],
    tags: ['pescatarian','cuban','antioxidant'] },
  { name: 'RAIZ',     image: '/assets/img/bowl_raiz.jpg',     kcal: 520, protein_g: 35, carbs_g: 38, fat_g: 26, fiber_g: 11,
    description: 'Plant-powered crispy tofu, quinoa, slaw, roasted vegetables, sweet potato, black sesame, Aguacate Cilantro + Mango Omega.',
    build: [
      { item: 'Crispy tofu', oz: 5.0 }, { item: 'Quinoa', oz: 3.0 }, { item: 'Slaw', oz: 1.5 },
      { item: 'Roasted vegetables', oz: 1.5 }, { item: 'Sweet potato', oz: 1.0 }, { item: 'Black sesame', oz: 0.3 },
      { item: 'Aguacate Cilantro', oz: 1.0 }, { item: 'Mango Omega', oz: 0.5 },
    ],
    tags: ['vegetarian','plant-forward','dairy-free','high-fiber','anti-inflammatory'] },
];

// Ingredient name list derived from the build (kept for the plan page + lighter contexts).
BOWLS.forEach((b) => { b.ingredients = b.build.map((x) => x.item); });

export const BOWL_NAMES = BOWLS.map((b) => b.name);
export const BOWL_BY_NAME = Object.fromEntries(BOWLS.map((b) => [b.name, b]));

// Display label fix-ups (accent the menu name).
export const BOWL_LABEL = { RAIZ: 'RAÍZ' };

// ½ Hass avocado (~68 g) — the add-on. "Swap to keep calories ~same": when added, half an avocado
// displaces an equivalent amount of the bowl's other fats/garnish, so total bowl calories stay at
// the client's target (calorie-neutral) while the customer gets fresh avocado. Premium ingredient,
// so it carries a flat upcharge. The kitchen reduces other fats to make room (see ticket note).
export const HALF_AVOCADO = { kcal: 120, protein_g: 2, carbs_g: 6, fat_g: 11, fiber_g: 5, grams: 68 };
export const AVOCADO_ADDON_CENTS = 200; // +$2.00 per bowl

export function bowlImage(name) {
  const b = BOWL_BY_NAME[name];
  return b ? b.image : null;
}

// Macros for ONE bowl portioned to a client's size factor. Avocado is calorie-neutral (a swap),
// so it doesn't change the totals — it changes prep + price only.
export function scaledBowlMacros(name, factor) {
  const b = BOWL_BY_NAME[name];
  if (!b) return null;
  const f = Number(factor) > 0 ? Number(factor) : 1;
  const r = (x) => Math.round(x * f);
  return { kcal: r(b.kcal), protein_g: r(b.protein_g), carbs_g: r(b.carbs_g), fat_g: r(b.fat_g), fiber_g: r(b.fiber_g) };
}

// Full kitchen line for one bowl type in a client's order: scaled macros + per-ingredient BUILD
// weights (oz, scaled to the client's factor) + portion + avocado flag, so the kitchen weighs the
// right amount of each item and we can roll the order up into a stock list.
export function kitchenBowlLine(name, qty, factor, avocado) {
  const b = BOWL_BY_NAME[name];
  if (!b) return null;
  const f = Number(factor) > 0 ? Number(factor) : 1;
  const oz = (x) => Math.round(x * f * 10) / 10; // 0.1 oz precision
  return {
    id: 'bowl_' + name.toLowerCase(),
    name: (BOWL_LABEL[name] || name) + ' Bowl',
    qty: Number(qty) || 1,
    size_oz: Math.round(16 * f),
    size_pct: Math.round(f * 100),
    macros: scaledBowlMacros(name, f),
    build: b.build.map((x) => ({ item: x.item, oz: oz(x.oz) })),
    ingredients: b.ingredients,
    avocado: !!avocado,
  };
}
