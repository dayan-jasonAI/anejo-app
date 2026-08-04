// Media type routing (migrations/0080): the piece that connects the new REELS/STORIES publish
// functions in _lib/instagram.js to the ONE shared publish path every caller uses
// (_lib/social_publish.js:publishSocialPost), the schema that carries the declaration, and the
// HUB surfaces that let an owner see and set it.
//
// The rule under everything below: a post with NO declared media_type (every post that existed
// before this migration — six published, ten drafts, per the audit that motivated it) must publish
// EXACTLY as it did before. media_type is additive, never a required field retrofitted onto old
// rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishSocialPost } from '../../functions/_lib/social_publish.js';

const MIG = readFileSync(new URL('../../migrations/0080_social_media_type.sql', import.meta.url), 'utf8');
const SHARED = readFileSync(new URL('../../functions/_lib/social_publish.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');

function stubFetch(handler) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler({ url: String(url), body: init && init.body ? String(init.body) : '' });
  return { restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Mirrors the fakeDB pattern already used in test/money/social-food-first.test.js — a minimal D1
// stand-in scoped to what publishSocialPost touches.
function fakeDB(mediaRows) {
  const postUpdates = [];
  return {
    _postUpdates: postUpdates,
    prepare(sql) {
      if (sql.includes('FROM social_post_media WHERE post_id=?')) {
        return { bind: () => ({ all: async () => ({ results: mediaRows.map((r) => ({ ...r })) }) }) };
      }
      if (sql.startsWith('UPDATE social_post_media SET seq=?')) {
        return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
      }
      if (sql.startsWith('UPDATE social_posts')) {
        return { bind: (...args) => ({ run: async () => { postUpdates.push(args); return { meta: { changes: 1 } }; } }) };
      }
      return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }), first: async () => null }) };
    },
  };
}

const env = () => ({ IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841400000000000', IG_POLL_MS: 0, IG_API_HOST: 'facebook' });

// ---------------------------------------------------------------------------
// migrations/0080 — additive, nullable, and existing rows are untouched
// ---------------------------------------------------------------------------

test('the migration is additive — no table rebuild, no DROP, nothing backfilled', () => {
  assert.match(MIG, /ALTER TABLE social_posts ADD COLUMN media_type/);
  assert.ok(!/DROP TABLE/i.test(MIG), 'no rebuild — social_posts keeps every existing row untouched');
  assert.ok(!/UPDATE social_posts/i.test(MIG), 'nothing is backfilled — NULL is the honest value for a pre-0080 row');
});

test('the CHECK constraint allows NULL and exactly the four Meta media_type values', () => {
  assert.match(MIG, /CHECK \(media_type IS NULL OR media_type IN \('IMAGE', 'CAROUSEL', 'REELS', 'STORIES'\)\)/);
});

// ---------------------------------------------------------------------------
// routing — the SAME publish path, picking REEL/STORY/legacy by the declared type
// ---------------------------------------------------------------------------

test('a REELS post routes to publishReel — media_type=REELS, video_url, never image_url', async () => {
  let params = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M1' });
    if (url.includes('/media')) { params = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    if (url.includes('C1')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ permalink: 'https://instagram.com/reel/x' });
  });
  try {
    const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-08/clip.mp4', public_token: 'tok1' }]);
    const request = new Request('https://x.test/api/hub/owner/social');
    const r = await publishSocialPost({ ...env(), DB: db }, request, { id: 'sp1', caption: 'hi', media_type: 'REELS' });
    assert.equal(r.ok, true);
    assert.match(params, /media_type=REELS/);
    assert.match(params, /video_url=/);
    assert.ok(!/image_url=/.test(params));
  } finally { f.restore(); }
});

test('a STORIES post routes to publishStory — media_type=STORIES', async () => {
  let params = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M1' });
    if (url.includes('/media') && !/\/M1/.test(url)) { params = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    if (url.includes('C1')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ permalink: null });
  });
  try {
    const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-08/story.jpg', public_token: 'tok1' }]);
    const request = new Request('https://x.test/api/hub/owner/social');
    const r = await publishSocialPost({ ...env(), DB: db }, request, { id: 'sp2', caption: 'hi', media_type: 'STORIES' });
    assert.equal(r.ok, true);
    assert.match(params, /media_type=STORIES/);
  } finally { f.restore(); }
});

test('an untyped (NULL media_type) single-photo post still publishes as a plain image — unchanged', async () => {
  let params = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M1' });
    if (url.includes('/media') && !/\/M1/.test(url)) { params = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    if (url.includes('C1')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ permalink: 'https://instagram.com/p/x' });
  });
  try {
    const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-08/a.jpg', public_token: 'tok1' }]);
    const request = new Request('https://x.test/api/hub/owner/social');
    // media_type is absent entirely — exactly what a pre-0080 row looks like.
    const r = await publishSocialPost({ ...env(), DB: db }, request, { id: 'sp3', caption: 'hi' });
    assert.equal(r.ok, true);
    assert.ok(!/media_type=REELS/.test(params) && !/media_type=STORIES/.test(params));
    assert.match(params, /image_url=/);
  } finally { f.restore(); }
});

