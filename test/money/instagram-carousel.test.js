// Carousels: 2-10 images as one post.
//
// The rule that governs every level is the single-image rule one level deeper: NOTHING IS
// PUBLISHED ON A GUESS. The new failure mode carousels introduce is the HALF-BUILT set — child 3
// of 5 fails, and a system without these tests would publish a 2-slide version of a 5-slide post.
// A truncated carousel is a WRONG post on a public profile, not a partial success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishCarousel, CAROUSEL_MIN, CAROUSEL_MAX } from '../../functions/_lib/instagram.js';

const SHARED = readFileSync(new URL('../../functions/_lib/social_publish.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/social-tick.js', import.meta.url), 'utf8');
const ROUTE = readFileSync(new URL('../../functions/api/social/media/[token].js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0063_social_carousel.sql', import.meta.url), 'utf8');

// Distinct token per test: resolveTarget memoizes per token, and a shared one would let one
// test's stub answer another's probe.
const env = (tok) => ({ IG_ACCESS_TOKEN: tok, IG_USER_ID: '17841400000000000', IG_POLL_MS: 0, IG_API_HOST: 'facebook' });

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init && init.body ? String(init.body) : '' }); return handler({ url: String(url), body: init && init.body ? String(init.body) : '', calls }); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const twoSlides = [
  { imageUrl: 'https://x.test/a.jpg', mediaKey: 'studio/2026-07/a.jpg' },
  { imageUrl: 'https://x.test/b.jpg', mediaKey: 'studio/2026-07/b.jpg' },
];

// ---------- the happy path, in the order Meta requires ----------

test('children are created in slide order, polled, THEN the parent, THEN publish', async () => {
  const events = [];
  let n = 0;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) { events.push('publish'); return jsonRes({ id: 'POST1' }); }
    if (url.includes('/media') && body.includes('is_carousel_item')) { events.push('child:' + decodeURIComponent(body).match(/image_url=([^&]+)/)[1]); return jsonRes({ id: 'CH' + (++n) }); }
    if (url.includes('/media') && body.includes('CAROUSEL')) {
      events.push('parent:' + decodeURIComponent(body).match(/children=([^&]+)/)[1]);
      return jsonRes({ id: 'PARENT1' });
    }
    if (url.includes('CH1') || url.includes('CH2') || url.includes('PARENT1')) { events.push('poll'); return jsonRes({ status_code: 'FINISHED' }); }
    if (url.includes('POST1')) return jsonRes({ permalink: 'https://instagram.com/p/car1' });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await publishCarousel(env('tok-happy'), { items: twoSlides, caption: 'hi' });
    assert.equal(r.ok, true);
    assert.equal(r.media_id, 'POST1');
    assert.equal(r.permalink, 'https://instagram.com/p/car1', 'read back as proof it is live');
    // Order is the contract: both children, then their polls, then the parent carrying CH1,CH2
    // in slide order, then its poll, then publish.
    assert.deepEqual(events.slice(0, 2), ['child:https://x.test/a.jpg', 'child:https://x.test/b.jpg'], 'slide order preserved');
    assert.ok(events.indexOf('parent:CH1,CH2') > events.lastIndexOf('child:https://x.test/b.jpg'), 'parent after all children');
    assert.equal(events[events.length - 1], 'publish');
  } finally { f.restore(); }
});

// ---------- the half-built set ----------

test('one unfinished child means NO parent and NO post — never a truncated carousel', async () => {
  let parentMade = false, published = false;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) { published = true; return jsonRes({ id: 'X' }); }
    if (url.includes('/media') && body.includes('is_carousel_item')) return jsonRes({ id: body.includes('a.jpg') ? 'CHA' : 'CHB' });
    if (url.includes('/media') && body.includes('CAROUSEL')) { parentMade = true; return jsonRes({ id: 'P' }); }
    if (url.includes('CHA')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ status_code: 'IN_PROGRESS' });   // CHB never finishes
  });
  try {
    const r = await publishCarousel(env('tok-stuck'), { items: twoSlides });
    assert.equal(r.ok, false);
    assert.equal(parentMade, false, 'the parent container must not exist over an unfinished child');
    assert.equal(published, false);
  } finally { f.restore(); }
});

test('a child ERROR fails the whole post with the reason, publishing nothing', async () => {
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) throw new Error('must not publish');
    if (url.includes('/media') && body.includes('is_carousel_item')) return jsonRes({ id: body.includes('a.jpg') ? 'CHA' : 'CHB' });
    if (url.includes('CHA')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ status_code: 'ERROR', status: 'Image download failed' });
  });
  try {
    const r = await publishCarousel(env('tok-err'), { items: twoSlides });
    assert.equal(r.ok, false);
    assert.match(r.error, /Image download failed/);
  } finally { f.restore(); }
});

// ---------- bounds and formats, refused before Meta is touched ----------

