// Shared plate-image generator for the Creative Studio (chat + Content tab). One place to tune
// the providers, the style, and the output handling — so swapping/reordering engines is a
// config change, not a redeploy.
//
// The owner's verdict on the old single-model path (Workers AI / Leonardo Phoenix only) was
// "you can tell it's AI." He has OpenAI and Google accounts and loves ChatGPT's visuals, so this
// is now a FALLBACK CHAIN, tried in order: OpenAI (gpt-image-1) → Gemini (nano-banana image) →
// Workers AI (Leonardo Phoenix, unchanged from before — the last resort, not the first choice).
//
// Every step feature-detects and NEVER throws into a caller: no key configured, a request that
// errors, or one that hangs past its timeout all just fall through to the next provider. All
// three unavailable → null, exactly like the single-provider version this replaces. Callers keep
// getting a bare `string | null` back (see generatePlateImage below) — nothing about who actually
// produced the image, or why the others were skipped, changes that contract. That information is
// instead written to the `image_generations` table (migrations/0074) keyed by the returned URL,
// so the HUB can look it up and show "made by OpenAI" without every caller having to thread a
// second return value through its own response shape.
//
// Files under _lib are NOT routed.
import { id as newId, now as clock } from './util.js';
import { putMedia } from './media.js';
import { budgetGate, recordImageSpend } from './ai_budget.js';

// ---------------------------------------------------------------------------------------------
// Provider order/enablement — owner-configurable WITHOUT a redeploy. Mirrors the KV-override →
// env-fallback → default pattern in pay.js (getPayConfig): settings live in KV so the HUB can
// change them live, env vars give an ops-level default per environment, and the constant below
// is what ships if nobody has touched either.
// ---------------------------------------------------------------------------------------------
const CFG_KEY = 'cfg:image_providers';
const PROVIDERS = ['openai', 'gemini', 'workers_ai'];
const DEFAULT_ORDER = ['openai', 'gemini', 'workers_ai']; // best visual quality first, cheapest/always-on last

