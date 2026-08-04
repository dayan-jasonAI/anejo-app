// Generating the REST of a carousel (_lib/carousel_gen.js) — the missing half of "the Studio
// makes ONE image". These tests pin the actual behavior a fake DB/AI binding can exercise: how
// many slides land, in what order, marked how, and what happens when the budget or a provider
// quits partway through a multi-image batch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCarouselSlides, ANGLE_VARIANTS } from '../../functions/_lib/carousel_gen.js';
import { isFoodPhoto } from '../../functions/_lib/social_publish.js';
import { ORIGIN_AI } from '../../functions/_lib/food_photo.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

// Same fakeDB shape test/money/social-food-photo.test.js uses — scoped to what this module
// actually touches (social_post_media reads/inserts, social_posts.updated_at).
function fakeDB(media) {
  const inserted = [];
  const postUpdates = [];
  return {
    _media: media, _inserted: inserted, _postUpdates: postUpdates,
    prepare(sql) {
      if (sql.includes('FROM social_post_media WHERE post_id=?')) {
        return { bind: () => ({ all: async () => ({ results: media.slice().sort((a, b) => a.seq - b.seq).map((r) => ({ ...r })) }) }) };
      }
      if (sql.startsWith('INSERT INTO social_post_media')) {
        return {
          bind: (id, postId, seq, key, token, at, origin) => ({
            run: async () => {
              const row = { id, seq, media_key: key, public_token: token, origin: /origin/.test(sql) ? origin : null };
              media.push(row); inserted.push(row);
              return { meta: { changes: 1 } };
            },
          }),
        };
      }
      if (sql.startsWith('UPDATE social_posts')) {
        return { bind: (...args) => ({ run: async () => { postUpdates.push({ sql, args }); return { meta: { changes: 1 } }; } }) };
      }
      return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }), first: async () => null }) };
    },
  };
}

// Workers AI is the one provider in the chain that natively returns JPEG (see plate_image.js) —
// stubbed here the same way social-food-photo.test.js does, so requireJpeg is satisfied honestly.
function envWithWorkersAI(db, { fail = false } = {}) {
  return {
    DB: db,
    AI: { run: async () => { if (fail) throw new Error('provider down'); return new Response(JPEG); } },
    MEDIA: { put: async () => {} },
    IMAGE_PROVIDER_ORDER: 'workers_ai',
  };
}

