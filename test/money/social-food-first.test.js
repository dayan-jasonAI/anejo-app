// Food-first guard: Instagram's grid shows ONLY the first slide of a carousel, and
// tools/cardgen/series_cards.py renders text cards on a near-black forest green — a text card as
// slide 1 turns the grid into a wall of typography with the food invisible on slides 2+. This is
// the production bug the owner caught ("looks like a green block") and the fix that makes it
// structural: reorder so a photo leads, computed in ONE place (foodFirstOrder /
// publishSocialPost) so the owner's button and the unattended tick can never disagree about it.
//
// Detection is a FILENAME CONVENTION (`series/`, `_cover` — see tools/cardgen/README.md), not
// image analysis, which this stack does not have. These tests pin the documented failure
// directions as much as the success path: an ambiguous key is left alone, an all-text carousel is
// warned about but never blocked or invented around.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  looksLikeTextCard,
  foodFirstOrder,
  coverStatus,
  publishSocialPost,
  loadPostMedia,
} from '../../functions/_lib/social_publish.js';

const SHARED = readFileSync(new URL('../../functions/_lib/social_publish.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');

const slide = (id, media_key, seq) => ({ id, media_key, seq });

// ---------------------------------------------------------------------------
// looksLikeTextCard — the naming convention itself
// ---------------------------------------------------------------------------

test('the production examples all match — this is the exact bug being fixed', () => {
  assert.equal(looksLikeTextCard('studio/2026-07/series/p1_cover.jpg'), true);
  assert.equal(looksLikeTextCard('studio/2026-07/series/p2_cover.jpg'), true);
  assert.equal(looksLikeTextCard('studio/2026-07/series/p5_cover.jpg'), true);
  assert.equal(looksLikeTextCard('studio/2026-07/series/p6_cover.jpg'), true);
});

test('an uploaded phone photo — the common case — is never mistaken for a text card', () => {
  // functions/api/hub/owner/social-upload.js always mints studio/<yyyy-mm>/up_<id>.jpg.
  assert.equal(looksLikeTextCard('studio/2026-07/up_a1b2c3.jpg'), false);
});

test('bowl photography is real food and is left alone', () => {
  assert.equal(looksLikeTextCard('studio/bowls/coco.jpg'), false);
});

test('a key with neither signal is treated as a photo, not flagged — the conservative default', () => {
  assert.equal(looksLikeTextCard('studio/2026-07/xyz123.jpg'), false);
  assert.equal(looksLikeTextCard(''), false);
  assert.equal(looksLikeTextCard(null), false);
});

// ---------------------------------------------------------------------------
// foodFirstOrder — the reordering decision
// ---------------------------------------------------------------------------

test('text-card cover + photo later → reordered, photo first', () => {
  const media = [
    slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0),
    slide('m2', 'studio/2026-07/series/p2_body.jpg', 1),
    slide('m3', 'studio/2026-07/up_realphoto.jpg', 2),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, true);
  assert.equal(r.no_photo_found, false);
  assert.deepEqual(r.media.map((m) => m.id), ['m3', 'm1', 'm2'], 'the photo leads, everything else keeps relative order');
});

test('already photo-first → untouched', () => {
  const media = [
    slide('m1', 'studio/2026-07/up_realphoto.jpg', 0),
    slide('m2', 'studio/2026-07/series/p1_cover.jpg', 1),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, false);
  assert.deepEqual(r.media, media, 'same array back, not a copy with the same values');
});

test('all slides are text cards → NOT reordered, NOT blocked, warning raised', () => {
  const media = [
    slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0),
    slide('m2', 'studio/2026-07/series/p2_body.jpg', 1),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, true, 'the flag a caller uses to warn, without inventing an image or refusing to publish');
  assert.deepEqual(r.media, media);
});

test('single-slide post → untouched, whether it is a photo or a text card', () => {
  const photoOnly = [slide('m1', 'studio/2026-07/up_realphoto.jpg', 0)];
  const cardOnly = [slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0)];
  assert.deepEqual(foodFirstOrder(photoOnly), { media: photoOnly, reordered: false, no_photo_found: false });
  assert.deepEqual(foodFirstOrder(cardOnly), { media: cardOnly, reordered: false, no_photo_found: false });
});

test('unknown/ambiguous naming on slide 1 is left alone — never reordered on a guess', () => {
  const media = [
    slide('m1', 'studio/2026-07/xyz.jpg', 0),
    slide('m2', 'studio/2026-07/series/p1_cover.jpg', 1),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false, 'slide 1 does not match the text-card convention, so nothing about it is assumed');
});

test('non-array or empty input never throws', () => {
  assert.equal(foodFirstOrder([]).reordered, false);
  assert.equal(foodFirstOrder(null).reordered, false);
  assert.equal(foodFirstOrder(undefined).reordered, false);
});

// ---------------------------------------------------------------------------
// coverStatus — what the HUB shows, computed from whatever order is CURRENTLY stored
// ---------------------------------------------------------------------------

