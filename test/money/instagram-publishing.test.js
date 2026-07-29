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
import { igConfigured, publishImage, accountInfo, resolveTarget, JPEG_ONLY } from '../../functions/_lib/instagram.js';

const LIB = readFileSync(new URL('../../functions/_lib/instagram.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const PUBLIC = readFileSync(new URL('../../functions/api/social/media/[token].js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0056_social_posts.sql', import.meta.url), 'utf8');

// IG_POLL_MS keeps the real 2s-per-poll wait out of the suite; the polling LOGIC is unchanged.
// IG_API_HOST pins the publish tests to one API so they assert publishing, not host detection —
// detection has its own tests below, and a token+id+host that are all explicit needs no probe.
const ENV = { IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841400000000000', IG_POLL_MS: 0, IG_API_HOST: 'facebook' };

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

// ---------- two APIs, two hosts ----------
//
// Meta ships "Instagram API with Instagram Login" (graph.instagram.com) and "Instagram API with
// Facebook Login" (graph.facebook.com). Their tokens are NOT interchangeable and nothing in a
// token says which it is. Guessing wrong returns "Invalid OAuth 2.0 Access Token" — identical to
// an expired token, so the owner would go and renew a token that was never the problem.

test('an Instagram Login token is detected without any IG_USER_ID', async () => {
  // The whole point of the newer path: no Facebook Page, and no hunting for a 17-digit id.
  const f = stubFetch(({ url }) => {
    if (url.includes('graph.instagram.com')) return jsonRes({ user_id: '17841400000000009', username: 'anejo', followers_count: 4, media_count: 6 });
    throw new Error('must not ask graph.facebook.com first');
  });
  try {
    const t = await resolveTarget({ IG_ACCESS_TOKEN: 'ig-only-token' });
    assert.equal(t.ok, true);
    assert.match(t.base, /graph\.instagram\.com/);
    assert.equal(t.id, '17841400000000009', 'the id is DERIVED from /me, not configured');
  } finally { f.restore(); }
});

test('a Facebook Login token falls through to graph.facebook.com', async () => {
  // Instagram Login is tried first because it is the recommended path — but a Page token must
  // still work, or anyone already set up the old way breaks.
  const seen = [];
  const f = stubFetch(({ url }) => {
    seen.push(url);
    if (url.includes('graph.instagram.com')) return jsonRes({ error: { message: 'Invalid OAuth 2.0 Access Token', code: 190 } }, 401);
    return jsonRes({ id: '17841400000000000', username: 'anejo', followers_count: 4, media_count: 6 });
  });
  try {
    const t = await resolveTarget({ IG_ACCESS_TOKEN: 'page-token-x', IG_USER_ID: '17841400000000000' });
    assert.equal(t.ok, true);
    assert.match(t.base, /graph\.facebook\.com/);
    assert.ok(seen[0].includes('graph.instagram.com'), 'Instagram Login is tried first');
  } finally { f.restore(); }
});

test('a token neither API accepts reports the failure, not a wrong host', async () => {
  const f = stubFetch(() => jsonRes({ error: { message: 'Invalid OAuth 2.0 Access Token', code: 190 } }, 401));
  try {
    const t = await resolveTarget({ IG_ACCESS_TOKEN: 'garbage', IG_USER_ID: '1784140000000000x' });
    assert.equal(t.ok, false);
    assert.match(t.error, /Invalid OAuth/);
  } finally { f.restore(); }
});

test('detection is memoized — a second call does not re-probe', async () => {
  // Otherwise every HUB page load costs two extra Meta calls for an answer that cannot change.
  let calls = 0;
  const f = stubFetch(() => { calls++; return jsonRes({ user_id: '1784140000000000m', username: 'anejo' }); });
  try {
    const env = { IG_ACCESS_TOKEN: 'memo-token-' + 'z' };
    await resolveTarget(env);
    const after = calls;
    await resolveTarget(env);
    assert.equal(calls, after, 'the host was remembered');
  } finally { f.restore(); }
});

test('an explicit host + id skips the probe entirely', async () => {
  const f = stubFetch(() => { throw new Error('must not probe when told'); });
  try {
    const t = await resolveTarget({ IG_ACCESS_TOKEN: 'explicit-tok', IG_USER_ID: '123', IG_API_HOST: 'instagram' });
    assert.equal(t.ok, true);
    assert.match(t.base, /graph\.instagram\.com/);
  } finally { f.restore(); }
});

test('the HUB is told WHICH api the token belongs to', async () => {
  // It decides where the owner renews it in 60 days, so "connected" alone is not enough.
  const f = stubFetch(() => jsonRes({ user_id: '1784140000000000h', username: 'anejocatering', followers_count: 4, media_count: 6 }));
  try {
    const a = await accountInfo({ IG_ACCESS_TOKEN: 'host-label-token' });
    assert.equal(a.ok, true);
    assert.equal(a.username, 'anejocatering');
    assert.equal(a.host, 'instagram_login');
  } finally { f.restore(); }
});

test('the version is pinned, never left to Meta to choose', () => {
  // An unversioned Graph call is served by whatever version Meta decides, which changes the
  // contract underneath us without a deploy.
  assert.match(LIB, /graph\.instagram\.com\/v\d+\.\d+/);
  assert.match(LIB, /graph\.facebook\.com\/v\d+\.\d+/);
});
