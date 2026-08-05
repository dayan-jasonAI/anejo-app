// The food-first guard learns to FIX, not just report.
//
// coverStatus (social-food-first.test.js) shipped as a pure finding: "this post has no food photo
// — add a real photo before it goes out", and then stopped. The owner's question was the right
// one — the same team that drafts the post raises the warning about it, so the gate only ever
// made him work. It could not have been otherwise: the planner writes image_brief and inserts
// media_key NULL, and the Team Lead attaches a bowl image only when the caption names exactly one
// bowl. A text-card-only post was a state the team could CREATE and could not REPAIR.
//
// These tests pin the repair: the shared module (_lib/food_photo.js), the two format/naming traps
// that would have made it a fake fix, and the fact that it is wired into all three doors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dishPromptFor, ensureFoodPhoto, ORIGIN_AI } from '../../functions/_lib/food_photo.js';
import { isFoodPhoto } from '../../functions/_lib/social_publish.js';
import { putMedia } from '../../functions/_lib/media.js';
import { generatePlateImageDetailed } from '../../functions/_lib/plate_image.js';

const PLANNER = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const LEAD = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
// 2026-08-04: the warning + repair button now render inside the Create > Instagram tab of the
// unified marketing.html workspace.
const HTML = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const MODULE = readFileSync(new URL('../../functions/_lib/food_photo.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// dishPromptFor — what the generator is told to draw
// ---------------------------------------------------------------------------

test('image_brief wins: the art direction the planner already wrote, and nothing ever read', () => {
  const p = dishPromptFor({
    imageBrief: 'Overhead of a fuego bowl on a wooden counter, hard morning light',
    caption: 'Eat like it counts #Longevity',
  });
  assert.equal(p, 'Overhead of a fuego bowl on a wooden counter, hard morning light');
});

test('caption is the fallback for hand-staged posts with no brief — hashtags, URLs and the CTA stripped', () => {
  const p = dishPromptFor({
    caption: 'Food is the other half of training. Every Añejo bowl targets ~40% protein, 30% carbs, 30% fat. '
      + 'Eat like it counts — link in bio. https://anejocateringco.com #Longevity #PerformanceFood',
  });
  assert.ok(!/#/.test(p), 'a hashtag is an instruction to an audience, not a scene — a generator renders the words');
  assert.ok(!/https?:/.test(p), 'no URLs');
  assert.ok(!/link in bio/i.test(p), 'no call to action');
  assert.match(p, /protein/, 'the actual subject survives');
});

test('nothing to generate FROM returns null — the subject is never invented', () => {
  assert.equal(dishPromptFor({}), null);
  assert.equal(dishPromptFor({ caption: '#Longevity' }), null, 'hashtags only leaves nothing');
  assert.equal(dishPromptFor({ caption: 'link in bio' }), null);
});

// ---------------------------------------------------------------------------
// The two traps that would have made this a fake fix
// ---------------------------------------------------------------------------

test('TRAP 1 — a generated food photo must be RECOGNISED as one by the guard that asked for it', async () => {
  // Without the role suffix, the image this app just generated as food is stored as
  // studio/2026-08/med_x.jpg, lands in the guard's UNKNOWN bucket, and the "no food photo"
  // warning survives its own repair — the post looks fixed and still shouts.
  const env = { MEDIA: { put: async () => {} } };
  const stored = await putMedia(env, { kind: 'studio', bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg', ext: 'jpg', role: 'photo' });
  assert.equal(stored.stored, true);
  assert.ok(isFoodPhoto(stored.key), `the guard must read ${stored.key} as a photo`);
});

test('TRAP 1b — role is sanitised: a caller cannot reshape the R2 path through it', async () => {
  const env = { MEDIA: { put: async () => {} } };
  const stored = await putMedia(env, { kind: 'studio', bytes: new Uint8Array([1]), contentType: 'image/jpeg', ext: 'jpg', role: '../../evil/photo' });
  assert.ok(!stored.key.includes('..'), stored.key);
  assert.equal(stored.key.split('/').length, 3, 'still kind/yyyy-mm/file — no extra path segments');
});

test('TRAP 1c — no role means the old key shape, unchanged for every existing caller', async () => {
  const env = { MEDIA: { put: async () => {} } };
  const stored = await putMedia(env, { kind: 'studio', bytes: new Uint8Array([1]), contentType: 'image/png', ext: 'png' });
  assert.match(stored.key, /^studio\/\d{4}-\d{2}\/med_[a-z0-9]+\.png$/i);
});

test('TRAP 2 — a non-JPEG provider is SKIPPED when the caller needs a publishable slide', async () => {
  // Instagram accepts JPEG only (JPEG_ONLY in _lib/instagram.js) and this Worker has no image
  // binding to transcode with. Storing a PNG would produce a slide the publish path refuses: a
  // "repaired" post that can never post. Gemini here returns PNG and must be passed over.
  const puts = [];
  const env = {
    GEMINI_API_KEY: 'k',
    MEDIA: { put: async (key) => { puts.push(key); } },
    DB: permissiveDB(),
    IMAGE_PROVIDER_ORDER: 'gemini',
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }],
  }), { headers: { 'content-type': 'application/json' } });
  try {
    const out = await generatePlateImageDetailed(env, 'a bowl', { requireJpeg: true, role: 'photo' });
    assert.equal(out, null, 'a PNG is not a usable Instagram slide — refuse rather than store one');
    assert.deepEqual(puts, [], 'and nothing is stored, so no spend is recorded for an unusable image');
  } finally { globalThis.fetch = realFetch; }
});

// ---------------------------------------------------------------------------
// ensureFoodPhoto — the shared repair
// ---------------------------------------------------------------------------

// A D1 stand-in scoped to what ensureFoodPhoto touches, in the fakeDB style of
// social-food-first.test.js. `media` is mutated by inserts so the reseal reads real state back.
function fakeDB(media) {
  const seqWrites = [];
  const postUpdates = [];
  const inserted = [];
  return {
    _seqWrites: seqWrites, _postUpdates: postUpdates, _inserted: inserted, _media: media,
    prepare(sql) {
      if (sql.includes('FROM social_post_media WHERE post_id=?')) {
        return { bind: () => ({ all: async () => ({ results: media.slice().sort((a, b) => a.seq - b.seq).map((r) => ({ ...r })) }) }) };
      }
      if (sql.startsWith('INSERT INTO social_post_media')) {
        return { bind: (id, postId, key, token, at, origin) => ({ run: async () => {
          if (!/origin/.test(sql) && origin !== undefined) throw new Error('bad bind');
          const row = { id, seq: -1, media_key: key, public_token: token, origin: /origin/.test(sql) ? origin : null };
          media.push(row); inserted.push({ sql, row });
          return { meta: { changes: 1 } };
        } }) };
      }
      if (sql.startsWith('UPDATE social_post_media SET seq=?')) {
        return { bind: (seq, id) => ({ run: async () => {
          const row = media.find((m) => m.id === id); if (row) row.seq = seq;
          seqWrites.push({ id, seq }); return { meta: { changes: 1 } };
        } }) };
      }
      if (sql.startsWith('UPDATE social_posts')) {
        return { bind: (...args) => ({ run: async () => { postUpdates.push({ sql, args }); return { meta: { changes: 1 } }; } }) };
      }
      return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }), first: async () => null }) };
    },
  };
}

