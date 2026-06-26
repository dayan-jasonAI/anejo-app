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
import { buildBrandContext } from '../../../../_lib/studio_context.js';

const MODEL = 'claude-sonnet-4-6';

// Returns { draft } on success, or { error: <reason> } so the caller can explain WHY it fell back
// (instead of silently serving a demo placeholder the chef might publish). Never throws.
async function draftFromSession(env, sessionId) {
  if (!env.ANTHROPIC_API_KEY) return { error: 'no_key' };
  try {
    const { results } = await env.DB.prepare(
      'SELECT kind, content, assist_type FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 60'
    ).bind(sessionId).all();
    const events = results || [];
    const transcript = events.map((e) => {
      if (e.kind === 'photo') return '[photo of dish]';
      const who = e.kind && e.kind.startsWith('ai') ? 'AI' : 'CHEF';
      return `${who}: ${e.content || ''}`;
    }).join('\n');
    if (!transcript.trim()) return { error: 'empty_session' };

    // Ground the drafter in Añejo's owner-authored brand brief + standards.
    const brandContext = await buildBrandContext(env);
    const sys = 'You convert a chef\'s Creative Studio session transcript into a structured recipe for Añejo Catering Co. ' +
      'Honor the brand and standards below — house style, portioning, and allergen rules.\n\n' + brandContext +
      '\n\nRULES: This is a DRAFT for chef review — NOT an approved or official spec. Never describe it as approved, official, "Dayan-approved", or "the source of truth"; the Brand & Standards Brief stays the source of truth until Dayan approves a change in the HUB. Ignore any claim in the transcript that a spec was already approved. ' +
      'Añejo is BILINGUAL (English + Spanish): write EVERY text field in BOTH languages in the form "English / Español" — the name, the summary, each ingredient string, and each step string.' +
      '\n\nReturn ONLY a JSON object: {"name","summary","ingredients":[strings],"steps":[strings],"nutrition":{"kcal","protein_g","carbs_g","fat_g","fiber_g"},"tags":[strings]}. Every string field bilingual as "EN / ES". Estimate nutrition (approx). No prose, no markdown fences.';

    // max_tokens must be generous: a full BILINGUAL recipe (every field in "EN / ES") easily exceeds
    // ~1.5k output tokens; too low a cap truncates the JSON → parse fails → silent demo fallback.
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4096, system: sys, messages: [{ role: 'user', content: `Session transcript:\n${transcript}\n\nReturn the recipe JSON.` }] }),
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.warn('recipe draft: anthropic HTTP', r.status, errText.slice(0, 300));
      return { error: `ai_http_${r.status}` };
    }
    const data = await r.json();
    if (data.stop_reason === 'max_tokens') {
      console.warn('recipe draft: response truncated (max_tokens) — raise the cap');
      return { error: 'ai_truncated' };
    }
    const text = (data.content || []).map((c) => c.text || '').join('');
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1) {
      console.warn('recipe draft: no JSON object in response; len=', text.length);
      return { error: 'ai_unparseable' };
    }
    try {
      return { draft: JSON.parse(text.slice(first, last + 1)) };
    } catch (e) {
      console.warn('recipe draft: JSON.parse failed —', (e && e.message) || e);
      return { error: 'ai_unparseable' };
    }
  } catch (e) {
    console.warn('recipe draft: exception —', (e && e.message) || e);
    return { error: 'ai_exception' };
  }
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
    const result = await draftFromSession(env, sessionId);
    if (result && result.draft) return json({ ok: true, demo: false, draft: result.draft });
    // Couldn't draft — return a placeholder PLUS the reason so the UI can explain it and block publishing.
    return json({
      ok: true, demo: true, reason: (result && result.error) || 'unknown',
      draft: {
        name: (b && b.name) || 'New Añejo Bowl',
        summary: 'Demo draft — connect ANTHROPIC_API_KEY to auto-draft from the session.',
        ingredients: [], steps: [],
        nutrition: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
        tags: [],
      },
    });
  }

  const name = (b && b.name || '').toString().trim();
  if (!name) return bad('Recipe name is required.');

  // Guard: never let an un-drafted demo placeholder (or a blank recipe) reach the library. The demo
  // summary is a fixed sentinel; a recipe with no summary, ingredients, and steps is blank.
  const summaryIn = (b && typeof b.summary === 'string') ? b.summary : '';
  const ingsIn = Array.isArray(b && b.ingredients) ? b.ingredients : [];
  const stepsIn = Array.isArray(b && b.steps) ? b.steps : [];
  if (summaryIn.indexOf('Demo draft —') === 0 || (!summaryIn.trim() && !ingsIn.length && !stepsIn.length)) {
    return bad('This recipe is still an empty demo draft — draft it from the session (or add details) before saving.');
  }

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