function parseListEnv(v) {
  return String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Keep only known provider names, de-duped, in the order given — then APPEND any provider the
// list left out (rather than dropping it). A config saved before a new provider shipped, or one
// that only lists the providers Dayan cares to reorder, must not silently disable the rest.
function cleanOrder(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = String(raw || '').trim().toLowerCase();
    if (PROVIDERS.includes(p) && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  for (const p of DEFAULT_ORDER) if (!seen.has(p)) out.push(p);
  return out;
}

function cleanDisabled(list) {
  const set = new Set(
    (Array.isArray(list) ? list : []).map((p) => String(p || '').trim().toLowerCase()).filter((p) => PROVIDERS.includes(p))
  );
  return [...set];
}

// Effective provider config: KV override → env → defaults. Never throws — a broken KV read (or
// no SESSIONS binding at all) degrades to the env/default order, same spirit as getPayConfig.
export async function getImageProviderConfig(env) {
  let kv = {};
  try {
    const raw = env && env.SESSIONS && (await env.SESSIONS.get(CFG_KEY));
    if (raw) kv = JSON.parse(raw) || {};
  } catch { kv = {}; }
  const envOrder = parseListEnv(env && env.IMAGE_PROVIDER_ORDER);
  const envDisabled = parseListEnv(env && env.IMAGE_PROVIDER_DISABLED);
  return {
    order: cleanOrder(kv.order && kv.order.length ? kv.order : (envOrder.length ? envOrder : DEFAULT_ORDER)),
    disabled: cleanDisabled(kv.disabled && kv.disabled.length ? kv.disabled : envDisabled),
  };
}

// Save an owner-set order/disabled-list to KV. Used by the HUB settings route
// (api/hub/owner/image-provider-config.js) — kept here, next to the config it governs, same as
// pay.js keeps getPayConfig/setPayConfig together.
export async function setImageProviderConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const next = { order: cleanOrder(cfg && cfg.order), disabled: cleanDisabled(cfg && cfg.disabled) };
  try {
    await env.SESSIONS.put(CFG_KEY, JSON.stringify(next));
    return { ok: true, config: next };
  } catch { return { ok: false, error: 'Could not save image provider settings.' }; }
}

export const IMAGE_PROVIDERS = PROVIDERS;

// ---------------------------------------------------------------------------------------------
// Prompt shaping. Natural, appetizing food photography — deliberately NOT editorial/CGI. The
// underlying INTENT (real photo, imperfect home plating, warm natural light, avoid the glossy
// "CGI/plastic" look) is shared, but the SYNTAX to express it differs per provider: Workers AI's
// Leonardo Phoenix takes a separate `negative_prompt` field; OpenAI and Gemini have no such
// parameter, so their "avoid" cues have to live inside one positive prompt string instead.
// ---------------------------------------------------------------------------------------------
const PLATING_STYLE =
  'Natural food photography of a Mediterranean-Cuban meal-prep bowl on a real kitchen counter in ' +
  'soft window daylight, candid slightly-imperfect home plating, real food texture, fresh herbs and ' +
  'vegetables, matte ceramic bowl, warm natural tones, shallow depth of field — looks like a genuine ' +
  'photo a chef snapped on a phone, appetizing and believable.';
const NEGATIVE_PROMPT =
  'CGI, 3D render, digital art, illustration, cartoon, plastic, waxy, artificial, over-glossy, ' +
  'oversaturated, hyperreal, airbrushed, fake, video-game, watermark, text, logo, deformed, blurry.';

// OpenAI (gpt-image-1) follows literal, camera-forward language well and has no negative-prompt
// field — the "avoid" list becomes an explicit trailing clause.
function openaiPrompt(dishPrompt) {
  return (
    `Photorealistic food photo, shot on a DSLR with a 50mm lens: ${dishPrompt}. ${PLATING_STYLE} ` +
    `Do NOT render this as: ${NEGATIVE_PROMPT}`
  );
}

// Gemini's image model responds better to narrative, scene-setting prompts than to a bare
// keyword list, so the same intent is phrased as a short scene description instead.
function geminiPrompt(dishPrompt) {
  return (
    `A candid, unstaged photo — the kind a chef snaps on their phone right before service — of ${dishPrompt}. ` +
    `${PLATING_STYLE} This must read as a real photograph, never as: ${NEGATIVE_PROMPT}`
  );
}

// ---------------------------------------------------------------------------------------------
// Timeouts. A slow provider must not hang the request that's waiting on it.
//   - openai / gemini: 15s. These are the FIRST two links in the chain — a hung external call
//     still has to leave enough of the Function's wall-clock budget for the remaining providers
//     to get a real attempt, not just a token one.
//   - workers_ai: 20s. It's the LAST resort (nothing follows it if it's slow), and 20s matches
//     what the original single-provider code implicitly tolerated — env.AI.run() had no timeout
//     at all before this rewrite, so 20s is a bound being ADDED, not one being tightened.
// ---------------------------------------------------------------------------------------------
const TIMEOUT_MS = { openai: 15_000, gemini: 15_000, workers_ai: 20_000 };

// Race any promise against a timeout. Does not (cannot, for env.AI.run) cancel the underlying
// work — losing the race just means we stop waiting on it and move to the next provider; the
// abandoned call is dropped when the Function's isolate context ends.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

// fetch() bound to the same timeout budget, but ALSO aborts the in-flight HTTP request on
// timeout (unlike withTimeout alone) so a hung OpenAI/Gemini call doesn't keep an outbound
// connection open after we've already moved on.
async function fetchWithTimeout(url, init, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// ---------------------------------------------------------------------------------------------
// Providers. Each returns { bytes, contentType, ext, model } on success, or THROWS (caught by
// the chain in generatePlateImage) — never returns partial/garbage data for the chain to store.
// ---------------------------------------------------------------------------------------------
const OPENAI_MODEL = 'gpt-image-1';

async function callOpenAI(env, dishPrompt, opts = {}) {
  // gpt-image-1 defaults to PNG. Instagram accepts JPEG ONLY (JPEG_ONLY in _lib/instagram.js),
  // and this Worker has no image binding to transcode with — so when the caller needs a
  // publishable slide, the format has to be asked for at the source or the image is unusable.
  const jpeg = opts.requireJpeg === true;
  const r = await fetchWithTimeout(
    'https://api.openai.com/v1/images/generations',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      // 'medium' quality: a deliberate cost/quality balance, not the max — this is a meal-prep
      // Instagram grid, not print work, and 'high' can be 3-4x the cost for a marginal gain here.
      body: JSON.stringify({
        model: OPENAI_MODEL, prompt: openaiPrompt(dishPrompt), size: '1024x1024', quality: 'medium', n: 1,
        ...(jpeg ? { output_format: 'jpeg' } : {}),
      }),
    },
    TIMEOUT_MS.openai
  );
  if (!r.ok) throw new Error(`openai_${r.status}`);
  const data = await r.json();
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('openai_empty_response');
  return jpeg
    ? { bytes: base64ToBytes(b64), contentType: 'image/jpeg', ext: 'jpg', model: OPENAI_MODEL }
    : { bytes: base64ToBytes(b64), contentType: 'image/png', ext: 'png', model: OPENAI_MODEL };
}

const GEMINI_MODEL = 'gemini-2.5-flash-image';

async function callGemini(env, dishPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const r = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt(dishPrompt) }] }] }),
    },
    TIMEOUT_MS.gemini
  );
  if (!r.ok) throw new Error(`gemini_${r.status}`);
  const data = await r.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const imgPart = parts.find((p) => p && p.inlineData && p.inlineData.data);
  if (!imgPart) throw new Error('gemini_empty_response');
  const mime = imgPart.inlineData.mimeType || 'image/png';
  return { bytes: base64ToBytes(imgPart.inlineData.data), contentType: mime, ext: EXT_BY_MIME[mime] || 'png', model: GEMINI_MODEL };
}

