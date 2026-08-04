// Food-first guard: Instagram's grid shows ONLY the first slide of a carousel, and
// tools/cardgen/series_cards.py renders text cards on a near-black forest green — a text card as
// slide 1 turns the grid into a wall of typography with the food invisible on slides 2+. This is
// the production bug the owner caught ("looks like a green block") and the fix that makes it
// structural: reorder so a photo leads, computed in ONE place (foodFirstOrder /
// publishSocialPost) so the owner's button and the unattended tick can never disagree about it.
//
// DETECTION HISTORY — the first version of this guard matched the `series/` FOLDER, and was wrong:
// in production that folder holds text cards and food photos side by side (p6_cover.jpg sits next
// to p6_photo.jpg). Matching the folder made every slide "look like a text card", so the guard
// found no photo to promote on posts that had one and raised a false "no photo" warning exactly
// where it needed to work. The fix reads each filename's ROLE SUFFIX instead — see the acceptance
// tests below, built from the real production key shapes the reviewer supplied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isFoodPhoto,
  isTextCard,
  foodFirstOrder,
  coverStatus,
  publishSocialPost,
  loadPostMedia,
} from '../../functions/_lib/social_publish.js';

const SHARED = readFileSync(new URL('../../functions/_lib/social_publish.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
// 2026-08-04: the cover-note indicator now renders inside the Create > Instagram tab of the
// unified marketing.html workspace.
const HTML = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

const slide = (id, media_key, seq) => ({ id, media_key, seq });

// A real production carousel, built from a slide-role list like ['cover', 'photo', 'cta'].
const post = (roles) => roles.map((r, i) => slide(`m${i}`, `studio/2026-07/series/p9_${r}.jpg`, i));

// ---------------------------------------------------------------------------
// Role detection — isTextCard / isFoodPhoto, keyed off the FILENAME, never the folder
// ---------------------------------------------------------------------------

test('the folder alone proves nothing — text cards and photos share studio/2026-07/series/', () => {
  // This is the exact defect caught in review: matching `series/` made every slide of every real
  // draft "a text card", photos included. Pin that a shared folder no longer decides anything.
  assert.equal(isTextCard('studio/2026-07/series/p6_cover.jpg'), true);
  assert.equal(isFoodPhoto('studio/2026-07/series/p6_photo.jpg'), true, 'a photo in the SAME folder as a cover must read as a photo');
  assert.equal(isTextCard('studio/2026-07/series/p6_photo.jpg'), false, 'and never double as a text card');
});

test('known card roles: cover, cta, hook, rule, facts, why', () => {
  for (const role of ['cover', 'cta', 'hook', 'rule', 'facts', 'why']) {
    assert.equal(isTextCard(`studio/2026-07/series/p1_${role}.jpg`), true, role);
    assert.equal(isFoodPhoto(`studio/2026-07/series/p1_${role}.jpg`), false, role);
  }
});

test('_photo suffix is a positive photo match', () => {
  assert.equal(isFoodPhoto('studio/2026-07/series/p3_photo.jpg'), true);
  assert.equal(isTextCard('studio/2026-07/series/p3_photo.jpg'), false);
});

test('bowl names are photos both as the whole filename and as a role suffix', () => {
  // studio/bowls/<bowl>.jpg — the canonical staged bowl image (functions/_lib/bowl_art.js).
  for (const bowl of ['coco', 'ligero', 'congreen', 'fuego', 'vida', 'mar', 'raiz', 'fuerza']) {
    assert.equal(isFoodPhoto(`studio/bowls/${bowl}.jpg`), true, bowl);
    // ...and reused inside a series/ carousel, e.g. p1_vida.jpg from the p1 acceptance case.
    assert.equal(isFoodPhoto(`studio/2026-07/series/p1_${bowl}.jpg`), true, `series/ p1_${bowl}`);
  }
});

test('a bowl name is a photo, never a text card, and vice versa', () => {
  assert.equal(isTextCard('studio/bowls/vida.jpg'), false);
  assert.equal(isTextCard('studio/2026-07/series/p1_vida.jpg'), false);
});

test('an unrecognized role suffix is neither a card nor a photo — UNKNOWN, never guessed', () => {
  // p3's real "inside" slide from the acceptance set: not a card role, not "photo", not a bowl.
  assert.equal(isTextCard('studio/2026-07/series/p3_inside.jpg'), false);
  assert.equal(isFoodPhoto('studio/2026-07/series/p3_inside.jpg'), false);
});

test('an uploaded phone photo has no role suffix at all and is left UNKNOWN, not assumed to be food', () => {
  // functions/api/hub/owner/social-upload.js always mints studio/<yyyy-mm>/up_<id>.jpg — a random
  // id, not one of the known roles. Per the reviewed rule, unknowns are never promoted and never
  // counted as the cover to warn about; this is a documented limit, not an oversight.
  assert.equal(isTextCard('studio/2026-07/up_a1b2c3.jpg'), false);
  assert.equal(isFoodPhoto('studio/2026-07/up_a1b2c3.jpg'), false);
});

test('empty/missing keys never throw and are UNKNOWN', () => {
  assert.equal(isTextCard(''), false);
  assert.equal(isFoodPhoto(''), false);
  assert.equal(isTextCard(null), false);
  assert.equal(isFoodPhoto(undefined), false);
});

// ---------------------------------------------------------------------------
// foodFirstOrder — the acceptance set, verbatim from the reviewer's real production keys
// ---------------------------------------------------------------------------

test('p1: cover + bowl-name photos → reorder, first bowl photo leads', () => {
  const media = post(['cover', 'vida', 'fuego', 'mar', 'ligero', 'coco', 'congreen', 'raiz']);
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, true);
  assert.equal(r.no_photo_found, false);
  assert.deepEqual(
    r.media.map((m) => m.id),
    ['m1', 'm0', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'],
    'vida (first recognized photo) leads; cover and every other bowl keep their relative order'
  );
});

test('p3: cover, photo, inside, cta → reorder; the unknown "inside" slide keeps its place', () => {
  const media = post(['cover', 'photo', 'inside', 'cta']);
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, true);
  assert.deepEqual(
    r.media.map((m) => m.id),
    ['m1', 'm0', 'm2', 'm3'],
    'photo leads; cover, inside (unknown), cta keep their original relative order'
  );
});

test('p6: cover, why, photo, cta → reorder, photo leads', () => {
  const media = post(['cover', 'why', 'photo', 'cta']);
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, true);
  assert.deepEqual(r.media.map((m) => m.id), ['m2', 'm0', 'm1', 'm3']);
});