test('1 slide and 11 slides are refused without a single API call', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const one = await publishCarousel(env('tok-b1'), { items: twoSlides.slice(0, 1) });
    assert.equal(one.ok, false);
    const eleven = await publishCarousel(env('tok-b2'), { items: Array.from({ length: 11 }, (_, i) => ({ imageUrl: `https://x.test/${i}.jpg`, mediaKey: `s/${i}.jpg` })) });
    assert.equal(eleven.ok, false);
    assert.equal(CAROUSEL_MIN, 2); assert.equal(CAROUSEL_MAX, 10);
  } finally { f.restore(); }
});

test('a non-JPEG slide is refused before a single container is spent', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishCarousel(env('tok-png'), { items: [twoSlides[0], { imageUrl: 'https://x.test/b.png', mediaKey: 's/b.png' }] });
    assert.equal(r.ok, false);
    assert.match(r.error, /JPEG/);
  } finally { f.restore(); }
});

// ---------- the dry run ----------

test('a dry run builds every container and NEVER calls media_publish', async () => {
  let published = false;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) { published = true; return jsonRes({ id: 'X' }); }
    if (url.includes('/media')) return jsonRes({ id: body.includes('CAROUSEL') ? 'PAR' : 'CH' + Math.random().toString(36).slice(2, 6) });
    return jsonRes({ status_code: 'FINISHED' });
  });
  try {
    const r = await publishCarousel(env('tok-dry'), { items: twoSlides }, { publish: false });
    assert.equal(r.ok, true);
    assert.equal(r.dry_run, true);
    assert.equal(published, false, 'the profile must be untouched');
  } finally { f.restore(); }
});

test('a dry run on a SINGLE image is refused — publishImage has no dry mode', () => {
  // Falling through would publish for real: the exact accident a dry run exists to prevent.
  assert.match(SHARED, /if \(dry && media\.length < 2\)/);
  assert.ok(SHARED.indexOf('dry && media.length < 2') < SHARED.indexOf('media.length === 1'), 'refused BEFORE the branch');
});

test("the HUB dry_run op takes no claim — a dry run must not move the post's status", () => {
  const block = API.slice(API.indexOf("op === 'dry_run'"), API.indexOf("op === 'schedule'"));
  assert.ok(block.includes('publish: false'));
  assert.ok(!/status='publishing'/.test(block), 'no claim in the dry-run path');
});

// ---------- one publish path ----------

test('the button and the timer publish through the SAME shared function', () => {
  // Two copies of "what publishing means" is how the timer and the button eventually disagree —
  // the drift sendCampaignBatch was extracted to prevent, repeated here on purpose.
  assert.match(SHARED, /export async function publishSocialPost/);
  assert.match(API, /await publishSocialPost\(env, request, post\)/);
  assert.match(TICK, /await publishSocialPost\(env, request, p\)/);
  assert.ok(!/publishImage/.test(TICK), 'the tick no longer knows how to publish on its own');
});

test('single vs carousel is decided by slide count in exactly one place', () => {
  assert.match(SHARED, /media\.length === 1\s*\?\s*await publishImage/);
  assert.match(SHARED, /:\s*await publishCarousel/);
});

test('a failed publish still lands in a retryable state, never stuck', () => {
  assert.match(SHARED, /SET status='failed', error=\?/);
});

// ---------- slides in the schema ----------

test('the migration is additive and carries every existing token', () => {
  // Minting new tokens would break any container Instagram is mid-fetch on, and the deploy
  // window runs old code on the new schema — so nothing is dropped and tokens move verbatim.
  assert.ok(!/DROP TABLE/i.test(MIG));
  assert.match(MIG, /INSERT OR IGNORE INTO social_post_media/);
  assert.match(MIG, /SELECT 'spm_' \|\| id, id, 0, media_key, public_token, created_at/);
  assert.match(MIG, /public_token TEXT NOT NULL UNIQUE/);
});

test('the public window resolves PER-SLIDE tokens through the post status', () => {
  assert.match(ROUTE, /FROM social_post_media m/);
  assert.match(ROUTE, /JOIN social_posts p ON p\.id = m\.post_id/);
  assert.match(ROUTE, /WHERE m\.public_token = \?/);
});

test('the tick claims only posts that actually HAVE a slide', () => {
  assert.match(TICK, /EXISTS \(SELECT 1 FROM social_post_media m WHERE m\.post_id = social_posts\.id\)/);
});

// ---------- curation rules in the HUB ----------

test('the 11th photo is refused at attach time, not 20 seconds into a publish', () => {
  assert.match(API, /existing\.length >= CAROUSEL_MAX/);
});

test('removing a slide reseals the order — seq stays 0..n-1', () => {
  const block = API.slice(API.indexOf("op === 'detach'"), API.indexOf("op === 'reorder'"));
  assert.ok(block.includes('for (let i = 0; i < left.length; i++)'));
});

test('reorder takes the WHOLE order and ignores ids from a stale page', () => {
  const block = API.slice(API.indexOf("op === 'reorder'"), API.indexOf("op === 'dry_run'"));
  assert.ok(block.includes('if (!mine.has(mid)) continue'));
});

test('slides lock once the post is on its way out', () => {
  for (const opName of ['detach', 'reorder']) {
    const block = API.slice(API.indexOf(`op === '${opName}'`));
    assert.match(block.slice(0, 800), /'published' \|\| row\.status === 'publishing'/, opName);
  }
});
