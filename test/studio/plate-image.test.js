// The plate-image provider chain (functions/_lib/plate_image.js): OpenAI (gpt-image-1) ->
// Gemini (nano-banana image) -> Workers AI (Leonardo Phoenix, the old single-provider path).
//
// The owner's complaint that started this rewrite was "you can tell it's AI" on the Leonardo-only
// path, and he specifically likes ChatGPT's visuals — so OpenAI has to be tried FIRST, Gemini
// SECOND, and Leonardo only as the fallback of last resort. Four behaviors are pinned here:
//   · FEATURE-DETECT, NEVER ASSUME — no key configured means that provider is silently skipped,
//     never attempted, never a thrown error.
//   · FALL THROUGH ON FAILURE — an HTTP error or a timeout from one provider must not stop the
//     chain; the next provider still gets a real attempt.
//   · NEVER THROWS — all three unavailable/failing is a null return, exactly like the single-
//     provider function this replaces, not an unhandled rejection into a caller.
//   · PROVENANCE + SPEND ARE RECORDED — the winning provider is written to image_generations
//     (so the HUB can show "made by OpenAI"), and its cost is metered into the SAME ai_spend
//     ledger/ceiling every other AI surface shares — never bypassed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  generatePlateImage, getImageProviderConfig, setImageProviderConfig, IMAGE_PROVIDERS,
} from '../../functions/_lib/plate_image.js';
import { WEEKLY_LIMIT_MICRO } from '../../functions/_lib/ai_budget.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const MIGRATION = readFileSync(new URL('../../migrations/0074_image_generations.sql', import.meta.url), 'utf8');

// ---- fixtures -----------------------------------------------------------------------------

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}

// One D1 stub covering both tables the chain writes to (ai_spend for the budget meter,
// image_generations for provenance) plus the budget gate's weekly-sum read.
function makeEnv({ weekSpentMicro = 0, kvSeed = {}, extra = {} } = {}) {
  const aiSpendInserts = [];
  const imageGenInserts = [];
  const db = makeD1([
    [/FROM ai_spend/, () => ({ c: weekSpentMicro })],
    [/^INSERT INTO ai_spend/, ({ args }) => { aiSpendInserts.push(args); return 1; }],
    [/^INSERT INTO image_generations/, ({ args }) => { imageGenInserts.push(args); return 1; }],
  ]);
  const mediaPuts = [];
  const env = {
    DB: db,
    SESSIONS: makeKV(kvSeed),
    MEDIA: { async put(key, body, opts) { mediaPuts.push({ key, body, opts }); } },
    ...extra,
  };
  return { env, aiSpendInserts, imageGenInserts, mediaPuts };
}

function openaiOk(b64 = 'AAAA') {
  return new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 });
}
function openaiHttpError(status = 500) {
  return new Response(JSON.stringify({ error: 'boom' }), { status });
}
function geminiOk(b64 = 'BBBB', mimeType = 'image/png') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: b64, mimeType } }] } }],
  }), { status: 200 });
}
function geminiHttpError(status = 500) {
  return new Response(JSON.stringify({ error: 'boom' }), { status });
}

function fetchRouter({ openai, gemini } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('api.openai.com')) {
      if (!openai) throw new Error('unexpected OpenAI call — no key should have been configured');
      return typeof openai === 'function' ? openai(u) : openai;
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      if (!gemini) throw new Error('unexpected Gemini call — no key should have been configured');
      return typeof gemini === 'function' ? gemini(u) : gemini;
    }
    throw new Error(`unexpected fetch: ${u}`);
  };
}

function workersAi(run) {
  return { AI: { run } };
}
const workersAiOk = () => workersAi(async () => ({ async arrayBuffer() { return new Uint8Array([9, 9, 9]).buffer; } }));
const workersAiFails = () => workersAi(async () => { throw new Error('leonardo down'); });

// ---- the chain: order, fallthrough, never-throw -------------------------------------------