test('an untyped multi-photo post still publishes as a CAROUSEL — unchanged', async () => {
  let sawChild = false, sawParent = false;
  let n = 0;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M1' });
    // Params travel in the POST body (see instagram.js:graph), not the URL — mirrors the stub
    // shape in test/money/instagram-carousel.test.js.
    if (url.includes('/media') && body.includes('is_carousel_item')) { sawChild = true; return jsonRes({ id: 'CH' + (++n) }); }
    if (url.includes('/media') && body.includes('CAROUSEL')) { sawParent = true; return jsonRes({ id: 'PARENT' }); }
    return jsonRes({ status_code: 'FINISHED', permalink: 'https://instagram.com/p/car' });
  });
  try {
    const db = fakeDB([
      { id: 'm1', seq: 0, media_key: 'studio/2026-08/a.jpg', public_token: 'tok1' },
      { id: 'm2', seq: 1, media_key: 'studio/2026-08/b.jpg', public_token: 'tok2' },
    ]);
    const request = new Request('https://x.test/api/hub/owner/social');
    const r = await publishSocialPost({ ...env(), DB: db }, request, { id: 'sp4', caption: 'hi' });
    assert.equal(r.ok, true);
    assert.ok(sawChild && sawParent, 'carousel children AND a CAROUSEL parent were built, exactly as before');
  } finally { f.restore(); }
});

test('a REELS post with a JPEG (wrong container format) is refused with a clear message, before touching Meta', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const db = fakeDB([{ id: 'm1', seq: 0, media_key: 'studio/2026-08/oops.jpg', public_token: 'tok1' }]);
    const request = new Request('https://x.test/api/hub/owner/social');
    const r = await publishSocialPost({ ...env(), DB: db }, request, { id: 'sp5', caption: 'hi', media_type: 'REELS' });
    assert.equal(r.ok, false);
    assert.match(r.error, /MP4 or MOV/);
  } finally { f.restore(); }
});

test('the food-first carousel guard does not run for REELS/STORIES — a video has no cover slide to reorder', () => {
  const fnStart = SHARED.indexOf('export async function publishSocialPost');
  const fnBody = SHARED.slice(fnStart);
  assert.match(fnBody, /if \(!isReel && !isStory\)/);
  // foodFirstOrder must be textually INSIDE that guard, not called unconditionally above it.
  const guardIdx = fnBody.indexOf('if (!isReel && !isStory)');
  const orderIdx = fnBody.indexOf('foodFirstOrder(media)');
  assert.ok(orderIdx > guardIdx, 'foodFirstOrder must be gated behind the isReel/isStory check');
});

test('a dry run is refused for a single Reel/Story just like a single image — no separate carve-out needed', () => {
  // media.length is always 1 for a REEL/STORY post (Meta has no carousel for either), so the
  // existing `dry && media.length < 2` guard already covers them without a type-specific branch.
  assert.match(SHARED, /if \(dry && media\.length < 2\)/);
});

// ---------------------------------------------------------------------------
// the owner API — draft/attach validate format against the DECLARED type
// ---------------------------------------------------------------------------

test('the GET query selects media_type so the HUB can render it', () => {
  assert.match(API, /SELECT id, platform, caption, media_key, media_type, status/);
});

test('draft rejects an unknown media_type before writing anything', () => {
  assert.match(API, /Unknown post type\./);
  assert.match(API, /\['IMAGE', 'CAROUSEL', 'REELS', 'STORIES'\]\.includes\(mediaType\)/);
});

test('draft refuses a non-video key for a REELS post', () => {
  assert.match(API, /mediaType === 'REELS' && !VIDEO_ONLY\.test\(mediaKey\)/);
});

test('attach enforces a ONE-slide ceiling for REELS/STORIES, not the 10-photo carousel ceiling', () => {
  const block = API.slice(API.indexOf("op === 'attach'"), API.indexOf("op === 'generate_cover'"));
  assert.match(block, /existing\.length >= 1/);
  assert.match(block, /existing\.length >= CAROUSEL_MAX/);
});

// ---------------------------------------------------------------------------
// the HUB owner page — media type is visible, and video never renders as a photo
// ---------------------------------------------------------------------------

test('a post card shows a type badge for REELS/STORIES', () => {
  assert.match(HTML, /MTYPE_WORD = \{ REELS: 'Reel', STORIES: 'Story' \}/);
  assert.match(HTML, /class="mtype/);
});

test('a video slide renders as <video>, never <img>', () => {
  assert.match(HTML, /VIDEO_EXT = \/\\\.\(mp4\|mov\)\$\/i/);
  assert.match(HTML, /<video class="vidslide"/);
});

test('the publish button is labelled per media type', () => {
  assert.match(HTML, /'Publish Reel'/);
  assert.match(HTML, /'Publish to Story'/);
});
