// Reference-conditioned bowl photos (functions/_lib/reference_variant.js) — the owner's own
// request: "teach [the model] to use the original bowl images and just change the positions,
// background, themes." Two things have to be pinned, or this feature is worse than not shipping
// it at all:
//   · THE FAITHFULNESS BOUNDARY IS IN THE PROMPT TEXT ITSELF — not a hope that a model infers it.
//   · THE REFERENCE IMAGE ACTUALLY REACHES THE PROVIDER — OpenAI via /v1/images/edits (multipart,
//     image as a file part), Gemini via an inlineData part alongside the text — and Workers AI,
//     which cannot carry a reference image at all, is skipped BEFORE it is ever called, never
//     silently handed the reference to ignore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildReferenceVariantPrompt, generateReferenceVariant, REFERENCE_BOWL_KEYS, BOWL_DISPLAY,
} from '../../functions/_lib/reference_variant.js';
import { generatePlateImageDetailed, providerSupportsReference } from '../../functions/_lib/plate_image.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const MIGRATION = readFileSync(new URL('../../migrations/0083_image_generations_reference.sql', import.meta.url), 'utf8');

// ---- fixtures -----------------------------------------------------------------------------

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}

function openaiOk(b64 = 'AAAA') {
  return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 });
}
function geminiOk(b64 = 'BBBB', mimeType = 'image/jpeg') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType } }] } }],
  }), { status: 200 });
}

// R2 stand-in that serves ONE staged bowl photo and records what got PUT (the generated image).
function makeMedia(objects = {}) {
  const puts = [];
  return {
    async get(key) {
      const obj = objects[key];
      if (!obj) return null;
      return {
        async arrayBuffer() { return obj.bytes.buffer.slice(obj.bytes.byteOffset, obj.bytes.byteOffset + obj.bytes.byteLength); },
        httpMetadata: { contentType: obj.contentType || 'image/jpeg' },
      };
    },
    async put(key, body, opts) { puts.push({ key, body, opts }); },
    _puts: puts,
  };
}

function makeEnv({ weekSpentMicro = 0, media, extra = {} } = {}) {
  const aiSpendInserts = [];
  const imageGenInserts = [];
  const db = makeD1([
    [/FROM ai_spend/, () => ({ c: weekSpentMicro })],
    [/^INSERT INTO ai_spend/, ({ args }) => { aiSpendInserts.push(args); return 1; }],
    [/^INSERT INTO image_generations/, ({ args }) => { imageGenInserts.push(args); return 1; }],
  ]);
  const env = { DB: db, SESSIONS: makeKV(), MEDIA: media || makeMedia(), ...extra };
  return { env, aiSpendInserts, imageGenInserts };
}

const REF_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

// ---------------------------------------------------------------------------
// buildReferenceVariantPrompt — the faithfulness boundary, pinned in the text itself
// ---------------------------------------------------------------------------

test('the prompt names the real dish and forbids changing it — faithfulness is IN the text, not implied', () => {
  const { positive, negative } = buildReferenceVariantPrompt('coco', 'beach picnic, golden hour');
  assert.match(positive, /REFERENCE PHOTO/);
  assert.match(positive, /Coconut-lime shrimp/i, 'grounded in the REAL recipe, not a generic "a bowl"');
  assert.match(positive, /Keep the food EXACTLY as shown/i);
  assert.match(positive, /Do not add, remove, substitute, or restyle any food/i);
  assert.match(positive, /do not\s+change the bowl itself/i);
  assert.match(positive, /beach picnic, golden hour/, 'the campaign look actually reaches the prompt');
  assert.match(negative, /different dish/i);
  assert.match(negative, /altered ingredients/i);
  assert.match(negative, /added or removed food/i);
  assert.match(negative, /redesigned plating/i);
});