function permissiveDB() {
  return { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }), first: async () => null }) }) };
}

// Workers AI is the one provider in the chain that natively returns JPEG, so it is what a test
// stubs to exercise the happy path without inventing a format the real chain would reject.
function envWithWorkersAI(db) {
  return {
    DB: db,
    AI: { run: async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0x00])) },
    MEDIA: { put: async () => {} },
    IMAGE_PROVIDER_ORDER: 'workers_ai',
  };
}

test('the generated photo lands as SLIDE 1 — Instagram\'s grid shows only the first slide', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p4_hook.jpg', public_token: 't1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p4_rule.jpg', public_token: 't2' },
    { id: 'm3', seq: 2, media_key: 'studio/2026-07/series/p4_cta.jpg', public_token: 't3' },
  ];
  const db = fakeDB(media);
  const out = await ensureFoodPhoto(envWithWorkersAI(db), { postId: 'sp1', caption: 'Every Añejo bowl targets 40/30/30 protein carbs fat', imageBrief: 'a fuego bowl in daylight' });
  assert.equal(out.ok, true, out.reason);
  assert.ok(isFoodPhoto(out.media_key), 'and the guard recognises it, so the warning clears');
  const order = media.slice().sort((a, b) => a.seq - b.seq).map((m) => m.media_key);
  assert.equal(order[0], out.media_key, 'the photo leads');
  assert.deepEqual(order.slice(1), [
    'studio/2026-07/series/p4_hook.jpg',
    'studio/2026-07/series/p4_rule.jpg',
    'studio/2026-07/series/p4_cta.jpg',
  ], 'the text cards keep their editorial order behind it — nothing is dropped or reshuffled');
  assert.deepEqual(media.map((m) => m.seq).sort((a, b) => a - b), [0, 1, 2, 3], 'seq resealed 0..n-1');
});

