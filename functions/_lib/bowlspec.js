// Añejo 16 oz bowl spec — the SINGLE SOURCE OF TRUTH (the "macro template"/product spec sheet).
// Per-bowl macros are for the STANDARD 16 oz bowl (Añejo Fit Bowls — Manual de Cocina v2026.05).
// The AI planner (functions/api/plans/generate.js), the plan page, and the kitchen ticket all read
// from here; the kitchen scales every number by the client's bowl_size_factor so each bowl carries
// that client's specific macros. fiber_g are estimates (not in the manual).
// Files under functions/_lib are not routed.

export const BOWLS = [
  { name: 'VIDA',     image: '/assets/img/bowl_vida.jpg',     kcal: 510, protein_g: 40, carbs_g: 36, fat_g: 22, fiber_g: 12,
    description: 'Tuna sautéed with mango + lime over quinoa, refried chickpeas, greens, pumpkin seeds.',
    ingredients: ['Tuna', 'Mango', 'Lime', 'Quinoa', 'Refried chickpeas', 'Mixed greens', 'Pumpkin seeds'],
    tags: ['pescatarian','anti-inflammatory','flagship'] },
  { name: 'FUEGO',    image: '/assets/img/bowl_fuego.jpg',    kcal: 580, protein_g: 42, carbs_g: 35, fat_g: 28, fiber_g:  9,
    description: 'Grilled steak with Añejo chimichurri, quinoa, grilled veg, spinach-apple-almond salad.',
    ingredients: ['Grilled steak', 'Añejo chimichurri', 'Quinoa', 'Grilled vegetables', 'Spinach-apple-almond salad'],
    tags: ['high-protein','mediterranean'] },
  { name: 'LIGERO',   image: '/assets/img/bowl_ligero.jpg',   kcal: 520, protein_g: 45, carbs_g: 38, fat_g: 20, fiber_g:  9,
    description: 'Grilled chicken with chimichurri, quinoa, grilled veg, spinach-apple-almond salad.',
    ingredients: ['Grilled chicken', 'Chimichurri', 'Quinoa', 'Grilled vegetables', 'Spinach-apple-almond salad'],
    tags: ['high-protein','lean','workhorse'] },
  { name: 'MAR',      image: '/assets/img/bowl_mar.jpg',      kcal: 620, protein_g: 40, carbs_g: 30, fat_g: 32, fiber_g:  8,
    description: 'Omega-rich salmon over quinoa, greens, roasted vegetables, pickled onions, sesame, Añejo sauce.',
    ingredients: ['Salmon', 'Quinoa', 'Mixed greens', 'Roasted vegetables', 'Pickled onions', 'Sesame', 'Añejo sauce'],
    tags: ['pescatarian','omega-3','anti-inflammatory','high-protein'] },
  { name: 'COCO',     image: '/assets/img/bowl_coco.jpg',     kcal: 590, protein_g: 40, carbs_g: 37, fat_g: 27, fiber_g:  9,
    description: 'Coconut-lime shrimp over quinoa-corn-edamame, spinach, tomato, cucumber, avocado, Ajo Cítrico.',
    ingredients: ['Coconut-lime shrimp', 'Quinoa-corn-edamame', 'Spinach', 'Tomato', 'Cucumber', 'Avocado', 'Ajo Cítrico'],
    tags: ['pescatarian','lean','tropical'] },
  { name: 'CONGREEN', image: '/assets/img/bowl_congreen.jpg', kcal: 575, protein_g: 41, carbs_g: 39, fat_g: 25, fiber_g: 11,
    description: 'Quinoa-blueberry congrí with tuna sauté, spinach-tomato, avocado, queso fresco, pumpkin seeds.',
    ingredients: ['Quinoa-blueberry congrí', 'Tuna sauté', 'Spinach-tomato', 'Avocado', 'Queso fresco', 'Pumpkin seeds'],
    tags: ['pescatarian','cuban','antioxidant'] },
  { name: 'RAIZ',     image: '/assets/img/bowl_raiz.jpg',     kcal: 520, protein_g: 35, carbs_g: 38, fat_g: 26, fiber_g: 11,
    description: 'Crispy tofu, quinoa, slaw, roasted vegetables, sweet potato, avocado, Aguacate Cilantro + Mango Omega.',
    ingredients: ['Crispy tofu', 'Quinoa', 'Slaw', 'Roasted vegetables', 'Sweet potato', 'Avocado', 'Aguacate Cilantro', 'Mango Omega'],
    tags: ['vegetarian','plant-forward','dairy-free','high-fiber','anti-inflammatory'] },
];

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

// Full kitchen line for one bowl type in a client's order: scaled macros + ingredient list +
// portion factor + avocado flag, so the kitchen preps the right weights and keeps stock.
export function kitchenBowlLine(name, qty, factor, avocado) {
  const b = BOWL_BY_NAME[name];
  if (!b) return null;
  const f = Number(factor) > 0 ? Number(factor) : 1;
  return {
    id: 'bowl_' + name.toLowerCase(),
    name: (BOWL_LABEL[name] || name) + ' Bowl',
    qty: Number(qty) || 1,
    size_oz: Math.round(16 * f),
    size_pct: Math.round(f * 100),
    macros: scaledBowlMacros(name, f),
    ingredients: b.ingredients,
    avocado: !!avocado,
  };
}
