// Shared plate-image generator for the Creative Studio (chat + Content tab). One place to tune
// the providers, the style, and the output handling — so swapping/reordering engines is a
// config change, not a redeploy.
//
// The owner's verdict on the old single-model path (Workers AI / Leonardo Phoenix only) was
// "you can tell it's AI." He has OpenAI and Google accounts and loves ChatGPT's visuals, so this
// is now a FALLBACK CHAIN, tried in order: OpenAI (gpt-image-2) → Gemini (nano-banana image) →
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
import { buildImagePrompt, buildFallbackCore, shapeForProvider } from './image_prompt.js';

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
// Prompt shaping now lives in _lib/image_prompt.js (buildImagePrompt). It turns the caller's
// one-line brief into a rich, TRAINABLE prompt — grounded in the owner's Team Training first,
// the brand's Photo standard second, and the original hardcoded PLATING_STYLE/NEGATIVE_PROMPT
// only as a floor when the owner has trained nothing. Kept as a separate module (not inlined
// here) because it has its own D1/KV/Anthropic dependencies this file otherwise has no reason to
// carry, and because plate_image.js's job is the PROVIDER CHAIN, not prompt authoring.
// ---------------------------------------------------------------------------------------------
// MEASURED, not guessed. The first real gpt-image-2 call in production was killed by the old 15s
// bound — image_generations recorded `openai: "The operation was aborted"` and the chain silently
// handed back a Workers AI image, which is precisely the "you can tell it's AI" outcome the whole
// provider chain exists to prevent. gpt-image-2 is a REASONING image model: it deliberates before
// it draws, and tens of seconds is normal, not a fault. A budget written for the older
// non-reasoning models turns a working key into an invisible no-op.
//
// Now generous by default and overridable per environment, because the right number is a fact
// about a vendor's current model and will move again.
//   - openai 90s: room for a reasoning model to finish. Nobody is blocked on this — Studio shows
//     a pending state, and the weekly planner runs unattended.
//   - gemini 45s: also a real generation, but not a reasoning one.
//   - workers_ai 20s: unchanged. It is the last resort and was always the fast one.
const numEnv = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
};
const timeoutsFor = (env) => ({
  openai: numEnv(env && env.IMAGE_TIMEOUT_OPENAI_MS, 90_000),
  gemini: numEnv(env && env.IMAGE_TIMEOUT_GEMINI_MS, 45_000),
  workers_ai: numEnv(env && env.IMAGE_TIMEOUT_WORKERS_AI_MS, 20_000),
});

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

// The other direction of base64ToBytes above — needed once a REFERENCE image (real bowl bytes
// pulled from R2) has to ride along INSIDE a JSON body (Gemini's inlineData part). OpenAI's edits
// endpoint below needs no such thing: it takes the raw bytes directly as a multipart file part.
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Which providers in the chain can even ACCEPT a reference image. Checked in the loop below
// BEFORE a provider is ever called, not discovered by letting the call fail — the alternative
// (silently rendering text-only when a reference was supplied) is the single worst outcome named
// in the reference-variant build brief: a "styled variant" that quietly became a DIFFERENT dish.
// Workers AI's Leonardo Phoenix model is text-to-image only — verified against Cloudflare's own
// model schema (no image input parameter exists) — so it is never a candidate for this path.
export function providerSupportsReference(name) {
  return name === 'openai' || name === 'gemini';
}

// ---------------------------------------------------------------------------------------------
// Providers. Each returns { bytes, contentType, ext, model } on success, or THROWS (caught by
// the chain in generatePlateImage) — never returns partial/garbage data for the chain to store.
// ---------------------------------------------------------------------------------------------
// A model id is a fact about the FUTURE, and this one already expired once: the original
// hardcoded 'gpt-image-1' is on OpenAI's deprecation list for 2026-10-23, and 'gpt-image-1.5'
// follows on 2026-12-01. Hardcoding the current flagship just re-arms the same trap on a later
// date — and the failure is silent from the outside, because the chain simply falls through to
// the next provider and the owner sees worse images with no error anywhere. So: current default,
// overridable from the environment WITHOUT a code change, exactly like TEAM_LEAD_MODEL.
export const OPENAI_MODEL_DEFAULT = 'gpt-image-2';
const openaiModel = (env) => (env && env.OPENAI_IMAGE_MODEL) || OPENAI_MODEL_DEFAULT;

