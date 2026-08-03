// The trainable half of "the images look nothing like ChatGPT's" (see plate_image.js's header
// for the OTHER half, the provider chain). This module turns the weekly planner's one-sentence
// `image_brief` ("Single COCO bowl, centered, dark matte surface, warm light") into a rich,
// provider-shaped image prompt — the same expansion step ChatGPT does silently before it renders.
//
// THE PROBLEM THIS SOLVES. Until now the ENTIRE photographic direction lived in a hardcoded
// PLATING_STYLE constant in plate_image.js — the owner could not change how his food is
// photographed without a developer and a redeploy. Meanwhile Team Training (training.js) already
// captures exactly that direction, in the owner's own words, plus notes on reference photos he
// flagged good/bad — it just never reached the image path. After this change, editing HUB ->
// Train the team changes how the food is shot. That is the entire point of this file; see the
// "owner training actually reaches the expanded prompt" test for the pin.
//
// PRIORITY ORDER when grounding the expansion (see expansionSystemPrompt):
//   1. The owner's training (training.js) — his rules + flagged-photo notes. Wins on conflict.
//   2. The brand's Photo standard (BRAND_PHOTO_STANDARD below) — always in force.
//   3. PLATING_STYLE, the old hardcoded constant — used ONLY as a floor when the owner has
//      trained nothing yet, so a fresh install still gets a coherent, on-brand photo.
//
// FAILS SAFE, ALWAYS. buildImagePrompt() never throws and never returns something worse than
// today's behavior: no ANTHROPIC_API_KEY, the $50/week budget gate closed, a model error/timeout,
// or a garbage/empty model response all fall back to EXACTLY the pre-existing concatenation
// (dishPrompt + PLATING_STYLE, NEGATIVE_PROMPT) — see buildFallbackCore + the "byte-identical to
// today" tests. Image generation must never get worse, or start failing, because expansion broke.
//
// CACHED per (brief, training-version) in KV — see getExpansionCore for the exact key and how a
// training edit invalidates it without ever having to actively delete anything.
//
// Files under functions/_lib are NOT routed.
import { budgetGate, recordSpend } from './ai_budget.js';
import { loadTraining, formatTraining } from './training.js';

// Cheap model — this runs once per (brief, training-version), not per request, but it still
// draws from the SAME $50/week ceiling as chat/social/eod-drafts (see ai_budget.js PRICES).
const EXPANSION_MODEL = 'claude-haiku-4-5';

// A hung Anthropic call must not eat into the wall-clock budget the provider chain needs for
// OpenAI/Gemini/Workers AI right after this. Short on purpose — this is one cheap Haiku call,
// not a provider render.
const EXPANSION_TIMEOUT_MS = 8_000;

// KV cache TTL for a successful expansion. Generous, because the whole point is "don't pay twice
// to re-render the same post" — but not infinite, so a long-dead brief/training pairing eventually
// falls out of KV on its own instead of accumulating forever.
const CACHE_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

// ---------------------------------------------------------------------------------------------
// The floor: exactly the constant that used to be the ENTIRE photographic direction, hardcoded,
// unreachable by the owner without a developer. Kept verbatim (moved from plate_image.js, not
// rewritten) so the fallback path below is provably identical to pre-existing behavior.
// ---------------------------------------------------------------------------------------------
export const PLATING_STYLE =
  'Natural food photography of a Mediterranean-Cuban meal-prep bowl on a real kitchen counter in ' +
  'soft window daylight, candid slightly-imperfect home plating, real food texture, fresh herbs and ' +
  'vegetables, matte ceramic bowl, warm natural tones, shallow depth of field — looks like a genuine ' +
  'photo a chef snapped on a phone, appetizing and believable.';
export const NEGATIVE_PROMPT =
  'CGI, 3D render, digital art, illustration, cartoon, plastic, waxy, artificial, over-glossy, ' +
  'oversaturated, hyperreal, airbrushed, fake, video-game, watermark, text, logo, deformed, blurry.';

