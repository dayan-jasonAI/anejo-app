// POST /api/hub/kitchen/studio/content — one-click brand content from a Creative Studio session.
// Produces a social caption (EN/ES), a menu blurb (EN/ES), an on-brand plating image (Workers AI
// → R2), and macros (when the dish maps to a known bowl). All grounded in the owner's brand brief.
// Auth: kitchen|owner, session-owned. Graceful: demo text without ANTHROPIC_API_KEY, no image
// without the AI binding — never throws. Mirrors studio/message.js conventions.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { buildBrandContext } from '../../../../_lib/studio_context.js';
import { putMedia } from '../../../../_lib/media.js';
import { BOWL_BY_NAME, BOWL_LABEL, scaledBowlMacros } from '../../../../_lib/bowlspec.js';

const MODEL = 'claude-sonnet-4-6';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
// Añejo plating standard appended to every image prompt for on-brand visuals.
const PLATING_STYLE =
  "Professional overhead food photography, premium Mediterranean-Cuban meal-prep bowl in a matte dark slate bowl, " +
  "clockwise sectional plating with the hero protein at the 5-7 o'clock position, vibrant fresh vegetables, " +
  "microgreens garnish, a drizzle of golden sauce, soft natural light, shallow depth of field, cream and gold tones, " +
  "editorial restaurant quality, no text, no watermark.";

// Pull the first balanced {...} JSON object out of a model reply (tolerates ```json fences / prose).
export function extractJson(text) {
  if (!text) return null;
  const s = String(text);
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function demoContent(name) {
  const dish = name || "today's bowl";
  return {
    image_prompt: `${dish}: seared hero protein over quinoa with bright vegetables and microgreens`,
    caption_en: `Fuel that tastes like a treat — our ${dish}. 40/30/30 macros, cooked & delivered fresh across Palm Beach County. #AnejoFit #MealPrep #PalmBeach`,
    caption_es: `Combustible que sabe a premio — nuestro ${dish}. Macros 40/30/30, cocinado y entregado fresco en Palm Beach County. #AnejoFit #MealPrep #PalmBeach`,
    blurb_en: `${dish} — a macro-balanced Mediterranean-Cuban bowl on quinoa with a hero protein and bright, fresh finishes.`,
    blurb_es: `${dish} — un bowl mediterraneo-cubano de macros balanceados sobre quinoa con proteina principal y toques frescos.`,
  };
}

async function generateText(env, { name, transcript }) {
  if (!env.ANTHROPIC_API_KEY) return { ...demoContent(name), demo: true };
  const brand = await buildBrandContext(env).catch(() => '');
  const system = `${brand}

You are Añejo Catering Co.'s content studio. From the dish below, write marketing content in the Añejo brand voice (premium, warm, health-forward, Mediterranean-Cuban). Return STRICT JSON ONLY — no prose, no code fences — with exactly these keys:
{"image_prompt":"...","caption_en":"...","caption_es":"...","blurb_en":"...","blurb_es":"..."}
- caption_en / caption_es: a social caption, 1-2 sentences + 2-3 relevant hashtags.
- blurb_en / blurb_es: a single-sentence menu description.
- image_prompt: a vivid plating description of THIS dish for an image generator (ingredients, colors, composition).`;
  const userMsg = `Dish / recipe: ${name || '(unnamed bowl from this session)'}\n\nChef's session notes:\n${(transcript || '(none)').slice(0, 2000)}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8192, system, messages: [{ role: 'user', content: userMsg }] }),
    });
    if (!r.ok) throw new Error(`AI ${r.status}`);
    const data = await r.json();
    const parsed = extractJson((data.content || []).map((c) => c.text || '').join(''));
    if (!parsed || !parsed.caption_en) throw new Error('unparseable');
    return { ...demoContent(name), ...parsed, demo: false };
  } catch {
    return { ...demoContent(name), demo: true };
  }
}

async function generateImage(env, imagePrompt) {
  if (!env.AI) return { url: null, reason: 'ai_binding_absent' };
  try {
    const out = await env.AI.run(IMAGE_MODEL, { prompt: `${imagePrompt}. ${PLATING_STYLE}` });
    const b64 = out && (out.image || (out.images && out.images[0]));
    if (!b64) return { url: null, reason: 'no_image' };
    const stored = await putMedia(env, { kind: 'studio', dataUrl: `data:image/jpeg;base64,${b64}`, ext: 'jpg' });
    return stored.stored ? { url: stored.url, key: stored.key } : { url: null, reason: stored.error || 'store_failed' };
  } catch {
    return { url: null, reason: 'gen_failed' };
  }
}

// If the dish name maps to a known public bowl, return its macros for the macros card.
function macrosForName(name) {
  const q = String(name || '').trim().toLowerCase();
  if (!q) return null;
  const key = Object.keys(BOWL_BY_NAME).find(
    (n) => n.toLowerCase() === q || (BOWL_LABEL[n] || n).toLowerCase() === q
  );
  if (!key) return null;
  const m = scaledBowlMacros(key, 1);
  return m ? { name: BOWL_LABEL[key] || key, ...m } : null;
}

async function transcriptFor(env, sessionId) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT kind, content FROM recipe_session_events WHERE session_id=? ORDER BY created_at ASC LIMIT 40'
    ).bind(sessionId).all();
    return (results || [])
      .filter((e) => ['user_text', 'ai_assist', 'ai_text', 'voice_transcript'].includes(e.kind))
      .map((e) => e.content || '')
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = ((b && b.session_id) || '').toString().trim();
  const recipeName = ((b && b.recipe_name) || '').toString().trim().slice(0, 120);
  if (!sessionId) return bad('Missing session_id.');

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id=?').bind(sessionId).first();
  if (!session) return bad('Session not found.', 404);
  if (session.staff_id !== ctx.distinct_id && ctx.role !== 'owner') return bad('Session not found.', 404);

  const transcript = await transcriptFor(env, sessionId);
  const text = await generateText(env, { name: recipeName, transcript });
  const image = await generateImage(env, text.image_prompt);
  const macros = macrosForName(recipeName);

  const result = {
    caption_en: text.caption_en,
    caption_es: text.caption_es,
    blurb_en: text.blurb_en,
    blurb_es: text.blurb_es,
    image_url: image.url,
    image_reason: image.reason || null,
    macros,
    demo: text.demo,
  };

  // Log into the session timeline (best-effort).
  try {
    await env.DB.prepare(
      'INSERT INTO recipe_session_events (id, session_id, kind, content, meta, created_at) VALUES (?,?,?,?,?,?)'
    ).bind(id('rse'), sessionId, 'content_generated', recipeName || 'content', toJson(result), now()).run();
  } catch { /* timeline is best-effort */ }

  try {
    await capture(env, {
      event: 'studio.content_generated',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { session_id: sessionId, has_image: !!image.url, demo: text.demo },
    });
  } catch { /* analytics best-effort */ }

  return json({ ok: true, ...result });
};