// Each callX() below now takes `promptData` — the ALREADY-SHAPED { prompt, negative_prompt }
// from buildImagePrompt(env, brief, { provider }) — rather than the raw one-line brief. Shaping
// happens once per provider attempt in generatePlateImage's loop; these functions just send it.
//
// `opts.referenceImage` — { bytes: Uint8Array, contentType: string } — is how reference_variant.js
// (and any future caller) hands a REAL photo in to condition on. Only set by a caller that
// actually has one; every existing caller (food_photo.js, carousel_gen.js, Studio chat/content)
// leaves it undefined and gets EXACTLY the text-to-image behavior this file always had.
async function callOpenAI(env, promptData, opts = {}) {
  // gpt-image-* defaults to PNG. Instagram accepts JPEG ONLY (JPEG_ONLY in _lib/instagram.js),
  // and this Worker has no image binding to transcode with — so when the caller needs a
  // publishable slide, the format has to be asked for at the source or the image is unusable.
  const jpeg = opts.requireJpeg === true;
  const ref = opts.referenceImage;
  let r;
  if (ref && ref.bytes && ref.bytes.length) {
    // Image-to-image via POST /v1/images/edits: the reference photo rides along as a real
    // multipart file part, not just described in words. This is the ONLY thing that makes "the
    // bowl stays faithful" possible — the generations call below (text only) has nothing to be
    // faithful TO, and would be re-imagining the dish from a paragraph, exactly what a reference-
    // conditioned call exists to avoid. FormData/Blob are standard Workers-runtime globals — fetch
    // sets the multipart boundary itself, so no content-type header is set here (setting one by
    // hand would omit the boundary and the request would arrive unparseable).
    const form = new FormData();
    form.append('model', openaiModel(env));
    form.append('prompt', promptData.prompt);
    form.append('image', new Blob([ref.bytes], { type: ref.contentType || 'image/jpeg' }), `reference.${EXT_BY_MIME[ref.contentType] || 'jpg'}`);
    form.append('size', '1024x1024');
    form.append('quality', 'medium');
    form.append('n', '1');
    if (jpeg) form.append('output_format', 'jpeg');
    r = await fetchWithTimeout(
      'https://api.openai.com/v1/images/edits',
      { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form },
      timeoutsFor(env).openai
    );
  } else {
    r = await fetchWithTimeout(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        // 'medium' quality: a deliberate cost/quality balance, not the max — this is a meal-prep
        // Instagram grid, not print work, and 'high' can be 3-4x the cost for a marginal gain here.
        body: JSON.stringify({
          model: openaiModel(env), prompt: promptData.prompt, size: '1024x1024', quality: 'medium', n: 1,
          ...(jpeg ? { output_format: 'jpeg' } : {}),
        }),
      },
      timeoutsFor(env).openai
    );
  }
  if (!r.ok) throw new Error(`openai_${r.status}`);
  const data = await r.json();
  const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('openai_empty_response');
  return jpeg
    ? { bytes: base64ToBytes(b64), contentType: 'image/jpeg', ext: 'jpg', model: openaiModel(env) }
    : { bytes: base64ToBytes(b64), contentType: 'image/png', ext: 'png', model: openaiModel(env) };
}

// Same reasoning as the OpenAI model above — overridable without a deploy.
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash-image';
const geminiModel = (env) => (env && env.GEMINI_IMAGE_MODEL) || GEMINI_MODEL_DEFAULT;

