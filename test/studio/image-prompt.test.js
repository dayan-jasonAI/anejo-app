// The trainable prompt-expansion step (functions/_lib/image_prompt.js): turns the planner's
// one-line image_brief into a rich, provider-shaped prompt, grounded (in priority order) in the
// owner's Team Training, the brand's Photo standard, and — only when he has trained nothing —
// the old hardcoded PLATING_STYLE floor.
//
// The behaviors pinned here mirror the ones plate-image.test.js pins for the provider chain:
//   · FAILS SAFE, ALWAYS — no key, budget closed, a model error/timeout, or garbage output all
//     fall back to EXACTLY the pre-existing concatenation, never a throw, never something worse.
//   · OWNER TRAINING ACTUALLY REACHES THE MODEL — the whole point of this file.
//   · CACHED per (brief, training-version) — a second call for the same pairing never re-calls
//     the model, and an edit to training changes the version so the cache can't go stale.
//   · PROVIDER-SHAPED — OpenAI/Gemini fold the negative cues into one string; Workers AI (the
//     only provider with a real negative_prompt field) gets them split out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImagePrompt, buildFallbackCore, shapeForProvider, trainingVersionOf,
  PLATING_STYLE, NEGATIVE_PROMPT, BRAND_PHOTO_STANDARD,
} from '../../functions/_lib/image_prompt.js';
import { WEEKLY_LIMIT_MICRO } from '../../functions/_lib/ai_budget.js';
import { makeD1, makeKV } from '../helpers/d1.js';

// ---- fixtures -----------------------------------------------------------------------------

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}

function anthropicOk(positive, negative = 'CGI, cartoon, plastic', { inTok = 200, outTok = 80 } = {}) {
  return new Response(JSON.stringify({
    content: [{ type: 'text', text: JSON.stringify({ positive, negative }) }],
    usage: { input_tokens: inTok, output_tokens: outTok },
  }), { status: 200 });
}
function anthropicHttpError(status = 500) {
  return new Response(JSON.stringify({ error: 'boom' }), { status });
}
function anthropicGarbage(text = 'sorry, I cannot help with that') {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
}

function rule(text, updated_at = 1000) {
  return { id: 'rul_x', text, created_by: 'owner', created_at: updated_at, updated_at };
}

// One D1 stub covering the training reads + the ai_spend budget read/write the expansion draws
// on. `rules`/`examples` must already be newest-updated-first, same contract loadTraining itself
// promises via its own ORDER BY.
function makeEnv({ anthropicKey = 'sk-ant-test', weekSpentMicro = 0, rules = [], examples = [], kvSeed = {}, sessions } = {}) {
  const aiSpendInserts = [];
  const db = makeD1([
    [/FROM ai_spend/, () => ({ c: weekSpentMicro })],
    [/^INSERT INTO ai_spend/, ({ args }) => { aiSpendInserts.push(args); return 1; }],
    [/FROM training_rules/, () => rules],
    [/FROM training_examples/, () => examples],
  ]);
  const env = { DB: db, SESSIONS: sessions || makeKV(kvSeed) };
  if (anthropicKey) env.ANTHROPIC_API_KEY = anthropicKey;
  return { env, aiSpendInserts };
}

// ---- fallback: byte-identical to the pre-existing hardcoded concatenation ------------------

test('buildFallbackCore reproduces exactly the old dishPrompt + PLATING_STYLE / NEGATIVE_PROMPT concatenation', () => {
  const core = buildFallbackCore('seared salmon bowl');
  assert.equal(core.positive, `seared salmon bowl. ${PLATING_STYLE}`);
  assert.equal(core.negative, NEGATIVE_PROMPT);
  assert.equal(core.source, 'fallback');
});