test('p4: hook, rule, cta → no photo anywhere → warn, do not block, do not reorder', () => {
  const media = post(['hook', 'rule', 'cta']);
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, true);
  assert.deepEqual(r.media, media, 'untouched — same slides, same order');
});

test('p5: cover, facts, cta → no photo anywhere → warn, do not block, do not reorder', () => {
  const media = post(['cover', 'facts', 'cta']);
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, true);
  assert.deepEqual(r.media, media);
});

test('already photo-first → untouched', () => {
  const media = [
    slide('m1', 'studio/2026-07/series/p2_photo.jpg', 0),
    slide('m2', 'studio/2026-07/series/p2_cover.jpg', 1),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, false);
  assert.deepEqual(r.media, media, 'same array back, not a copy with the same values');
});

test('single-slide post → untouched, whether it is a photo or a text card', () => {
  const photoOnly = [slide('m1', 'studio/2026-07/series/p2_photo.jpg', 0)];
  const cardOnly = [slide('m1', 'studio/2026-07/series/p2_cover.jpg', 0)];
  assert.deepEqual(foodFirstOrder(photoOnly), { media: photoOnly, reordered: false, no_photo_found: false });
  assert.deepEqual(foodFirstOrder(cardOnly), { media: cardOnly, reordered: false, no_photo_found: false });
});

test('unknown/ambiguous naming on slide 1 is left alone — never reordered on a guess', () => {
  const media = [
    slide('m1', 'studio/2026-07/up_xyz.jpg', 0),          // unknown — no role suffix
    slide('m2', 'studio/2026-07/series/p2_cover.jpg', 1),
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false, 'slide 1 is not a recognized text card, so nothing about it is assumed');
});

test('an unknown slide is never promoted as "the photo", even sitting where a photo would fit', () => {
  const media = [
    slide('m1', 'studio/2026-07/series/p2_cover.jpg', 0),
    slide('m2', 'studio/2026-07/up_mystery.jpg', 1), // unknown role — must NOT count as the photo
  ];
  const r = foodFirstOrder(media);
  assert.equal(r.reordered, false);
  assert.equal(r.no_photo_found, true, 'an unknown slide does not satisfy "a photo was found"');
});