async function callGemini(env, promptData, opts = {}) {
  const ref = opts.referenceImage;
  const reqParts = [];
  // Reference image FIRST, text second — Gemini's image-editing contract: an inlineData part
  // alongside a text instruction in the SAME generateContent call, no separate edit endpoint the
  // way OpenAI has one. GEMINI_API_KEY is not set in production today (see the build brief), so
  // this branch is inert there until a key is added — nothing about that absence is allowed to
  // touch the OpenAI branch above; providerAvailable() already gates this whole function from
  // ever being called without a key.
  if (ref && ref.bytes && ref.bytes.length) {
    reqParts.push({ inlineData: { mimeType: ref.contentType || 'image/jpeg', data: bytesToBase64(ref.bytes) } });
  }
  reqParts.push({ text: promptData.prompt });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel(env)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const r = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: reqParts }] }),
    },
    timeoutsFor(env).gemini
  );
  if (!r.ok) throw new Error(`gemini_${r.status}`);
  const data = await r.json();
  const resParts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const imgPart = resParts.find((p) => p && p.inlineData && p.inlineData.data);
  if (!imgPart) throw new Error('gemini_empty_response');
  const mime = imgPart.inlineData.mimeType || 'image/png';
  return { bytes: base64ToBytes(imgPart.inlineData.data), contentType: mime, ext: EXT_BY_MIME[mime] || 'png', model: geminiModel(env) };
}

// Leonardo Phoenix 1.0: photographic, strong prompt adherence, supports a negative prompt so we
// can steer AWAY from the glossy "CGI/plastic" look. (Returns raw image bytes, not base64.)
// This is the fallback of last resort, not a place to experiment. Handles both raw-bytes models
// (Phoenix/SDXL: ReadableStream/Response) and base64 models (flux), same as before.
const WORKERS_AI_MODEL = '@cf/leonardo/phoenix-1.0';