test('no ANTHROPIC_API_KEY -> openai gets exactly the old openaiPrompt() string, no network call', async () => {
  const { env } = makeEnv({ anthropicKey: null });
  const out = await withFetch(
    () => { throw new Error('must not call fetch — no key configured'); },
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(
    out.prompt,
    `Photorealistic food photo, shot on a DSLR with a 50mm lens: seared salmon bowl. ${PLATING_STYLE} Do NOT render this as: ${NEGATIVE_PROMPT}`
  );
  assert.equal(out.negative_prompt, null);
  assert.equal(out.source, 'fallback');
});

test('no ANTHROPIC_API_KEY -> gemini gets exactly the old geminiPrompt() string', async () => {
  const { env } = makeEnv({ anthropicKey: null });
  const out = await withFetch(
    () => { throw new Error('must not call fetch'); },
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'gemini' })
  );
  assert.equal(
    out.prompt,
    'A candid, unstaged photo — the kind a chef snaps on their phone right before service — of ' +
      `seared salmon bowl. ${PLATING_STYLE} This must read as a real photograph, never as: ${NEGATIVE_PROMPT}`
  );
  assert.equal(out.negative_prompt, null);
});

test('no ANTHROPIC_API_KEY -> workers_ai gets the old split prompt/negative_prompt fields', async () => {
  const { env } = makeEnv({ anthropicKey: null });
  const out = await withFetch(
    () => { throw new Error('must not call fetch'); },
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'workers_ai' })
  );
  assert.equal(out.prompt, `seared salmon bowl. ${PLATING_STYLE}`);
  assert.equal(out.negative_prompt, NEGATIVE_PROMPT);
});

test('budget exhausted -> falls back, no network call, no training/cache reads matter', async () => {
  const { env } = makeEnv({ weekSpentMicro: WEEKLY_LIMIT_MICRO });
  const out = await withFetch(
    () => { throw new Error('must not call fetch — the budget gate should refuse first'); },
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'fallback');
  assert.match(out.prompt, /seared salmon bowl/);
});

test('model HTTP error -> falls back, never throws', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => anthropicHttpError(500),
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'fallback');
  assert.equal(
    out.prompt,
    `Photorealistic food photo, shot on a DSLR with a 50mm lens: seared salmon bowl. ${PLATING_STYLE} Do NOT render this as: ${NEGATIVE_PROMPT}`
  );
});

test('model call throws (network failure) -> falls back, never throws', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => { throw new Error('DNS boom'); },
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'fallback');
});

test('model hangs past its timeout -> falls back (bounded, not blocked forever)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { env } = makeEnv();
  const pending = withFetch(
    () => new Promise(() => {}), // never resolves
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  // Same reasoning as plate-image.test.js's timeout test: drain real microtasks (budgetGate's D1
  // read, the training D1 reads, the KV cache read) via a macrotask before advancing the mocked
  // clock, so the timer we're about to fire has actually been registered.
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(8_000);
  const out = await pending;
  assert.equal(out.source, 'fallback');
});

test('garbage/unparseable model output -> falls back rather than shipping nonsense', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => anthropicGarbage('not json at all'),
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'fallback');
});

test('a suspiciously short "positive" (refusal/placeholder) is treated as garbage -> falls back', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => anthropicOk('no'),
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'fallback');
});

// ---- the expansion path: used when everything is configured -------------------------------

test('expansion succeeds -> the AI-written positive/negative reach the final prompt, not the hardcoded constant', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => anthropicOk('A glossy seared salmon fillet fans across quinoa under soft morning light.', 'harsh flash, plastic sheen'),
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'expanded');
  assert.match(out.prompt, /glossy seared salmon fillet fans across quinoa/);
  assert.match(out.prompt, /harsh flash, plastic sheen/);
  // The expanded prompt replaces PLATING_STYLE's exact wording — proof this isn't just the old
  // constant with a sentence glued on.
  assert.ok(!out.prompt.includes(PLATING_STYLE));
});

test('metering: a successful expansion call is recorded on the SAME ai_spend ledger the $50/week ceiling reads', async () => {
  const { env, aiSpendInserts } = makeEnv();
  await withFetch(
    () => anthropicOk('A rich description of the dish and the scene.', 'blurry, deformed'),
    () => buildImagePrompt(env, 'seared salmon bowl', { provider: 'openai' })
  );
  assert.equal(aiSpendInserts.length, 1);
  assert.equal(aiSpendInserts[0][3], 'image_prompt_expand', 'feature column');
  assert.equal(aiSpendInserts[0][4], 'claude-haiku-4-5', 'model column');
});

// ---- provider shaping -----------------------------------------------------------------------