test('non-array or empty input never throws', () => {
  assert.equal(foodFirstOrder([]).reordered, false);
  assert.equal(foodFirstOrder(null).reordered, false);
  assert.equal(foodFirstOrder(undefined).reordered, false);
});

// ---------------------------------------------------------------------------
// coverStatus — what the HUB shows, computed from whatever order is CURRENTLY stored
// ---------------------------------------------------------------------------

test('coverStatus is null when slide 1 is not a recognized text card', () => {
  assert.equal(coverStatus([slide('m1', 'studio/2026-07/series/p2_photo.jpg', 0)]), null);
  assert.equal(coverStatus([slide('m1', 'studio/2026-07/up_a.jpg', 0)]), null, 'unknown slide 1 says nothing, does not warn');
  assert.equal(coverStatus([]), null);
});

test('coverStatus is informational when publishing will fix it automatically (p3/p6 shape)', () => {
  const s = coverStatus(post(['cover', 'why', 'photo', 'cta']));
  assert.equal(s.level, 'info');
  assert.match(s.message, /will lead instead/);
});

test('coverStatus warns PLAINLY that the post has no food photo — not that publishing will handle it (p4/p5 shape)', () => {
  const noPhotoMulti = coverStatus(post(['hook', 'rule', 'cta']));
  assert.equal(noPhotoMulti.level, 'warn');
  assert.match(noPhotoMulti.message, /no food photo/i);
  assert.doesNotMatch(noPhotoMulti.message, /will/i, 'must not imply publishing fixes this');

  const singleCard = coverStatus([slide('m1', 'studio/2026-07/series/p2_cover.jpg', 0)]);
  assert.equal(singleCard.level, 'warn');
  assert.match(singleCard.message, /no food photo/i);
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

test('a real publish persists the p6 fix — seq is rewritten so it is structural, not per-call', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p6_cover.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p6_why.jpg', public_token: 'tok2' },
    { id: 'm3', seq: 2, media_key: 'studio/2026-07/series/p6_photo.jpg', public_token: 'tok3' },
    { id: 'm4', seq: 3, media_key: 'studio/2026-07/series/p6_cta.jpg', public_token: 'tok4' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '', IG_POLL_MS: 0 }; // no token → publishImage/Carousel no-ops with ok:false
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' });
  // Regardless of what Instagram itself says (no token here — that is a separate, well-tested
  // path in instagram-carousel.test.js), the reorder must already be written: m3 (p6_photo) takes
  // seq 0, and cover/why/cta keep their relative order behind it.
  assert.deepEqual(db._seqWrites, [{ id: 'm3', seq: 0 }, { id: 'm1', seq: 1 }, { id: 'm2', seq: 2 }, { id: 'm4', seq: 3 }]);
});

test('a real publish on p4 (no photo) writes NO seq changes — nothing to promote', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p4_hook.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p4_rule.jpg', public_token: 'tok2' },
    { id: 'm3', seq: 2, media_key: 'studio/2026-07/series/p4_cta.jpg', public_token: 'tok3' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '' };
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' });
  assert.deepEqual(db._seqWrites, [], 'no photo anywhere on the post — publish must not invent or reshuffle anything');
});

test('a dry run computes the same reorder in-memory but writes nothing', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p3_cover.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p3_photo.jpg', public_token: 'tok2' },
  ];
  const db = fakeDB(media);
  const env = { DB: db, IG_ACCESS_TOKEN: '' };
  const request = new Request('https://x.test/api/hub/owner/social');
  await publishSocialPost(env, request, { id: 'sp1', caption: 'hi' }, { publish: false });
  assert.deepEqual(db._seqWrites, [], 'dry runs never write — the same rule the shared function already keeps for everything else');
});

test('a post that is already photo-first triggers no seq writes at all', async () => {
  const media = [
    { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p2_photo.jpg', public_token: 'tok1' },
    { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p2_cover.jpg', public_token: 'tok2' },
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

test('detection is keyed off the filename role, not the folder — the regression this review caught', () => {
  assert.ok(!/\(\^\|\\\/\)series\\\//.test(SHARED), 'the folder-wide series/ match must not come back');
  assert.match(SHARED, /BOWL_NAMES/);
  assert.match(SHARED, /CARD_ROLES/);
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