// Compiled from docs/brand-standards-brief.md section 10 ("Plating & presentation" -> "Photo
// standard" + "Signature bowl layout") plus the 2026-07-27 Reposado light ruling (brand_context.js
// / R-0031) — the parts of the brief that are actually photographic direction. A COMPILED
// CONSTANT ON PURPOSE: the task that grounds this is a different agent's job (consolidating brand
// loading); this is not a new brand loader, just the one section of the existing brief this
// module needs. If docs/brand-standards-brief.md section 10 changes materially, update this too.
export const BRAND_PHOTO_STANDARD =
  "Full round bowl visible, bowl front and center. Clockwise sectional plating with the hero " +
  "protein placed roughly 5 o'clock to 7 o'clock; vegetables arranged in clean, intentional " +
  'sections; microgreens finishing the bowl. Background is premium matte black, dark forest ' +
  'green, cream, or another neutral. Lighting reads as luxury and editorial — per the owner\'s ' +
  'own words, "the perfect mix of bright and dark, they both coexist": never a dark background ' +
  'with only the food lit, and never bright-everything either. Ingredients look bright and ' +
  'high-quality; sauce may be shown as a controlled drizzle for the photo even though it is ' +
  'served on the side operationally. No messy edges, no overfilled containers, no soggy greens, ' +
  'no cheap takeout look.';

// ---------------------------------------------------------------------------------------------
// Small helpers — deliberately local rather than imported from a route/other lib file:
//  - extractJsonObject mirrors api/hub/kitchen/studio/content.js's extractJson (balanced-brace
//    scan, tolerant of prose/code-fences around the JSON), duplicated because a _lib file must
//    not depend on a routed api/ file.
//  - tinyHash is the same djb2 shape as trust_ledger.js's captionHash: stable and cheap, not
//    cryptographic — it only has to pick a KV key, never resist an adversary.
// ---------------------------------------------------------------------------------------------
function extractJsonObject(text) {
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

function tinyHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// fetch() bound to a timeout that ALSO aborts the in-flight request when it fires (mirrors
// plate_image.js's fetchWithTimeout — duplicated rather than imported to avoid a circular import,
// since plate_image.js imports buildImagePrompt from THIS file).
async function fetchWithTimeout(url, init, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// A SECOND, independent timeout layered on top of fetchWithTimeout's AbortController (same
// two-layer shape as plate_image.js's withTimeout). Belt-and-suspenders: the abort signal is
// what actually tears down the outbound connection, but this race is what GUARANTEES the caller
// gets control back at `ms`, even against a fetch implementation that doesn't honor `signal`.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// A version string that changes the instant the owner's active training changes shape, without
// a second D1 round trip: `loadTraining` already returns rows newest-updated-first (see
// training.js's ORDER BY), so rules[0]/examples[0] ARE the max(updated_at) among active rows.
// Counting rows too (not just the newest timestamp) is what catches a DELETE: deactivating a rule
// that wasn't the most-recently-touched one wouldn't otherwise move the newest timestamp at all.
export function trainingVersionOf(rules, examples) {
  const r0 = rules && rules[0] ? rules[0].updated_at : 0;
  const e0 = examples && examples[0] ? examples[0].updated_at : 0;
  return `${(rules || []).length}.${r0}.${(examples || []).length}.${e0}`;
}

function cacheKeyFor(brief, version) {
  return `imgprompt:v1:${version}:${tinyHash(brief)}`;
}

// The deterministic, no-network, cannot-fail core: exactly what plate_image.js concatenated
// before this module existed. `dish` is interpolated raw (no trim/normalize) so this is
// byte-identical to the old `${dishPrompt}. ${PLATING_STYLE}` / `NEGATIVE_PROMPT` — see the
// "matches today's behavior exactly" tests.
export function buildFallbackCore(brief) {
  const dish = brief == null ? '' : String(brief);
  return { positive: `${dish}. ${PLATING_STYLE}`, negative: NEGATIVE_PROMPT, source: 'fallback', cached: false };
}

// The instructions handed to Haiku. Priority order lives in the text itself (see file header),
// and the floor (#3, PLATING_STYLE) is included ONLY when the owner has trained nothing — an
// empty install must still get a coherent brief, but a trained one must not be diluted by the
// constant this whole feature exists to escape from.
function expansionSystemPrompt(trainingText) {
  const includeFloor = !trainingText;
  return [
    'You expand a short food-photo art-direction brief into ONE rich, appetizing, photorealistic ' +
      'image-generation prompt, plus a short negative list of what to avoid in the render.',
    'Follow the photographic direction below in this priority order — where two disagree, the ' +
      'earlier one wins:',
    "1) THE OWNER'S OWN TRAINING (if given below) — his stated rules and his notes on reference " +
      'photos he flagged good or bad. This is the whole point: what he teaches the team must be ' +
      'what actually shapes the photo.',
    "2) AÑEJO'S BRAND PHOTO STANDARD (below) — always in force, refined by #1 wherever the two overlap.",
    includeFloor
      ? '3) The owner has not trained the team on photography yet, so also hold to this baseline ' +
        'house style as the floor.'
      : null,
    trainingText ? `\n${trainingText}\n` : null,
    `\n=== AÑEJO BRAND PHOTO STANDARD ===\n${BRAND_PHOTO_STANDARD}\n=== END ===`,
    includeFloor ? `\n=== BASELINE STYLE (floor — no owner training exists yet) ===\n${PLATING_STYLE}\n=== END ===` : null,
    '\nReturn STRICT JSON only — no prose, no markdown fences: {"positive":"...","negative":"..."}',
    '"positive": one dense paragraph (3-5 sentences) that names the SPECIFIC dish from the brief ' +
      'below and describes the photographic scene — angle, light, surface, mood — ready to hand an ' +
      'image generator as-is.',
    '"negative": a short comma-separated list (not sentences) of things to avoid — art styles, ' +
      'textures, defects.',
  ].filter((x) => x != null).join('\n');
}

// One Haiku call. Returns { positive, negative } on a usable answer, or null on ANY failure
// (network error, timeout, non-2xx, unparseable JSON, or a suspiciously short "positive" that
// reads as a refusal/placeholder rather than real art direction) — null means "the caller falls
// back", never a thrown error.
async function expandWithHaiku(env, brief, trainingText) {
  const system = expansionSystemPrompt(trainingText);
  let r;
  try {
    r = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: EXPANSION_MODEL,
          max_tokens: 500,
          system,
          messages: [{ role: 'user', content: `Art-direction brief for this photo: ${brief}`.slice(0, 1600) }],
        }),
      },
      EXPANSION_TIMEOUT_MS
    );
  } catch { return null; }
  if (!r.ok) return null;
  let data;
  try { data = await r.json(); } catch { return null; }
  // Metered whether or not the answer turns out usable — a call that burned tokens on a garbage
  // reply still cost money, same principle as every other feature on this ledger.
  await recordSpend(env, { feature: 'image_prompt_expand', model: EXPANSION_MODEL, usage: data && data.usage });
  const text = ((data && data.content) || []).map((c) => c.text || '').join('');
  const parsed = extractJsonObject(text);
  const positive = String((parsed && parsed.positive) || '').trim().slice(0, 4000);
  const negative = String((parsed && parsed.negative) || '').trim().slice(0, 600);
  if (positive.length < 20) return null; // empty/garbage/refusal — not real art direction
  return { positive, negative };
}