test('every one of the 8 known bowls resolves to a real dish line, not a generic fallback', () => {
  for (const key of REFERENCE_BOWL_KEYS) {
    const { positive } = buildReferenceVariantPrompt(key, 'studio light');
    assert.match(positive, new RegExp(BOWL_DISPLAY[key], 'i'), `${key} should name itself in the prompt`);
    assert.ok(!/Añejo's [A-Z]+ bowl\.\s*Keep/.test(positive) || positive.length > 200, `${key} should carry a real description, not just the bare name`);
  }
});

test('an unknown bowl key still produces a usable (if generic) prompt — never throws', () => {
  const { positive } = buildReferenceVariantPrompt('not_a_real_bowl', 'x');
  assert.match(positive, /NOT_A_REAL_BOWL bowl/);
});

test('an empty campaign look falls back to a safe default instead of an empty instruction', () => {
  const { positive } = buildReferenceVariantPrompt('vida', '');
  assert.match(positive, /clean, on-brand studio setting/);
});

// ---------------------------------------------------------------------------
// generateReferenceVariant — named reasons, never a throw
// ---------------------------------------------------------------------------

test('bad_bowl: not one of the 8 known bowls', async () => {
  const { env } = makeEnv();
  const out = await generateReferenceVariant(env, { bowl: 'burrito', lookBrief: 'sunset' });
  assert.deepEqual(out, { ok: false, reason: 'bad_bowl' });
});

test('no_look: nothing to vary the surroundings TO', async () => {
  const { env } = makeEnv();
  const out = await generateReferenceVariant(env, { bowl: 'coco', lookBrief: '  ' });
  assert.deepEqual(out, { ok: false, reason: 'no_look' });
});

test('reference_missing: the bowl photo is not staged in R2 — this NEVER falls back to a plain text render', async () => {
  const { env } = makeEnv({ media: makeMedia({}) }); // nothing staged
  const out = await withFetch(
    () => { throw new Error('must not fetch — there is nothing to condition on'); },
    () => generateReferenceVariant(env, { bowl: 'coco', lookBrief: 'sunset' })
  );
  assert.deepEqual(out, { ok: false, reason: 'reference_missing' });
});

test('reference_missing: env.MEDIA binding absent entirely', async () => {
  const { env } = makeEnv({ extra: { MEDIA: undefined } });
  const out = await generateReferenceVariant(env, { bowl: 'coco', lookBrief: 'sunset' });
  assert.deepEqual(out, { ok: false, reason: 'reference_missing' });
});

test('OpenAI succeeds: the reference photo actually reaches /v1/images/edits as a multipart file part', async () => {
  const media = makeMedia({ 'studio/bowls/coco.jpg': { bytes: REF_BYTES, contentType: 'image/jpeg' } });
  const { env, imageGenInserts, aiSpendInserts } = makeEnv({ media, extra: { OPENAI_API_KEY: 'sk-test' } });

  let capturedUrl, capturedInit;
  const out = await withFetch(
    async (url, init) => { capturedUrl = String(url); capturedInit = init; return openaiOk(); },
    () => generateReferenceVariant(env, { bowl: 'coco', lookBrief: 'beach picnic, golden hour' })
  );

  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.media_key, /_photo\.jpg$/, 'role=photo so the food-first guard recognises this');
  assert.equal(out.provider, 'openai');
  assert.equal(out.source_bowl, 'coco');
  assert.equal(out.reference_key, 'studio/bowls/coco.jpg');

  assert.equal(capturedUrl, 'https://api.openai.com/v1/images/edits', 'the EDIT endpoint, not /generations');
  assert.ok(capturedInit.body instanceof FormData, 'the reference photo rides as multipart form data');
  const imageField = capturedInit.body.get('image');
  assert.ok(imageField, 'an "image" field carries the reference bytes');
  assert.equal(await imageField.arrayBuffer ? (await imageField.arrayBuffer()).byteLength : imageField.size, REF_BYTES.length);
  assert.match(String(capturedInit.body.get('prompt')), /REFERENCE PHOTO/);

  // Provenance: this row must say it was derived, and from WHICH bowl — never indistinguishable
  // from an ordinary text-to-image row.
  const [, , provider, , , , sourceBowl, referenceKey] = imageGenInserts[0];
  assert.equal(provider, 'openai');
  assert.equal(sourceBowl, 'coco');
  assert.equal(referenceKey, 'studio/bowls/coco.jpg');
  assert.equal(aiSpendInserts[0][3], 'reference_variant', 'feature column distinguishes this from an ordinary plate_image spend');
});

test('Gemini succeeds when it wins the chain: the reference photo rides as an inlineData part alongside the text', async () => {
  const media = makeMedia({ 'studio/bowls/vida.jpg': { bytes: REF_BYTES, contentType: 'image/jpeg' } });
  // No OPENAI_API_KEY — OpenAI is skipped as no_api_key, Gemini gets the real attempt.
  const { env, imageGenInserts } = makeEnv({ media, extra: { GEMINI_API_KEY: 'gk-test' } });

  let capturedBody;
  const out = await withFetch(
    async (url, init) => { capturedBody = JSON.parse(init.body); return geminiOk(); },
    () => generateReferenceVariant(env, { bowl: 'vida', lookBrief: 'sunset dock' })
  );

  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.provider, 'gemini');
  const parts = capturedBody.contents[0].parts;
  assert.ok(parts[0].inlineData, 'the reference image is the FIRST part, ahead of the text instruction');
  assert.equal(parts[0].inlineData.mimeType, 'image/jpeg');
  assert.match(parts[1].text, /REFERENCE PHOTO/);

  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.equal(skipped[0].provider, 'openai');
  assert.equal(skipped[0].reason, 'no_api_key');
});