test('the slide is marked ai_generated so a placeholder is never mistaken for real photography', async () => {
  const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p5_cover.jpg', public_token: 't1' }]);
  const out = await ensureFoodPhoto(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a raiz bowl' });
  assert.equal(out.ok, true, out.reason);
  assert.equal(db._media.find((m) => m.media_key === out.media_key).origin, ORIGIN_AI);
});

test('THE POST STAYS A DRAFT — attaching an image is not approval', async () => {
  const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p5_cover.jpg', public_token: 't1' }]);
  await ensureFoodPhoto(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a mar bowl' });
  for (const u of db._postUpdates) {
    assert.ok(!/status\s*=/i.test(u.sql), `ensureFoodPhoto must never write status: ${u.sql}`);
  }
  assert.ok(db._postUpdates.some((u) => /updated_at/.test(u.sql)), 'it does touch updated_at so the list is honest');
});

test('a post that already has a food photo is left alone — that is a reordering problem, and free', async () => {
  const db = fakeDB([
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p6_cover.jpg', public_token: 't1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p6_photo.jpg', public_token: 't2' },
  ]);
  const out = await ensureFoodPhoto(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a coco bowl' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'already_has_photo');
  assert.deepEqual(db._inserted, [], 'no image generated — paying to solve a solved problem is how a budget ceiling goes for nothing');
});

test('a bowl-named slide counts as the photo too — bowl_art.js keys are real photography', async () => {
  const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/bowls/fuego.jpg', public_token: 't1' }]);
  const out = await ensureFoodPhoto(envWithWorkersAI(db), { postId: 'sp1', imageBrief: 'a fuego bowl' });
  assert.equal(out.reason, 'already_has_photo');
});

test('a full carousel refuses by NAME — there is no room for a cover at Instagram\'s ceiling', async () => {
  const media = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, seq: i, media_key: `studio/2026-07/series/p7_cta.jpg`, public_token: `t${i}` }));
  const out = await ensureFoodPhoto(envWithWorkersAI(fakeDB(media)), { postId: 'sp1', imageBrief: 'a vida bowl' });
  assert.equal(out.reason, 'carousel_full');
});

test('no brief and no usable caption refuses rather than generating a guess', async () => {
  const out = await ensureFoodPhoto(envWithWorkersAI(fakeDB([])), { postId: 'sp1', caption: '#Longevity' });
  assert.equal(out.reason, 'no_prompt');
});