test('openai and gemini fold the negative cues into one string; workers_ai keeps them split', async () => {
  const fetchOnce = () => anthropicOk('A rich scene description of the dish.', 'oversaturated, waxy');
  const openai = await withFetch(fetchOnce, () => buildImagePrompt(makeEnv().env, 'x bowl', { provider: 'openai' }));
  const gemini = await withFetch(fetchOnce, () => buildImagePrompt(makeEnv().env, 'x bowl', { provider: 'gemini' }));
  const workersAi = await withFetch(fetchOnce, () => buildImagePrompt(makeEnv().env, 'x bowl', { provider: 'workers_ai' }));

  assert.equal(openai.negative_prompt, null);
  assert.match(openai.prompt, /oversaturated, waxy/);
  assert.match(openai.prompt, /^Photorealistic food photo, shot on a DSLR with a 50mm lens:/);

  assert.equal(gemini.negative_prompt, null);
  assert.match(gemini.prompt, /oversaturated, waxy/);
  assert.match(gemini.prompt, /^A candid, unstaged photo/);

  assert.equal(workersAi.negative_prompt, 'oversaturated, waxy');
  assert.equal(workersAi.prompt, 'A rich scene description of the dish.');
});

test('an expanded reply with an empty negative still gives Workers AI a real negative_prompt (falls back to NEGATIVE_PROMPT)', async () => {
  const { env } = makeEnv();
  const out = await withFetch(
    () => anthropicOk('A rich scene description of the dish.', ''),
    () => buildImagePrompt(env, 'x bowl', { provider: 'workers_ai' })
  );
  assert.equal(out.negative_prompt, NEGATIVE_PROMPT);
});

test('shapeForProvider defaults unknown/undefined providers to the openai-style wrapper', () => {
  const core = { positive: 'p', negative: 'n', source: 'expanded', cached: false };
  const out = shapeForProvider('some_future_provider', core);
  assert.match(out.prompt, /^Photorealistic food photo/);
  assert.equal(out.negative_prompt, null);
});

// ---- the whole point: owner training reaches the expanded prompt ---------------------------

test('owner training reaches the model as grounding, ranked ABOVE the floor', async () => {
  const { env } = makeEnv({ rules: [rule('Always shoot directly from above, never at an angle.', 5000)] });
  let capturedBody = null;
  const out = await withFetch(
    (url, init) => { capturedBody = JSON.parse(init.body); return anthropicOk('An overhead shot of the dish.', 'angled shots'); },
    () => buildImagePrompt(env, 'x bowl', { provider: 'openai' })
  );
  assert.equal(out.source, 'expanded');
  assert.match(capturedBody.system, /Always shoot directly from above, never at an angle\./);
  // Training present -> the floor (PLATING_STYLE, item #3 in priority order) is NOT included —
  // the owner's own words stand in for it, not alongside a diluting hardcoded constant.
  assert.ok(!capturedBody.system.includes(PLATING_STYLE));
  // The brand's photo standard (#2) is still always in force.
  assert.match(capturedBody.system, /clockwise sectional plating|Full round bowl visible/i);
});

test('empty training -> the floor (old PLATING_STYLE) is handed to the model so a fresh install still gets a coherent brief', async () => {
  const { env } = makeEnv({ rules: [], examples: [] });
  let capturedBody = null;
  await withFetch(
    (url, init) => { capturedBody = JSON.parse(init.body); return anthropicOk('A described scene.', 'n'); },
    () => buildImagePrompt(env, 'x bowl', { provider: 'openai' })
  );
  assert.ok(capturedBody.system.includes(PLATING_STYLE));
});

test('BRAND_PHOTO_STANDARD is a non-trivial compiled constant (not empty, not the whole 16KB brief)', () => {
  assert.ok(BRAND_PHOTO_STANDARD.length > 100);
  assert.ok(BRAND_PHOTO_STANDARD.length < 2000);
});

// ---- caching: per (brief, training-version), a hit never re-calls the model ----------------

