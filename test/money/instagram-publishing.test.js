// Publishing to Instagram from the HUB.
//
// Creative Studio already writes captions and generates plate images; there was no path from
// "generated" to "on the profile". Six posts on the account is what happens when that path is a
// person copying files by hand.
//
// Two things here are genuinely dangerous and both are pinned below:
//
// 1. THE PUBLIC IMAGE WINDOW. Instagram does not take image bytes — you give it an image_url and
//    its servers fetch that URL anonymously. Our media route is behind requireRole, and the same
//    R2 bucket holds delivery PROOF PHOTOS and RECEIPTS. Opening the bucket to solve this would
//    publish customers' doorsteps and addresses.
//
// 2. DOUBLE POSTING. The flow takes ~20 seconds (create container → poll → publish), so a second
//    click, or the scheduler firing mid-click, must not put the same photo up twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { igConfigured, publishImage, JPEG_ONLY } from '../../functions/_lib/instagram.js';

const LIB = readFileSync(new URL('../../functions/_lib/instagram.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const PUBLIC = readFileSync(new URL('../../functions/api/social/media/[token].js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0056_social_posts.sql', import.meta.url), 'utf8');

// IG_POLL_MS keeps the real 2s-per-poll wait out of the suite; the polling LOGIC is unchanged.
const ENV = { IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841400000000000', IG_POLL_MS: 0 };

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler({ url: String(url), init, calls }); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- configuration posture ----------

test('with no credentials it no-ops instead of throwing', async () => {
  assert.equal(igConfigured({}), false);
  const r = await publishImage({}, { imageUrl: 'https://x.test/a.jpg' });
  assert.equal(r.reason, 'not_configured');
});

// ---------- the image window ----------

test('the public route serves ONLY the media_key its token points at', () => {
  // The caller names a token, never a key — so there is no path from this route to a proof photo
  // even with a valid token in hand.
  assert.match(PUBLIC, /SELECT media_key, status FROM social_posts WHERE public_token = \?/);
  assert.ok(!/params\.path|params\.key/.test(PUBLIC), 'the caller cannot name an object');
});

test('the window CLOSES once the post is live', () => {
  // Instagram hosts its own copy after publishing, so it never comes back. Leaving the URL open
  // would let a leaked token keep serving the image forever.
  assert.match(PUBLIC, /post\.status === 'published' \|\| post\.status === 'failed'/);
});

test('a short or missing token is refused before touching the database', () => {
  // Otherwise a typo becomes a scan of the table.
  assert.match(PUBLIC, /token\.length < 16/);
});

test('the token is unguessable and unique per post', () => {
  assert.match(API, /randToken\(24\)/);
  assert.match(MIG, /public_token\s+TEXT NOT NULL UNIQUE/);
});

test('an unknown token is a 404, never an error that confirms it exists', () => {
  assert.match(PUBLIC, /const notFound = \(\) => new Response\('Not found', \{ status: 404 \}\)/);
});

// ---------- Instagram's actual contract ----------

test('the container is POLLED until FINISHED before publishing', async () => {
  // The step that is easy to miss: Instagram fetches our URL on its own schedule, and publishing
  // an IN_PROGRESS container fails.
  let published = false;
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) { published = true; return jsonRes({ id: 'MEDIA1' }); }
    if (url.includes('/media')) return jsonRes({ id: 'CONTAINER1' });
    if (url.includes('CONTAINER1')) return jsonRes({ status_code: 'FINISHED' });
    if (url.includes('MEDIA1')) return jsonRes({ permalink: 'https://instagram.com/p/abc' });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await publishImage(ENV, { imageUrl: 'https://x.test/a.jpg', caption: 'hi', mediaKey: 'studio/2026-07/a.jpg' });
    assert.equal(r.ok, true);
    assert.equal(r.media_id, 'MEDIA1');
    assert.equal(r.permalink, 'https://instagram.com/p/abc', 'read back as proof it is live');
    assert.ok(published);
  } finally { f.restore(); }
});

test('a container that never FINISHES is NOT published', async () => {
  // Publishing on a guess is how the same photo goes up twice. It is retried from scratch instead.
  let published = false;
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) { published = true; return jsonRes({ id: 'X' }); }
    if (url.includes('/media')) return jsonRes({ id: 'CONTAINER1' });
    return jsonRes({ status_code: 'IN_PROGRESS' });
  });
  try {
    const r = await publishImage(ENV, { imageUrl: 'https://x.test/a.jpg', mediaKey: 'a.jpg' });
    assert.equal(r.ok, false);
    assert.equal(published, false, 'nothing may be posted while the container is unfinished');
    assert.match(r.error, /nothing was posted/);
  } finally { f.restore(); }
});

test('an ERROR container fails fast rather than polling to the end', async () => {
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) throw new Error('must not publish');
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    return jsonRes({ status_code: 'ERROR', status: 'Image download failed' });
  });
  try {
    const r = await publishImage(ENV, { imageUrl: 'https://x.test/a.jpg', mediaKey: 'a.jpg' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Image download failed/);
  } finally { f.restore(); }
});

test('a non-JPEG is refused BEFORE a container is created', async () => {
  // Instagram is JPEG-only, and our bucket accepts png/webp for other purposes.
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishImage(ENV, { imageUrl: 'https://x.test/a.png', mediaKey: 'studio/2026-07/a.png' });
    assert.equal(r.ok, false);
    assert.match(r.error, /only accepts JPEG/);
  } finally { f.restore(); }
  assert.ok(JPEG_ONLY.test('a.jpg') && JPEG_ONLY.test('a.jpeg') && !JPEG_ONLY.test('a.png'));
});

test("Meta's nested error message is surfaced, not a bare status", () => {
  assert.match(LIB, /e\.message, e\.error_user_msg/);
});

// ---------- double-post protection ----------

test('publishing CLAIMS the post before doing any work', () => {
  // ~20 seconds of container + polling sits between the click and the post. Without the claim, a
  // double click or the scheduler firing mid-click puts the same photo up twice.
  assert.match(API, /UPDATE social_posts SET status='publishing'.*WHERE id=\? AND status IN \('draft','scheduled','failed'\)/s);
  assert.match(API, /claim\.meta\.changes !== 1/);
  assert.match(API, /already being published/);
});

test('an already-published post reports itself instead of posting again', () => {
  assert.match(API, /if \(post\.status === 'published'\) return json\(\{ ok: true, already: true/);
});

test('a failure returns the post to a RETRYABLE state, never stuck', () => {
  // Left in 'publishing', nothing would ever pick it up again.
  assert.match(API, /SET status='failed', error=\?/);
});

test('deleting a live post is refused', () => {
  // Deleting our row would lose the record while the post stays up on the profile.
  assert.match(API, /already live on Instagram — delete it in the app/);
});

test('the daily cap is surfaced so a batch cannot burn it silently', () => {
  assert.match(API, /DAILY_CAP = 25/);
  assert.match(API, /remaining_today/);
});