// Leonardo Phoenix 1.0: photographic, strong prompt adherence, supports a negative prompt so we
// can steer AWAY from the glossy "CGI/plastic" look. (Returns raw image bytes, not base64.)
// UNCHANGED from the pre-chain version — this is the fallback of last resort, not a place to
// experiment. Handles both raw-bytes models (Phoenix/SDXL: ReadableStream/Response) and
// base64 models (flux), same as before.
const WORKERS_AI_MODEL = '@cf/leonardo/phoenix-1.0';

async function callWorkersAI(env, dishPrompt) {
  const out = await env.AI.run(WORKERS_AI_MODEL, {
    prompt: `${dishPrompt}. ${PLATING_STYLE}`,
    negative_prompt: NEGATIVE_PROMPT,
    width: 1024, height: 1024, num_steps: 30, guidance: 3,
  });
  if (out && typeof out.arrayBuffer === 'function') {
    return { bytes: new Uint8Array(await out.arrayBuffer()), contentType: 'image/jpeg', ext: 'jpg', model: WORKERS_AI_MODEL };
  }
  if (out && typeof out.getReader === 'function') {
    return { bytes: new Uint8Array(await new Response(out).arrayBuffer()), contentType: 'image/jpeg', ext: 'jpg', model: WORKERS_AI_MODEL };
  }
  const b64 = out && (out.image || (out.images && out.images[0]));
  if (!b64) throw new Error('workers_ai_empty_response');
  return { bytes: base64ToBytes(b64), contentType: 'image/jpeg', ext: 'jpg', model: WORKERS_AI_MODEL };
}

const PROVIDER_FN = { openai: callOpenAI, gemini: callGemini, workers_ai: callWorkersAI };

// Feature-detect: is this provider even configured in this environment? No key → not available,
// full stop — we never assume a provider works just because it's in the order.
function providerAvailable(env, name) {
  if (name === 'openai') return !!(env && env.OPENAI_API_KEY);
  if (name === 'gemini') return !!(env && env.GEMINI_API_KEY);
  if (name === 'workers_ai') return !!(env && env.AI);
  return false;
}

// Best-effort provenance row: which provider produced this image (or none), which model, and
// why every other provider in the order was skipped. Keyed by the produced image's URL (unique
// per call — putMedia mints a random R2 key) rather than a foreign key into a caller's own
// table, because this is a shared _lib helper called from more than one route (studio content +
// studio chat today) and must not know its callers' schemas. Never throws — a lost provenance
// row must not cost the customer the image itself.
async function recordProvenance(env, { imageUrl, provider, model, skipped, prompt }) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(
      'INSERT INTO image_generations (id, image_url, provider, model, skipped, prompt, created_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(
      newId('img'), imageUrl || null, provider || null, model || null,
      JSON.stringify(skipped || []), String(prompt || '').slice(0, 500), clock()
    ).run();
  } catch { /* best-effort — see comment above */ }
}