test('every provider unavailable degrades to a named reason, never a throw', async () => {
  const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p4_cta.jpg', public_token: 't1' }]);
  const out = await ensureFoodPhoto({ DB: db, MEDIA: { put: async () => {} } }, { postId: 'sp1', imageBrief: 'a ligero bowl' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'generation_failed', 'no keys, no AI binding — the post keeps the exact state it already had');
  assert.deepEqual(db._inserted, []);
});

// ---------------------------------------------------------------------------
// Wiring — the fix is worthless in a module nothing calls (the mistake this repo has
// already made twice: the knowledge base and market_intel both looked live and were read by
// nothing). Source-pinned, same style as training-wiring.test.js.
// ---------------------------------------------------------------------------

test('PREVENT — the weekly planner gives every draft a food photo at creation', () => {
  assert.match(PLANNER, /import \{ ensureFoodPhoto \} from '\.\/food_photo\.js'/);
  assert.match(PLANNER, /await ensureFoodPhoto\(env, \{ postId, caption, imageBrief: brief \}\)/);
});

test('PREVENT — the Team Lead generates only when no staged bowl photo matched', () => {
  assert.match(LEAD, /import \{ ensureFoodPhoto \}/);
  // Real photography must win: the call belongs in the `else` of the bowl-art branch, never
  // alongside it, or a matched bowl image gets a paid-for stand-in it did not need.
  const branch = LEAD.slice(LEAD.indexOf('if (art) {'), LEAD.indexOf('EVERY generated draft is scored'));
  assert.match(branch, /\} else \{[\s\S]*ensureFoodPhoto/, 'ensureFoodPhoto must sit in the else of `if (art)`');
});

test('REPAIR — the warning carries a button, and it is owner-only and draft-only', () => {
  assert.match(API, /op === 'generate_cover'/);
  assert.match(API, /ensureFoodPhoto\(env, \{ postId, caption: row\.caption, imageBrief: row\.image_brief \}\)/);
  // Window widened 2026-08-04: the op now opens with a `prompt`-mode branch (the standalone
  // "generate an image from a description" tool — see that branch's own header comment) BEFORE
  // the postId is even read, pushing the published/publishing checks further from the op string.
  // Widened again 2026-08-05 for the same reason: that branch gained aspect selection. This is a
  // PROXIMITY heuristic and it will keep drifting — what it is really pinning is that the
  // published/publishing refusals still live inside this op, so widening it is the correct
  // response to an honest failure, not a way of silencing one. Read the branch before you widen.
  assert.match(API, /generate_cover'\)[\s\S]{0,3200}status === 'published'/, 'refuses a live post — its slides are the public record');
  assert.match(API, /generate_cover'\)[\s\S]{0,3200}status === 'publishing'/);
  // requireRole(['owner']) already guards the whole POST handler; pin that it still does.
  assert.match(API, /requireRole\(request, env, \['owner'\]\)/);
});

test('REPAIR — the repair route never changes a post\'s status', () => {
  const route = API.slice(API.indexOf("op === 'generate_cover'"), API.indexOf("op === 'detach'"));
  assert.ok(!/UPDATE social_posts SET status/.test(route), 'a generated photo must not schedule itself onto the grid');
});

test('the button exists on the warn note, is not offered on a live post, and cannot be double-clicked', () => {
  assert.match(HTML, /data-genc/, 'the fix button is rendered');
  assert.match(HTML, /op: 'generate_cover'/, 'and wired to the route');
  assert.match(HTML, /s\.level === 'warn' && !locked/, 'only on a real warning, never on a published post');
  // 15-20s round trip that costs money: without a self-disable the owner clicks three times and
  // pays three times.
  assert.match(HTML, /if \(b\.disabled\) return;\s*\n\s*b\.disabled = true;/);
});

test('an AI-generated slide is badged in the strip', () => {
  assert.match(HTML, /m\.origin === 'ai_generated'/);
  assert.match(API, /SELECT id, post_id, seq, media_key, origin FROM social_post_media/, 'the API has to send origin for the badge to exist');
});

test('the repair asks for JPEG and for the photo role — both, or it is not a fix', () => {
  assert.match(MODULE, /requireJpeg: true, role: 'photo'/);
});
