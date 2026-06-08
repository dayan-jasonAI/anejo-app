// POST /api/hub/kitchen/recipe/create — finalize a recipe from a Creative Studio session.
// Body: { session_id?, name, summary?, ingredients?[], steps?[], nutrition?{}, tags?[], hero_photo? }
//        ?ai_draft=1 (or body.ai_draft) → ask Claude to draft the structured recipe from the
//        session transcript, then return the draft (NOT yet persisted) for chef review.
// On a normal POST: creates a draft recipe, links it to the session (status finalized),
// and fires recipe.created.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson, parseJson } from '../../../../_lib/hub.js';

const MODEL = 'claude-sonnet-4-6';

async function draftFromSession(env, sessionId) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const { results } = await env.DB.prepare(
    'SELECT kind, content, assist_type FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 60'
  ).bind(sessionId).all();
  const transcript = (results || []).map((e) => {
    if (e.kind === 'photo') return '[photo of dish]';
    const who = e.kind && e.kind.startsWith('ai') ? 'AI' : 'CHEF';
    return `${who}: ${e.content || ''}`;
  }).join('\n');

  const sys = 'You convert a chef\'s Creative Studio session transcript into a structured recipe for Añejo Catering Co. (Mediterranean-Cuban longevity bowls). Return ONLY a JSON object: {"name","summary","ingredients":[strings],"steps":[strings],"nutrition":{"kcal","protein_g","carbs_g","fat_g","fiber_g"},"tags":[strings]}. Estimate nutrition (approx). No prose, no markdown fences.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys, messages: [{ role: 'user', content: `Session transcript:\n${transcript}\n\nReturn the recipe JSON.` }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1) return null;
    return JSON.parse(text.slice(first, last + 1));
  } catch { return null; }
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const url = new URL(request.url);
  const wantDraft = url.searchParams.get('ai_draft') === '1' || !!(b && b.ai_draft);
  const sessionId = (b && b.session_id || '').toString().trim() || null;

  // Draft-only mode: return an AI-proposed recipe for the chef to review/edit. Not persisted.
  if (wantDraft) {
    if (!sessionId) return bad('ai_draft requires a session_id.');
    const draft = await draftFromSession(env, sessionId);
    if (!draft) {
      return json({
        ok: true, demo: true,
        draft: {
          name: (b && b.name) || 'New Añejo Bowl',
          summary: 'Demo draft — connect ANTHROPIC_API_KEY to auto-draft from the session.',
          ingredients: [], steps: [],
          nutrition: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
          tags: [],
        },
      });
    }
    return json({ ok: true, demo: false, draft });
  }

  const name = (b && b.name || '').toString().trim();
  if (!name) return bad('Recipe name is required.');

  let session = null;
  if (sessionId) {
    session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
    if (!session) return bad('Session not found.', 404);
  }

  const recipeId = id('rcp');
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO recipes (id, session_id, name, summary, ingredients, steps, nutrition, tags, hero_photo, status, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    recipeId, sessionId, name, (b && b.summary) || null,
    toJson(Array.isArray(b && b.ingredients) ? b.ingredients : []),
    toJson(Array.isArray(b && b.steps) ? b.steps : []),
    toJson((b && b.nutrition) || null),
    toJson(Array.isArray(b && b.tags) ? b.tags : []),
    (b && b.hero_photo) || null,
    'draft', staff ? staff.id : null, ts, ts
  ).run();

  let sessionMinutes = null;
  if (session) {
    sessionMinutes = Math.max(0, Math.round((ts - Number(session.started_at)) / 60000));
    await env.DB.prepare(
      "UPDATE recipe_sessions SET status = 'finalized', recipe_id = ?, finalized_at = ?, updated_at = ? WHERE id = ?"
    ).bind(recipeId, ts, ts, sessionId).run();
  }

  await capture(env, {
    event: 'recipe.created',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: {
      session_minutes: sessionMinutes,
      media_count: session ? session.media_count : null,
      ai_assist_count: session ? session.ai_assist_count : null,
      recipe_id: recipeId,
    },
  });

  const recipe = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(recipeId).first();
  return json({
    ok: true,
    recipe: {
      ...recipe,
      ingredients: parseJson(recipe.ingredients, []),
      steps: parseJson(recipe.steps, []),
      nutrition: parseJson(recipe.nutrition, null),
      tags: parseJson(recipe.tags, []),
    },
  });
};