// The provider-agnostic core: { positive, negative, source: 'expanded'|'fallback', cached }.
// Provider-agnostic on purpose — the expansion (owner training + brand standard) doesn't change
// per provider, only how it gets WRAPPED does (see shapeForProvider) — so one cache entry serves
// every provider the fallback chain tries for the same brief.
async function getExpansionCore(env, brief) {
  const fallback = buildFallbackCore(brief);
  // No key -> no network call, full stop. Also means: no D1 (training) or KV (cache) touched at
  // all when Añejo hasn't configured Anthropic — matches "no ANTHROPIC_API_KEY -> exactly today".
  if (!env || !env.ANTHROPIC_API_KEY) return fallback;

  // Same ceiling every AI surface shares. Checked BEFORE training/cache reads so a closed budget
  // costs nothing beyond this one gate check.
  const gate = await budgetGate(env);
  if (!gate.ok) return fallback;

  // Loaded ONCE, reused both for the cache key (via trainingVersionOf) and as the grounding text
  // itself — loadTraining/formatTraining never throw (see training.js), so no extra try/catch
  // is needed here beyond what those functions already guarantee.
  const { rules, examples } = await loadTraining(env);
  const trainingText = formatTraining({ rules, examples }).text;
  const version = trainingVersionOf(rules, examples);
  const cacheKey = cacheKeyFor(brief, version);

  // CACHE INVALIDATION: the key embeds `version` — a fingerprint of the active training rows
  // (count + newest updated_at). The instant the owner adds, edits, or deletes ANY training rule
  // or example, `version` changes, this brief's next lookup computes a DIFFERENT key, and the old
  // entry is simply never read again. Nothing is ever actively deleted (that would mean
  // enumerating every brief that ever hit this cache); the orphaned entry just ages out via
  // CACHE_TTL_SEC. A cache MISS always re-runs the real expansion — training can never look
  // "stuck" behind stale cached output, which would be worse than the cost of re-running it.
  if (env.SESSIONS) {
    try {
      const raw = await env.SESSIONS.get(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && typeof cached.positive === 'string' && cached.positive) {
          return { positive: cached.positive, negative: cached.negative || '', source: 'expanded', cached: true };
        }
      }
    } catch { /* corrupt/unreadable cache entry — treat exactly like a miss */ }
  }

  let expanded;
  try {
    expanded = await withTimeout(expandWithHaiku(env, brief, trainingText), EXPANSION_TIMEOUT_MS);
  } catch {
    expanded = null; // the outer race lost — treat exactly like any other expansion failure
  }
  if (!expanded) return fallback;

  // Only a SUCCESSFUL expansion is cached — never the fallback. Caching the fallback would mean
  // that once someone adds ANTHROPIC_API_KEY (or next week's budget resets), this exact brief
  // keeps serving the old no-AI answer until the entry expires, which is the opposite of what the
  // owner would expect from "I just turned this on."
  if (env.SESSIONS) {
    try { await env.SESSIONS.put(cacheKey, JSON.stringify(expanded), { expirationTtl: CACHE_TTL_SEC }); } catch { /* best-effort */ }
  }
  return { ...expanded, source: 'expanded', cached: false };
}