async function callWorkersAI(env, promptData, opts = {}) {
  // Belt-and-suspenders: generatePlateImageDetailed's loop already skips Workers AI outright
  // (reason 'img2img_unsupported', see providerSupportsReference above) before ever reaching here
  // whenever a reference image is attached — Leonardo Phoenix has no image-input parameter to
  // send it to. This throw exists so a future change to that loop can never silently hand this
  // provider a reference it would just ignore, which would render a photo of a DIFFERENT dish
  // under a caption that promised the real one.
  if (opts.referenceImage) throw new Error('img2img_unsupported');
  const out = await env.AI.run(WORKERS_AI_MODEL, {
    prompt: promptData.prompt,
    negative_prompt: promptData.negative_prompt,
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
// Exported so the HUB can show an UNCONFIGURED provider as unconfigured. Without this the settings
// page can only list the order, and a provider that is silently skipped every single call looks
// identical to one that is working — which is exactly how "the images still look AI-generated"
// goes undiagnosed for weeks.
export function providerAvailable(env, name) {
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
// sourceBowl/referenceKey (migrations/0083) are how a reference-conditioned image (see
// _lib/reference_variant.js) records its lineage — WHICH real photo it was derived from — so it
// can never be mistaken in this ledger for an ordinary text-to-image render. Both are undefined
// for every other caller, so their INSERT is unaffected.
async function recordProvenance(env, { imageUrl, provider, model, skipped, prompt, sourceBowl, referenceKey }) {
  if (!env || !env.DB) return;
  try {
    try {
      await env.DB.prepare(
        'INSERT INTO image_generations (id, image_url, provider, model, skipped, prompt, source_bowl, reference_key, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(
        newId('img'), imageUrl || null, provider || null, model || null,
        JSON.stringify(skipped || []), String(prompt || '').slice(0, 500),
        sourceBowl || null, referenceKey || null, clock()
      ).run();
    } catch {
      // Pre-0083 schema (deploy window): a provenance row missing its reference lineage is still
      // far better than no row at all — the image itself is already stored regardless.
      await env.DB.prepare(
        'INSERT INTO image_generations (id, image_url, provider, model, skipped, prompt, created_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(
        newId('img'), imageUrl || null, provider || null, model || null,
        JSON.stringify(skipped || []), String(prompt || '').slice(0, 500), clock()
      ).run();
    }
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
 * opts.referenceImage — { bytes, contentType } of a REAL photo to condition on (reference_variant.js
 *   is the one caller today). Providers that cannot take an input image (Workers AI) are skipped
 *   outright — reason 'img2img_unsupported' — rather than called and left to silently ignore it.
 * opts.core — a pre-shaped, provider-agnostic prompt CORE ({ positive, negative, source }) that,
 *   when given, is shaped per-provider with shapeForProvider() directly instead of going through
 *   buildImagePrompt()'s owner-training expansion. reference_variant.js uses this: the faithfulness
 *   boundary ("keep the food exactly as shown") has to hold regardless of what the owner has
 *   trained the team on for ORDINARY photography, so it is built deterministically, not expanded.
 * opts.provenance — { sourceBowl, referenceKey } recorded onto the image_generations row
 *   (migrations/0083) when this call is reference-conditioned; omitted, both columns stay NULL.
 *
 * Returns { url, key, provider, model }. generatePlateImage below keeps the older bare-URL
 * contract its existing Studio callers were written against.
 */
export async function generatePlateImageDetailed(env, prompt, opts = {}) {
  if (!env || !prompt) return null;
  const skipped = [];
  const provenanceExtra = { sourceBowl: opts.provenance && opts.provenance.sourceBowl, referenceKey: opts.provenance && opts.provenance.referenceKey };
  const hasReference = !!(opts.referenceImage && opts.referenceImage.bytes && opts.referenceImage.bytes.length);
  try {
    // The image chain draws from the SAME $50/week ceiling as every other AI surface (chat,
    // social plan, eod drafts) — checked once up front, not bypassed by trying "just OpenAI".
    // See ai_budget.js: the last call before the ceiling may overshoot slightly (its cost lands
    // only after it runs), and that overshoot is the only slack the owner accepted. A reference-
    // conditioned call is not exempt — it is still an image_generations/gpt-image-2 call.
    const gate = await budgetGate(env);
    if (!gate.ok) {
      await recordProvenance(env, { imageUrl: null, provider: null, model: null, prompt, skipped: [{ provider: 'all', reason: 'weekly_ai_budget_reached' }], ...provenanceExtra });
      return null;
    }

    const timeouts = timeoutsFor(env);

    const { order, disabled } = await getImageProviderConfig(env);
    for (const name of order) {
      if (disabled.includes(name)) { skipped.push({ provider: name, reason: 'disabled' }); continue; }
      if (!providerAvailable(env, name)) { skipped.push({ provider: name, reason: 'no_api_key' }); continue; }
      // Checked BEFORE the provider is ever called — see providerSupportsReference's own comment
      // for why this must never be discovered by letting the call fail (or worse, succeed with a
      // text-only render that quietly ignored the reference).
      if (hasReference && !providerSupportsReference(name)) { skipped.push({ provider: name, reason: 'img2img_unsupported' }); continue; }

      // Expand the one-line brief into this provider's shaped prompt — UNLESS the caller already
      // supplied a pre-shaped core (opts.core), in which case that core is used AS-IS. Owner
      // training/AI expansion is for ordinary photography direction; a reference-conditioned call
      // has one non-negotiable instruction (keep the food exactly as shown) that must not be
      // diluted by an expansion step built for a different job. buildImagePrompt() is documented
      // to never throw, but it draws on training/AI/KV — the outer try/catch is belt-and-suspenders
      // so a bug in the expansion path degrades to the exact deterministic concatenation
      // (buildFallbackCore) rather than skipping a provider that could have worked.
      let promptData;
      if (opts.core) {
        promptData = shapeForProvider(name, opts.core);
      } else {
        try {
          promptData = await buildImagePrompt(env, prompt, { provider: name });
        } catch {
          promptData = shapeForProvider(name, buildFallbackCore(prompt));
        }
      }

      let result;
      try {
        // opts carries requireJpeg/role/referenceImage for the caller's needs; timeouts[name] is
        // main's per-provider budget (a reasoning image model needs longer than Leonardo). Both.
        result = await withTimeout(PROVIDER_FN[name](env, promptData, opts), timeouts[name]);
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
      // Tagged with a distinct feature name when reference-conditioned so the owner's weekly
      // ai_spend rollup can tell "made from scratch" and "styled from a real photo" apart, the
      // same distinction image_generations now carries in its own columns.
      await recordImageSpend(env, { feature: hasReference ? 'reference_variant' : 'plate_image', provider: name, model: result.model });
      await recordProvenance(env, { imageUrl: stored.url, provider: name, model: result.model, prompt, skipped, ...provenanceExtra });
      return { url: stored.url, key: stored.key, provider: name, model: result.model };
    }

    await recordProvenance(env, { imageUrl: null, provider: null, model: null, prompt, skipped, ...provenanceExtra });
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
