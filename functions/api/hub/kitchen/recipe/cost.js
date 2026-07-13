// POST /api/hub/kitchen/recipe/cost — Recipe COGS v1: estimate a recipe's food cost by
// fuzzy-matching its ingredients against inventory_items.unit_cost_cents.
// Body: { recipe_id }
// Matching: lowercase + strip punctuation + singular/plural tolerance + substring match in
// both directions (ingredient text ⊇ item name, or item name ⊇ ingredient text). Quantity is
// multiplied in ONLY when the ingredient entry is an object with a numeric `qty` field —
// plain-string ingredients (the common case) are counted once each.
// HONESTY RULE: an ingredient that doesn't match any inventory item, or matches an item with
// no unit_cost_cents on file, is NEVER assumed to cost $0. It is written into cost_breakdown
// with matched_item:null (or unit_cost_cents:null) and counted in unmatched_count — so the
// owner/chef can see exactly how much of the estimate is real vs. missing.
// Writes recipes.est_cost_cents / cost_breakdown / cost_updated_at. Fires recipe.cost_calculated.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { now, toJson, parseJson } from '../../../../_lib/hub.js';

// Lowercase, strip punctuation, collapse whitespace.
function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A small set of singular/plural variants of a normalized string, for tolerant matching.
function variants(s) {
  const base = normalize(s);
  const out = new Set([base]);
  if (base.endsWith('es') && base.length > 4) out.add(base.slice(0, -2));
  if (base.endsWith('s') && !base.endsWith('ss') && base.length > 3) out.add(base.slice(0, -1));
  if (!base.endsWith('s')) out.add(`${base}s`);
  return [...out].filter(Boolean);
}

// True if any variant of `text` contains, or is contained by, any variant of `itemName`.
// A minimum length guard keeps very short/generic tokens from matching everything.
function fuzzyMatch(text, itemName) {
  const textVariants = variants(text);
  const nameVariants = variants(itemName).filter((v) => v.length >= 3);
  if (!nameVariants.length) return false;
  for (const tv of textVariants) {
    if (!tv) continue;
    for (const nv of nameVariants) {
      if (tv.includes(nv) || nv.includes(tv)) return true;
    }
  }
  return false;
}

// Ingredient entries may be a plain string ("2 cups jasmine rice / 2 tazas de arroz jazmín")
// or a structured object ({ name, qty, unit }) — support both.
function ingredientText(ing) {
  if (ing == null) return '';
  if (typeof ing === 'string') return ing;
  if (typeof ing === 'object') {
    return String(ing.name || ing.item || ing.ingredient || JSON.stringify(ing));
  }
  return String(ing);
}

function ingredientQty(ing) {
  if (ing && typeof ing === 'object' && typeof ing.qty === 'number' && Number.isFinite(ing.qty) && ing.qty > 0) {
    return ing.qty;
  }
  return null;
}

// Best match for one ingredient among the active inventory items. Prefers the LONGEST
// matching item name (more specific), to reduce false positives from short generic words.
function findMatch(text, items) {
  let best = null;
  for (const it of items) {
    if (!it || !it.name) continue;
    if (fuzzyMatch(text, it.name)) {
      if (!best || String(it.name).length > String(best.name).length) best = it;
    }
  }
  return best;
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const recipeId = (b && b.recipe_id || '').toString().trim();
  if (!recipeId) return bad('Missing recipe_id.');

  const recipe = await env.DB.prepare('SELECT id, ingredients FROM recipes WHERE id = ?').bind(recipeId).first();
  if (!recipe) return bad('Recipe not found.', 404);

  const ingredients = parseJson(recipe.ingredients, []);
  if (!Array.isArray(ingredients) || !ingredients.length) {
    return bad('Recipe has no ingredients to cost.');
  }

  const { results } = await env.DB
    .prepare('SELECT id, name, unit_cost_cents FROM inventory_items WHERE active = 1')
    .all();
  const items = results || [];

  const breakdown = [];
  let estCostCents = 0;
  let unmatchedCount = 0;

  for (const raw of ingredients) {
    const text = ingredientText(raw).trim();
    if (!text) continue;
    const qty = ingredientQty(raw);
    const match = findMatch(text, items);

    if (!match) {
      breakdown.push({ ingredient: text, matched_item: null, unit_cost_cents: null });
      unmatchedCount += 1;
      continue;
    }

    const unitCostCents = match.unit_cost_cents == null ? null : Number(match.unit_cost_cents);
    if (unitCostCents == null || !Number.isFinite(unitCostCents)) {
      // Matched an item, but the owner hasn't priced it yet — still honest, not a $0 guess.
      breakdown.push({ ingredient: text, matched_item: match.name, unit_cost_cents: null });
      unmatchedCount += 1;
      continue;
    }

    const multiplier = qty || 1;
    const lineCostCents = Math.round(unitCostCents * multiplier);
    estCostCents += lineCostCents;
    breakdown.push({
      ingredient: text,
      matched_item: match.name,
      unit_cost_cents: unitCostCents,
      qty: multiplier,
      line_cost_cents: lineCostCents,
    });
  }

  const ts = now();
  await env.DB.prepare(
    'UPDATE recipes SET est_cost_cents = ?, cost_breakdown = ?, cost_updated_at = ?, updated_at = ? WHERE id = ?'
  ).bind(estCostCents, toJson(breakdown), ts, ts, recipeId).run();

  await capture(env, {
    event: 'recipe.cost_calculated',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { recipe_id: recipeId, est_cost_cents: estCostCents, unmatched_count: unmatchedCount },
  });

  return json({
    ok: true,
    recipe_id: recipeId,
    est_cost_cents: estCostCents,
    cost_updated_at: ts,
    unmatched_count: unmatchedCount,
    breakdown,
  });
};
