// POST /api/hub/kitchen/recipe/publish — publish a draft recipe to the docs library.
// Body: { id (recipe), role_scope?:[roles] }. Marks the recipe published and creates (or
// updates) a docs row of doc_type 'recipe' that links back to it, versioned. Fires
// recipe.published.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const recipeId = (b && b.id || '').toString().trim();
  if (!recipeId) return bad('Missing recipe id.');

  const recipe = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(recipeId).first();
  if (!recipe) return bad('Recipe not found.', 404);

  const ts = now();
  const roleScope = Array.isArray(b && b.role_scope) ? b.role_scope : ['kitchen', 'owner'];

  await env.DB.prepare(
    "UPDATE recipes SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?"
  ).bind(ts, ts, recipeId).run();

  // Upsert a library doc that references this recipe. If one already exists, bump version.
  const existing = await env.DB.prepare(
    "SELECT * FROM docs WHERE recipe_id = ? AND doc_type = 'recipe'"
  ).bind(recipeId).first();

  let docId;
  if (existing) {
    docId = existing.id;
    await env.DB.prepare(
      'UPDATE docs SET title = ?, body = ?, role_scope = ?, version = version + 1, active = 1, updated_at = ? WHERE id = ?'
    ).bind(recipe.name, recipe.summary || null, toJson(roleScope), ts, docId).run();
  } else {
    docId = id('doc');
    await env.DB.prepare(
      `INSERT INTO docs (id, doc_type, title, body, recipe_id, role_scope, version, active, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      docId, 'recipe', recipe.name, recipe.summary || null, recipeId,
      toJson(roleScope), 1, 1, staff ? staff.id : null, ts, ts
    ).run();
  }

  await capture(env, {
    event: 'recipe.published',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { recipe_id: recipeId, doc_id: docId },
  });

  return json({ ok: true, recipe_id: recipeId, doc_id: docId, status: 'published' });
};