/**
 * Generate ONE on-brand plate photo → store to R2 → return the full stored record, or null.
 * Tries providers in the configured order, skipping any that are disabled or unconfigured, and
 * falling through on error/timeout. NEVER throws.
 *
 * opts.requireJpeg — the caller needs an Instagram-publishable image. OpenAI is ASKED for JPEG
 *   (output_format); Workers AI already returns JPEG; Gemini's image model returns whatever it
 *   returns, so a non-JPEG response is SKIPPED as `not_jpeg` and the chain moves on. Skipping is
 *   the honest outcome: there is no image binding in wrangler.toml to transcode with, so storing
 *   a PNG here would produce a slide the publish path refuses — a "fixed" post that cannot post.
 * opts.role — role suffix for the R2 filename, so the food-first guard can recognise what this
 *   produced (see putMedia in _lib/media.js).
 *
 * Returns { url, key, provider, model }. generatePlateImage below keeps the older bare-URL
 * contract its existing Studio callers were written against.
 */
export async function generatePlateImageDetailed(env, prompt, opts = {}) {
  if (!env || !prompt) return null;
  const skipped = [];
  try {
    // The image chain draws from the SAME $50/week ceiling as every other AI surface (chat,
    // social plan, eod drafts) — checked once up front, not bypassed by trying "just OpenAI".
    // See ai_budget.js: the last call before the ceiling may overshoot slightly (its cost lands
    // only after it runs), and that overshoot is the only slack the owner accepted.
    const gate = await budgetGate(env);
    if (!gate.ok) {
      await recordProvenance(env, { imageUrl: null, provider: null, model: null, prompt, skipped: [{ provider: 'all', reason: 'weekly_ai_budget_reached' }] });
      return null;
    }

    const { order, disabled } = await getImageProviderConfig(env);
    for (const name of order) {
      if (disabled.includes(name)) { skipped.push({ provider: name, reason: 'disabled' }); continue; }
      if (!providerAvailable(env, name)) { skipped.push({ provider: name, reason: 'no_api_key' }); continue; }

      let result;
      try {
        result = await withTimeout(PROVIDER_FN[name](env, prompt, opts), TIMEOUT_MS[name]);
      } catch (e) {
        skipped.push({ provider: name, reason: e && e.message === 'timeout' ? 'timeout' : String((e && e.message) || 'error') });
        continue;
      }

      // Checked AFTER the call, not before: only OpenAI can be asked for a format up front, and a
      // provider that happens to return JPEG anyway should still count. The spend is not recorded
      // for a skip here — nothing usable was produced, and recording it would let an unusable
      // format quietly eat the weekly ceiling.
      if (opts.requireJpeg === true && result.contentType !== 'image/jpeg') {
        skipped.push({ provider: name, reason: `not_jpeg:${result.contentType || 'unknown'}` });
        continue;
      }

      const stored = await putMedia(env, {
        kind: 'studio', bytes: result.bytes, contentType: result.contentType, ext: result.ext, role: opts.role,
      });
      if (!stored || !stored.stored) { skipped.push({ provider: name, reason: 'store_failed' }); continue; }

      // Spend is only recorded for the provider that actually produced an image — matching how
      // recordSpend only fires on billed tokens, providers only bill on a successful generation.
      await recordImageSpend(env, { feature: 'plate_image', provider: name, model: result.model });
      await recordProvenance(env, { imageUrl: stored.url, provider: name, model: result.model, prompt, skipped });
      return { url: stored.url, key: stored.key, provider: name, model: result.model };
    }

    await recordProvenance(env, { imageUrl: null, provider: null, model: null, prompt, skipped });
    return null;
  } catch {
    return null;
  }
}

/**
 * The original contract, unchanged for the Studio callers written against it: a bare short URL,
 * or null. New callers that need the R2 key (a social slide stores media_key, not a URL) should
 * use generatePlateImageDetailed above rather than trying to parse the key back out of the URL.
 */
export async function generatePlateImage(env, prompt) {
  const out = await generatePlateImageDetailed(env, prompt);
  return out ? out.url : null;
}
