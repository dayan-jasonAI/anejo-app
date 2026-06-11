// GET /api/hub/kitchen/docs/get?id=doc_xxx — single versioned doc read (role-scoped).
// Fires doc.viewed. If the doc links a recipe, the recipe is included for inline render.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { parseJson } from '../../../../_lib/hub.js';

function visibleTo(doc, role) {
  const scope = parseJson(doc.role_scope, null);
  if (!Array.isArray(scope) || scope.length === 0) return true;
  return scope.includes(role) || role === 'owner';
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const docId = (url.searchParams.get('id') || '').trim();
  if (!docId) return bad('Missing doc id.');

  const doc = await env.DB.prepare('SELECT * FROM docs WHERE id = ? AND active = 1').bind(docId).first();
  if (!doc) return bad('Doc not found.', 404);
  if (!visibleTo(doc, ctx.role)) return bad('Not permitted for this role.', 403);

  let recipe = null;
  if (doc.recipe_id) {
    const r = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(doc.recipe_id).first();
    if (r) {
      recipe = {
        ...r,
        ingredients: parseJson(r.ingredients, []),
        steps: parseJson(r.steps, []),
        nutrition: parseJson(r.nutrition, null),
        tags: parseJson(r.tags, []),
      };
    }
  }

  await capture(env, {
    event: 'doc.viewed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { doc_type: doc.doc_type, doc_id: doc.id },
  });

  return json({
    doc: {
      id: doc.id, doc_type: doc.doc_type, title: doc.title, body: doc.body,
      version: doc.version, updated_at: doc.updated_at, recipe_id: doc.recipe_id,
      image_key: doc.image_key || null,
    },
    recipe,
  });
};