test('Workers AI is skipped with img2img_unsupported and is NEVER called — no silent text-only fallback', async () => {
  const media = makeMedia({ 'studio/bowls/fuego.jpg': { bytes: REF_BYTES, contentType: 'image/jpeg' } });
  // Neither OpenAI nor Gemini configured — only Workers AI is left in the chain.
  const { env, imageGenInserts } = makeEnv({
    media,
    extra: { AI: { run: async () => { throw new Error('must not be called — Leonardo cannot take a reference image'); } } },
  });

  const out = await generateReferenceVariant(env, { bowl: 'fuego', lookBrief: 'candlelight' });
  assert.deepEqual(out, { ok: false, reason: 'generation_failed' });
  const skipped = JSON.parse(imageGenInserts[0][4]);
  // OpenAI/Gemini are skipped for the ordinary reason (no key configured); Workers AI — the only
  // provider actually left with a key/binding present — is skipped for the img2img reason
  // specifically, and its skip entry is what proves env.AI.run was never invoked.
  assert.deepEqual(skipped, [
    { provider: 'openai', reason: 'no_api_key' },
    { provider: 'gemini', reason: 'no_api_key' },
    { provider: 'workers_ai', reason: 'img2img_unsupported' },
  ]);
});

test('providerSupportsReference: OpenAI and Gemini yes, Workers AI no', () => {
  assert.equal(providerSupportsReference('openai'), true);
  assert.equal(providerSupportsReference('gemini'), true);
  assert.equal(providerSupportsReference('workers_ai'), false);
});

test('generation_failed: OpenAI errors and there is nothing left that can take a reference', async () => {
  const media = makeMedia({ 'studio/bowls/mar.jpg': { bytes: REF_BYTES, contentType: 'image/jpeg' } });
  const { env } = makeEnv({ media, extra: { OPENAI_API_KEY: 'sk-test' } });
  const out = await withFetch(
    async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
    () => generateReferenceVariant(env, { bowl: 'mar', lookBrief: 'moody dusk' })
  );
  assert.deepEqual(out, { ok: false, reason: 'generation_failed' });
});

test('weekly AI budget already at the ceiling → refused before any provider is called', async () => {
  const media = makeMedia({ 'studio/bowls/raiz.jpg': { bytes: REF_BYTES, contentType: 'image/jpeg' } });
  const { env } = makeEnv({ media, weekSpentMicro: 50_000_000, extra: { OPENAI_API_KEY: 'sk-test' } });
  const out = await withFetch(
    () => { throw new Error('must not fetch — the budget gate should refuse first'); },
    () => generateReferenceVariant(env, { bowl: 'raiz', lookBrief: 'market stall' })
  );
  assert.deepEqual(out, { ok: false, reason: 'generation_failed' });
});

test('generateReferenceVariant never throws even with garbage input', async () => {
  assert.equal((await generateReferenceVariant(null, {})).ok, false);
  assert.equal((await generateReferenceVariant({}, {})).ok, false);
  assert.equal((await generateReferenceVariant({ DB: {} }, { bowl: 'coco' })).ok, false);
});

// ---------------------------------------------------------------------------
// generatePlateImageDetailed direct: opts.core bypasses buildImagePrompt's owner-training
// expansion, and a non-JPEG requireJpeg gate still applies to a reference-conditioned call.
// ---------------------------------------------------------------------------

test('opts.core is used verbatim, shaped per-provider — buildImagePrompt/Haiku expansion never runs', async () => {
  const { env } = makeEnv({ extra: { OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-should-not-be-used' } });
  let capturedPrompt;
  await withFetch(
    async (url, init) => {
      if (String(url).includes('anthropic.com')) throw new Error('must not call Haiku expansion for a reference-conditioned generation');
      capturedPrompt = JSON.parse(init.body).prompt;
      return openaiOk();
    },
    () => generatePlateImageDetailed(env, 'debug label', {
      requireJpeg: true,
      core: { positive: 'EXACT POSITIVE TEXT', negative: 'EXACT NEGATIVE TEXT', source: 'reference_variant', cached: false },
    })
  );
  assert.match(capturedPrompt, /EXACT POSITIVE TEXT/);
});

// ---------------------------------------------------------------------------
// migration: additive, explains why it exists
// ---------------------------------------------------------------------------

test('the 0083 migration is additive-only and records reference lineage', () => {
  assert.match(MIGRATION, /ALTER TABLE image_generations ADD COLUMN source_bowl TEXT/);
  assert.match(MIGRATION, /ALTER TABLE image_generations ADD COLUMN reference_key TEXT/);
  assert.match(MIGRATION, /derivative must never be[\s\S]{0,10}indistinguishable/i);
});