test('fills exactly the missing slides to reach the target, appended AFTER what already exists', async () => {
  const media = [{ id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p1_photo.jpg', public_token: 't1' }];
  const db = fakeDB(media);
  const out = await generateCarouselSlides(envWithWorkersAI(db), {
    postId: 'sp1', imageBrief: 'a fuego bowl in daylight', targetCount: 4,
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.added, 3);
  assert.equal(out.requested, 3);
  assert.equal(out.slides, 4);
  // The original slide is untouched — same id, same seq, same key.
  assert.deepEqual(media[0], { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p1_photo.jpg', public_token: 't1' });
  // The three new ones are appended in order, each recognised as a food photo and badged AI.
  const added = media.slice(1).sort((a, b) => a.seq - b.seq);
  assert.deepEqual(added.map((m) => m.seq), [1, 2, 3]);
  for (const m of added) {
    assert.ok(isFoodPhoto(m.media_key), `${m.media_key} must be recognised by the food-first guard`);
    assert.equal(m.origin, ORIGIN_AI);
  }
});

test('every generated slide carries a DIFFERENT angle/detail clause on the SAME dish prompt', async () => {
  const prompts = [];
  const env = {
    DB: fakeDB([]),
    AI: { run: async (model, opts) => { prompts.push(opts.prompt); return new Response(JPEG); } },
    MEDIA: { put: async () => {} },
    IMAGE_PROVIDER_ORDER: 'workers_ai',
  };
  const out = await generateCarouselSlides(env, { postId: 'sp1', imageBrief: 'a raiz bowl', targetCount: 3 });
  assert.equal(out.ok, true);
  assert.equal(prompts.length, 3);
  // Same base subject on every call (the "one set" mechanism — see the module header)...
  for (const p of prompts) assert.match(p, /a raiz bowl/);
  // ...but the framing clause differs call to call, or this is five renders of "a bowl", not a set.
  assert.equal(new Set(prompts).size, 3, 'no two slides should ask for the identical framing');
  for (const p of prompts) assert.ok(ANGLE_VARIANTS.some((v) => p.includes(v)), `no known angle variant found in: ${p}`);
});

test('a partial batch is reported HONESTLY — added < requested, never padded or retried forever', async () => {
  let calls = 0;
  const env = {
    DB: fakeDB([]),
    AI: {
      run: async () => {
        calls += 1;
        if (calls > 2) throw new Error('down'); // provider dies after two successes
        return new Response(JPEG);
      },
    },
    MEDIA: { put: async () => {} },
    IMAGE_PROVIDER_ORDER: 'workers_ai',
    DB_SPEND: [], // ai_budget's weekSpend reads env.DB, not this — placeholder to show intent only
  };
  const out = await generateCarouselSlides(env, { postId: 'sp1', imageBrief: 'a coco bowl', targetCount: 6 });
  assert.equal(out.ok, true);
  assert.equal(out.added, 2, 'only the two that actually succeeded are counted');
  assert.equal(out.requested, 6);
  assert.equal(out.slides, 2);
});

test('every provider unavailable is a NAMED failure, not a throw or a fake success', async () => {
  const out = await generateCarouselSlides(
    { DB: fakeDB([]), MEDIA: { put: async () => {} } },
    { postId: 'sp1', imageBrief: 'a ligero bowl', targetCount: 3 }
  );
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'generation_failed');
});

test('no brief and no usable caption refuses rather than generating a guess', async () => {
  const out = await generateCarouselSlides(envWithWorkersAI(fakeDB([])), { postId: 'sp1', caption: '#Longevity', targetCount: 4 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'no_prompt');
});

test('a nonsense or out-of-range count is refused by name, not silently clamped', async () => {
  const db = fakeDB([]);
  const env = envWithWorkersAI(db);
  for (const bad of [0, 1, 11, NaN, undefined, -3]) {
    const out = await generateCarouselSlides(env, { postId: 'sp1', imageBrief: 'a mar bowl', targetCount: bad });
    assert.equal(out.ok, false, `targetCount=${bad} must be refused`);
    assert.equal(out.reason, 'bad_count');
  }
  assert.deepEqual(db._inserted, [], 'nothing generated for a bad count — no wasted spend');
});

test('already at (or past) the target is a no-op, not a wasted generation', async () => {
  const media = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, seq: i, media_key: `studio/2026-07/series/p2_photo.jpg`, public_token: `t${i}` }));
  const db = fakeDB(media);
  const out = await generateCarouselSlides(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a vida bowl', targetCount: 3 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'already_at_target');
  assert.equal(out.slides, 4);
  assert.deepEqual(db._inserted, []);
});

test('a full carousel refuses outright — no room at Instagram\'s ceiling', async () => {
  const media = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, seq: i, media_key: `studio/2026-07/series/p3_photo.jpg`, public_token: `t${i}` }));
  const db = fakeDB(media);
  const out = await generateCarouselSlides(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a fuerza bowl', targetCount: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'carousel_full');
  assert.deepEqual(db._inserted, []);
});

test('a request past Instagram\'s ceiling is capped, never over-generated', async () => {
  const media = [{ id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p4_photo.jpg', public_token: 't1' }];
  const db = fakeDB(media);
  const out = await generateCarouselSlides(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a mar bowl', targetCount: 10 });
  assert.equal(out.ok, true);
  assert.equal(out.slides, 10);
  assert.equal(media.length, 10);
});

test('an unreachable/missing DB or postId degrades to a named reason, never throws', async () => {
  const out1 = await generateCarouselSlides(null, { postId: 'sp1', targetCount: 3 });
  assert.deepEqual(out1, { ok: false, reason: 'missing_args' });
  const out2 = await generateCarouselSlides({ DB: fakeDB([]) }, { targetCount: 3 });
  assert.deepEqual(out2, { ok: false, reason: 'missing_args' });
});