test('OpenAI succeeds: it is tried first and wins — Gemini/Workers AI are never touched', async () => {
  const { env, aiSpendInserts, imageGenInserts } = makeEnv({
    extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test', ...workersAiFails() },
  });
  const url = await withFetch(
    fetchRouter({ openai: () => openaiOk(), gemini: () => { throw new Error('must not call Gemini'); } }),
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.match(url, /^\/api\/hub\/media\//);
  assert.equal(imageGenInserts[0][2], 'openai', 'provider column');
  assert.equal(imageGenInserts[0][3], 'gpt-image-1', 'model column');
  assert.equal(aiSpendInserts.length, 1, 'exactly one spend row, for the winning provider only');
  assert.equal(aiSpendInserts[0][4], 'gpt-image-1');
});

test('OpenAI has no key configured → silently skipped, Gemini wins, no throw', async () => {
  const { env, imageGenInserts } = makeEnv({ extra: { GEMINI_API_KEY: 'gk-test' } }); // no OPENAI_API_KEY
  const url = await withFetch(
    fetchRouter({ gemini: () => geminiOk() }),
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.match(url, /^\/api\/hub\/media\//);
  assert.equal(imageGenInserts[0][2], 'gemini');
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.deepEqual(skipped, [{ provider: 'openai', reason: 'no_api_key' }]);
});

test('OpenAI returns an HTTP error → falls through to Gemini, which wins', async () => {
  const { env, imageGenInserts } = makeEnv({ extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test' } });
  const url = await withFetch(
    fetchRouter({ openai: () => openaiHttpError(500), gemini: () => geminiOk() }),
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.match(url, /^\/api\/hub\/media\//);
  assert.equal(imageGenInserts[0][2], 'gemini');
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].provider, 'openai');
  assert.equal(skipped[0].reason, 'openai_500');
});

test('OpenAI hangs past its timeout → falls through to Gemini, which wins (bounded, not blocked forever)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { env, imageGenInserts } = makeEnv({ extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test' } });
  const pending = withFetch(
    fetchRouter({ openai: () => new Promise(() => {}), gemini: () => geminiOk() }), // OpenAI never resolves
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  // The chain has to clear a few REAL microtask hops first (budgetGate's D1 read, the KV
  // provider-config read) before it even reaches the point of registering OpenAI's timeout —
  // tick() only advances the mocked clock, it does not drain the microtask queue. setImmediate
  // is a macrotask, so awaiting one guarantees every pending microtask has already run by the
  // time we tick, and the timer we're about to fire actually exists.
  await new Promise((resolve) => setImmediate(resolve));
  // Advance past OpenAI's 15s bound — see TIMEOUT_MS in plate_image.js for why 15s.
  t.mock.timers.tick(15_000);
  const url = await pending;
  assert.match(url, /^\/api\/hub\/media\//);
  assert.equal(imageGenInserts[0][2], 'gemini');
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.equal(skipped[0].provider, 'openai');
  assert.equal(skipped[0].reason, 'timeout');
});

test('both OpenAI and Gemini fail → falls through to Workers AI, which wins', async () => {
  const { env, imageGenInserts, aiSpendInserts } = makeEnv({
    extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test', ...workersAiOk() },
  });
  const url = await withFetch(
    fetchRouter({ openai: () => openaiHttpError(500), gemini: () => geminiHttpError(503) }),
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.match(url, /^\/api\/hub\/media\//);
  assert.equal(imageGenInserts[0][2], 'workers_ai');
  assert.equal(imageGenInserts[0][3], '@cf/leonardo/phoenix-1.0');
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.deepEqual(skipped.map((s) => s.provider), ['openai', 'gemini']);
  assert.equal(aiSpendInserts[0][4], '@cf/leonardo/phoenix-1.0');
});

test('all three fail/unavailable → null, and it NEVER throws', async () => {
  const { env, imageGenInserts, aiSpendInserts } = makeEnv({
    extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test', ...workersAiFails() },
  });
  const url = await withFetch(
    fetchRouter({ openai: () => openaiHttpError(500), gemini: () => geminiHttpError(500) }),
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.equal(url, null);
  assert.equal(aiSpendInserts.length, 0, 'nothing succeeded, nothing is billed');
  assert.equal(imageGenInserts[0][1], null, 'image_url column is null on a chain-exhausted row');
  assert.equal(imageGenInserts[0][2], null, 'provider column is null');
});

test('NO providers configured at all (no keys, no AI binding) → null immediately, fetch is never called', async () => {
  const { env } = makeEnv();
  const url = await withFetch(
    () => { throw new Error('must not fetch — nothing is configured'); },
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.equal(url, null);
});

test('generatePlateImage never throws even with garbage input', async () => {
  assert.equal(await generatePlateImage(null, 'x'), null);
  assert.equal(await generatePlateImage({}, ''), null);
  assert.equal(await generatePlateImage({}, null), null);
});

// ---- budget gate: the SAME $50/week ceiling every other AI surface shares -----------------

test('weekly AI budget already at the ceiling → no provider is attempted, returns null', async () => {
  const { env, aiSpendInserts, imageGenInserts } = makeEnv({
    weekSpentMicro: WEEKLY_LIMIT_MICRO,
    extra: { OPENAI_API_KEY: 'sk-test' },
  });
  const url = await withFetch(
    () => { throw new Error('must not fetch — the budget gate should refuse before any provider runs'); },
    () => generatePlateImage(env, 'seared salmon bowl')
  );
  assert.equal(url, null);
  assert.equal(aiSpendInserts.length, 0);
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.equal(skipped[0].reason, 'weekly_ai_budget_reached');
});

test('one microdollar under the ceiling still gets a real attempt — the gate is >=, not fuzzy', async () => {
  const { env } = makeEnv({ weekSpentMicro: WEEKLY_LIMIT_MICRO - 1, extra: { OPENAI_API_KEY: 'sk-test' } });
  const url = await withFetch(fetchRouter({ openai: () => openaiOk() }), () => generatePlateImage(env, 'x'));
  assert.match(url, /^\/api\/hub\/media\//);
});

// ---- provider config: KV override -> env fallback -> default, same pattern as pay.js -------

test('default order is openai, gemini, workers_ai with nothing configured', async () => {
  const { env } = makeEnv();
  const cfg = await getImageProviderConfig(env);
  assert.deepEqual(cfg.order, ['openai', 'gemini', 'workers_ai']);
  assert.deepEqual(cfg.disabled, []);
});

test('env var order is used when no KV override is saved', async () => {
  const { env } = makeEnv({ extra: { IMAGE_PROVIDER_ORDER: 'gemini, openai, workers_ai' } });
  const cfg = await getImageProviderConfig(env);
  assert.deepEqual(cfg.order, ['gemini', 'openai', 'workers_ai']);
});

test('a saved KV config WINS over the env var default', async () => {
  const { env } = makeEnv({ extra: { IMAGE_PROVIDER_ORDER: 'gemini,openai,workers_ai' } });
  const r = await setImageProviderConfig(env, { order: ['workers_ai', 'openai'], disabled: ['gemini'] });
  assert.equal(r.ok, true);
  const cfg = await getImageProviderConfig(env);
  assert.deepEqual(cfg.order, ['workers_ai', 'openai', 'gemini'], 'gemini omitted from the saved order is appended, not dropped');
  assert.deepEqual(cfg.disabled, ['gemini']);
});

test('a disabled provider is skipped even when its key IS configured', async () => {
  const { env } = makeEnv({ kvSeed: { 'cfg:image_providers': JSON.stringify({ order: IMAGE_PROVIDERS, disabled: ['openai'] }) }, extra: { OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gk-test' } });
  const imageGenInserts = [];
  env.DB = makeD1([
    [/SELECT COALESCE\(SUM\(cost_microdollars\)\).*FROM ai_spend/s, () => ({ c: 0 })],
    [/^INSERT INTO ai_spend/, () => 1],
    [/^INSERT INTO image_generations/, ({ args }) => { imageGenInserts.push(args); return 1; }],
  ]);
  const url = await withFetch(fetchRouter({ gemini: () => geminiOk() }), () => generatePlateImage(env, 'x'));
  assert.match(url, /^\/api\/hub\/media\//);
  const skipped = JSON.parse(imageGenInserts[0][4]);
  assert.deepEqual(skipped, [{ provider: 'openai', reason: 'disabled' }]);
});

test('an unknown provider name in a saved config is dropped, never crashes the chain', async () => {
  const { env } = makeEnv();
  const r = await setImageProviderConfig(env, { order: ['openai', 'sora', 'workers_ai'], disabled: ['midjourney'] });
  assert.equal(r.ok, true);
  const cfg = await getImageProviderConfig(env);
  assert.ok(!cfg.order.includes('sora'));
  assert.deepEqual(cfg.disabled, []);
});

// ---- migration: the provenance table exists and says why it exists ------------------------

test('the image_generations migration exists, is additive-only, and explains the provenance need', () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS image_generations/);
  assert.match(MIGRATION, /provider\s+TEXT/);
  assert.match(MIGRATION, /skipped\s+TEXT NOT NULL DEFAULT '\[\]'/);
  assert.match(MIGRATION, /made by OpenAI/i);
});
