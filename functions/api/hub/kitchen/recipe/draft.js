// GET  /api/hub/kitchen/recipe/draft?id=rcp_… — one recipe, in full, for editing
// POST /api/hub/kitchen/recipe/draft { id, ingredients?, steps?, summary? } — save the edits
//
// Dayan, 2026-09-25, the day before a thirty-guest event with the kitchen already cooking: "I need
// a way for the kitchen to be able to finish those drafts live while it's getting done."
//
// There was no way. A recipe could be created in Studio and published to the library, and between
// those two points it could not be changed by anybody — so seven catering recipes sat at status
// 'draft' with nobody able to finish them, on the morning they were being cooked.
//
// WHAT IS EDITED HERE IS THE BASE RECIPE, not the scaled copy the event plan shows. The catering
// recipes are written for 45 portions and the plan scales them to whatever the event sold; if this
// saved the scaled amounts the base would be silently rewritten to one event's guest count and
// every later event would be wrong. The screen says so, and this file is where it is true.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { now, toJson } from '../../../../_lib/hub.js';

const parse = (s, fallback) => { try { const v = JSON.parse(s); return v == null ? fallback : v; } catch { return fallback; } };

/** Lines in, array out. Blank lines are dropped; everything else is kept verbatim. */
export function lines(value, max) {
  if (Array.isArray(value)) return value.slice(0, max);
  return String(value == null ? '' : value)
    .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, max);
}

/**
 * Ingredients are "3 cups — garlic, mashed" or "3 cups garlic, mashed". The em dash is what the
 * kitchen is shown, so it is what is parsed first; without one the leading quantity is taken and
 * the rest is the item, which is how a cook writing quickly will type it.
 */
export function ingredientsFrom(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => ({ item: String((x && x.item) || '').trim(), qty: String((x && x.qty) || '').trim() }))
      .filter((x) => x.item).slice(0, 120);
  }
  return lines(value, 120).map((l) => {
    const dash = l.split(/\s+[—–-]\s+/);
    if (dash.length >= 2) return { qty: dash[0].trim(), item: dash.slice(1).join(' - ').trim() };
    const m = l.match(/^([\d¼½¾⅓⅔⅛\s./]+(?:[a-zA-Z.]+)?)\s+(.*)$/);
    return m ? { qty: m[1].trim(), item: m[2].trim() } : { qty: '', item: l };
  }).filter((x) => x.item);
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const id = (new URL(request.url).searchParams.get('id') || '').trim();
  if (!id) return bad('Missing recipe id.');
  const r = await env.DB.prepare(
    `SELECT id, name, name_es, summary, portion, status, ingredients, steps,
            cook_minutes, prep_lead_minutes, prep_lead_label, updated_at
       FROM recipes WHERE id = ?`
  ).bind(id).first();
  if (!r) return bad('Recipe not found.', 404);

  return json({
    ok: true,
    recipe: {
      ...r,
      draft: r.status !== 'published',
      ingredients: parse(r.ingredients, []),
      steps: parse(r.steps, []),
    },
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const id = ((b && b.id) || '').toString().trim();
  if (!id) return bad('Missing recipe id.');

  const before = await env.DB.prepare('SELECT id, name, status FROM recipes WHERE id = ?').bind(id).first();
  if (!before) return bad('Recipe not found.', 404);

  // Only the fields actually sent are touched. A screen that edits the steps must not be able to
  // blank the ingredients just by not knowing about them.
  const sets = [], args = [];
  if (b.ingredients !== undefined) {
    const ing = ingredientsFrom(b.ingredients);
    if (!ing.length) return bad('A recipe with no ingredients cannot be saved — the purchase list is built from them.');
    sets.push('ingredients = ?'); args.push(toJson(ing));
  }
  if (b.steps !== undefined) {
    const st = lines(b.steps, 60);
    if (!st.length) return bad('A recipe with no method cannot be saved.');
    sets.push('steps = ?'); args.push(toJson(st));
  }
  if (b.summary !== undefined) { sets.push('summary = ?'); args.push(String(b.summary || '').slice(0, 2000) || null); }
  if (!sets.length) return bad('Nothing to save.');

  const ts = now();
  sets.push('updated_at = ?'); args.push(ts);
  args.push(id);
  await env.DB.prepare(`UPDATE recipes SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();

  await capture(env, {
    event: 'recipe.edited',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { recipe_id: id, fields: sets.length - 1, by: staff ? staff.id : null },
  });

  const after = await env.DB.prepare(
    'SELECT id, name, status, ingredients, steps, summary, updated_at FROM recipes WHERE id = ?'
  ).bind(id).first();
  return json({
    ok: true,
    recipe: { ...after, draft: after.status !== 'published', ingredients: parse(after.ingredients, []), steps: parse(after.steps, []) },
  });
};