test('cache hit does not re-call the model', async () => {
  const kv = makeKV();
  const env1 = makeEnv({ sessions: kv }).env;
  let calls = 0;
  const fetchSpy = () => { calls++; return anthropicOk('A described scene for the dish.', 'blurry'); };

  const first = await withFetch(fetchSpy, () => buildImagePrompt(env1, 'x bowl', { provider: 'openai' }));
  assert.equal(calls, 1);
  assert.equal(first.source, 'expanded');
  assert.equal(first.cached, false);

  // Same brief, same training version (still nothing trained), fresh env object but the SAME KV
  // — a real second request hitting the same cache, not just a re-used object in memory.
  const env2 = makeEnv({ sessions: kv }).env;
  const second = await withFetch(
    () => { throw new Error('must not call the model again — this should be a cache hit'); },
    () => buildImagePrompt(env2, 'x bowl', { provider: 'openai' })
  );
  assert.equal(calls, 1, 'the model was called exactly once across both requests');
  assert.equal(second.source, 'expanded');
  assert.equal(second.cached, true);
  // Shaped output is identical even though this call never touched the model.
  assert.equal(second.prompt, first.prompt);
});

test('a DIFFERENT provider for the same brief/training reuses the cached core (no second model call)', async () => {
  const kv = makeKV();
  let calls = 0;
  const fetchSpy = () => { calls++; return anthropicOk('A described scene for the dish.', 'blurry'); };

  const openai = await withFetch(fetchSpy, () => buildImagePrompt(makeEnv({ sessions: kv }).env, 'x bowl', { provider: 'openai' }));
  const workersAi = await withFetch(
    () => { throw new Error('must not call the model again'); },
    () => buildImagePrompt(makeEnv({ sessions: kv }).env, 'x bowl', { provider: 'workers_ai' })
  );
  assert.equal(calls, 1);
  assert.equal(openai.source, 'expanded');
  assert.equal(workersAi.source, 'expanded');
  assert.equal(workersAi.prompt, 'A described scene for the dish.');
});

test('editing training changes the version -> the OLD cache entry is never read, the model runs again', async () => {
  const kv = makeKV();
  let calls = 0;
  const fetchSpy = () => { calls++; return anthropicOk(`A described scene, call #${calls}.`, 'blurry'); };

  const before = await withFetch(
    fetchSpy,
    () => buildImagePrompt(makeEnv({ sessions: kv, rules: [rule('Shoot from above.', 1000)] }).env, 'x bowl', { provider: 'openai' })
  );
  assert.equal(calls, 1);

  // Same brief, but the rule was just edited (updated_at bumped) — team-training.js's
  // update_rule does exactly this. The version fingerprint changes, so this is a cache MISS,
  // not a stale hit — a stale hit here would make the owner's edit look like it did nothing.
  const after = await withFetch(
    fetchSpy,
    () => buildImagePrompt(makeEnv({ sessions: kv, rules: [rule('Shoot from above, angled slightly.', 2000)] }).env, 'x bowl', { provider: 'openai' })
  );
  assert.equal(calls, 2, 'the edit invalidated the cache — the model ran again');
  assert.notEqual(before.prompt, after.prompt);
});

// ---- trainingVersionOf: the fingerprint the cache key is built from ------------------------

test('trainingVersionOf changes on add (count changes) and on edit (newest updated_at changes)', () => {
  const v0 = trainingVersionOf([], []);
  const v1 = trainingVersionOf([rule('a', 100)], []);
  const v2 = trainingVersionOf([rule('a', 200)], []); // same rule, edited later
  const v3 = trainingVersionOf([rule('a', 200), rule('b', 50)], []); // a second rule added
  assert.notEqual(v0, v1);
  assert.notEqual(v1, v2);
  assert.notEqual(v2, v3);
});

test('trainingVersionOf is stable for the identical rules/examples (same call twice)', () => {
  const rules = [rule('a', 100)];
  assert.equal(trainingVersionOf(rules, []), trainingVersionOf(rules, []));
});

// ---- never throws, even with garbage input -------------------------------------------------

test('buildImagePrompt never throws on garbage input', async () => {
  await assert.doesNotReject(buildImagePrompt(null, 'x', { provider: 'openai' }));
  await assert.doesNotReject(buildImagePrompt({}, '', { provider: 'openai' }));
  await assert.doesNotReject(buildImagePrompt({}, null, { provider: 'openai' }));
  // A key IS configured here but env.DB/env.SESSIONS are not — must still degrade cleanly rather
  // than throw on a missing binding. Fetch is stubbed so this never depends on real network
  // access in a sandboxed test run.
  await withFetch(
    () => { throw new Error('offline in this test'); },
    () => assert.doesNotReject(buildImagePrompt({ ANTHROPIC_API_KEY: 'k' }, 'x', {}))
  );
});