// Wrap the provider-agnostic core into what each image API actually accepts.
//   - OpenAI / Gemini: no negative-prompt parameter exists, so the "avoid" cues are folded into
//     one positive string (negative_prompt: null tells the caller there is nothing separate to
//     send). Wrapper phrasing is UNCHANGED from the pre-existing openaiPrompt()/geminiPrompt().
//   - Workers AI (Leonardo): takes a REAL negative_prompt field, so it is returned separately
//     rather than folded in.
// `negative || NEGATIVE_PROMPT` is a last-resort guard: if a model call ever returned a usable
// `positive` but an empty `negative`, Leonardo still gets a real negative prompt rather than none.
export function shapeForProvider(provider, core) {
  const { positive, negative, source, cached } = core;
  const neg = negative || NEGATIVE_PROMPT;
  if (provider === 'workers_ai') {
    return { prompt: positive, negative_prompt: neg, source, cached };
  }
  if (provider === 'gemini') {
    return {
      prompt:
        'A candid, unstaged photo — the kind a chef snaps on their phone right before service — of ' +
        `${positive} This must read as a real photograph, never as: ${neg}`,
      negative_prompt: null,
      source,
      cached,
    };
  }
  // 'openai', and the generic/unspecified default — same wrapper voice as the original
  // openaiPrompt(): literal, camera-forward language, with the "avoid" list as a trailing clause.
  return {
    prompt: `Photorealistic food photo, shot on a DSLR with a 50mm lens: ${positive} Do NOT render this as: ${neg}`,
    negative_prompt: null,
    source,
    cached,
  };
}

/**
 * Turn the planner's one-line `image_brief` into a rich, provider-shaped image prompt.
 *
 *   const promptData = await buildImagePrompt(env, brief, { provider: 'openai' });
 *   // -> { prompt: string, negative_prompt: string|null, source: 'expanded'|'fallback', cached: boolean }
 *
 * NEVER THROWS. On any failure anywhere in the expansion path — no key, budget closed, model
 * error/timeout, garbage output, even a bug in this file's own logic — this resolves to the
 * exact same shape a caller would have gotten from the pre-existing hardcoded concatenation, just
 * wrapped in the requested provider's voice. Image generation must never get worse, or start
 * failing, because expansion broke.
 */
export async function buildImagePrompt(env, brief, { provider } = {}) {
  try {
    const core = await getExpansionCore(env, brief);
    return shapeForProvider(provider, core);
  } catch {
    // Belt-and-suspenders: getExpansionCore/expandWithHaiku already guard every internal failure
    // mode, but shaping the deterministic fallback here too costs nothing and needs no network,
    // so this branch cannot itself fail.
    return shapeForProvider(provider, buildFallbackCore(brief));
  }
}