test('coverStatus is null when slide 1 is not a text card', () => {
  assert.equal(coverStatus([slide('m1', 'studio/2026-07/up_a.jpg', 0)]), null);
  assert.equal(coverStatus([]), null);
});

test('coverStatus is informational when publishing will fix it automatically', () => {
  const s = coverStatus([
    slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0),
    slide('m2', 'studio/2026-07/up_a.jpg', 1),
  ]);
  assert.equal(s.level, 'info');
  assert.match(s.message, /will lead instead/);
});

test('coverStatus warns, and only warns, when there is no photo to promote', () => {
  const allCards = coverStatus([
    slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0),
    slide('m2', 'studio/2026-07/series/p2_body.jpg', 1),
  ]);
  assert.equal(allCards.level, 'warn');
  assert.match(allCards.message, /Every slide/);

  const singleCard = coverStatus([slide('m1', 'studio/2026-07/series/p1_cover.jpg', 0)]);
  assert.equal(singleCard.level, 'warn');
  assert.match(singleCard.message, /single text card/);
});

// ---------------------------------------------------------------------------
// publishSocialPost — the guard actually runs inside the ONE shared publish path
// ---------------------------------------------------------------------------

// A minimal D1 stand-in scoped to what publishSocialPost touches: social_post_media reads/seq
// writes and the social_posts status write on failure. Mirrors the fakeDB pattern already used in
// test/money/ana-social.test.js.
function fakeDB(mediaRows) {
  const seqWrites = [];
  const postUpdates = [];
  return {
    _seqWrites: seqWrites,
    _postUpdates: postUpdates,
    prepare(sql) {
      if (sql.includes('FROM social_post_media WHERE post_id=?')) {
        return { bind: () => ({ all: async () => ({ results: mediaRows.map((r) => ({ ...r })) }) }) };
      }
      if (sql.startsWith('UPDATE social_post_media SET seq=?')) {
        return { bind: (seq, id) => ({ run: async () => { seqWrites.push({ id, seq }); return { meta: { changes: 1 } }; } }) };
      }
      if (sql.startsWith('UPDATE social_posts')) {
        return { bind: (...args) => ({ run: async () => { postUpdates.push(args); return { meta: { changes: 1 } }; } }) };
      }
      return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }), all: async () => ({ results: [] }), first: async () => null }) };
    },
  };
}

test('a real publish persists the fix — seq is rewritten so it is structural, not per-call', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p1_cover.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/up_real.jpg', public_token: 'tok2' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '', IG_POLL_MS: 0 }; // no token → publishImage/Carousel no-ops with ok:false
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' });
  // Regardless of what Instagram itself says (no token here — that is a separate, well-tested
  // path in instagram-carousel.test.js), the reorder must already be written: m2 (the real photo)
  // takes seq 0, m1 (the text card) takes seq 1.
  assert.deepEqual(db._seqWrites, [{ id: 'm2', seq: 0 }, { id: 'm1', seq: 1 }]);
});

test('a dry run computes the same reorder in-memory but writes nothing', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p1_cover.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/up_real.jpg', public_token: 'tok2' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '' };
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' }, { publish: false });
  assert.deepEqual(db._seqWrites, [], 'dry runs never write — the same rule the shared function already keeps for everything else');
});

test('a post that is already photo-first triggers no seq writes at all', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/up_real.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p1_cover.jpg', public_token: 'tok2' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '' };
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' });
  assert.deepEqual(db._seqWrites, []);
});

// ---------------------------------------------------------------------------
// integration points — structural pins, same style as instagram-carousel.test.js
// ---------------------------------------------------------------------------

test('the guard runs inside publishSocialPost — the one path the button and the tick share', () => {
  const fnStart = SHARED.indexOf('export async function publishSocialPost');
  const fnBody = SHARED.slice(fnStart);
  assert.match(fnBody, /foodFirstOrder\(media\)/);
  // It must run BEFORE the single-vs-carousel branch, or the branch would decide on the old order.
  assert.ok(fnBody.indexOf('foodFirstOrder(media)') < fnBody.indexOf('media.length === 1'), 'reorder happens before publishing decides single vs carousel');
});

test('the HUB list reads cover_status from the shared function, not a re-implementation', () => {
  assert.match(API, /coverStatus\(post\.media\)/);
  assert.match(API, /import \{ publishSocialPost, loadPostMedia, coverStatus \} from '\.\.\/\.\.\/\.\.\/_lib\/social_publish\.js'/);
});

test('the owner page renders the indicator on every post card', () => {
  assert.match(HTML, /function coverNote\(p\)/);
  assert.match(HTML, /coverNote\(p\)/);
  assert.match(HTML, /cover-note/);
});

test('sanity: loadPostMedia and publishSocialPost are exported from the one file everything imports', () => {
  assert.equal(typeof loadPostMedia, 'function');
  assert.equal(typeof publishSocialPost, 'function');
});
