// Reels: the gap that motivated migrations/0080. Until now the only media_type literal anywhere in
// _lib/instagram.js was 'CAROUSEL' — a video handed to publishImage would have been posted through
// the image container flow, which Instagram either rejects outright or (worse) accepts and mangles.
//
// The shape below is the SAME three-step contract every other publish path in this file already
// uses (container -> poll to FINISHED -> media_publish), with media_type=REELS and video_url in
// place of image_url — see the comment above publishReel in functions/_lib/instagram.js for the
// exact Graph API doc this was built from. Reusing waitFinished (not a second poll loop) is the
// point: ERROR/EXPIRED handling and the "never publish an unfinished container" rule must not be
// able to drift between image and video.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishReel, VIDEO_ONLY } from '../../functions/_lib/instagram.js';

const LIB = readFileSync(new URL('../../functions/_lib/instagram.js', import.meta.url), 'utf8');

const env = (tok) => ({ IG_ACCESS_TOKEN: tok, IG_USER_ID: '17841400000000000', IG_POLL_MS: 0, IG_API_HOST: 'facebook' });

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init && init.body ? String(init.body) : '' }); return handler({ url: String(url), body: init && init.body ? String(init.body) : '', calls }); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------- configuration + format posture ----------

test('with no credentials it no-ops instead of throwing', async () => {
  const r = await publishReel({}, { videoUrl: 'https://x.test/a.mp4' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_configured');
});

test('no video URL is refused before any network call', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishReel(env('tok-novid'), {});
    assert.equal(r.ok, false);
    assert.match(r.error, /No video/);
  } finally { f.restore(); }
});

test('a non-MP4/MOV key is refused before a container is spent', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishReel(env('tok-badfmt'), { videoUrl: 'https://x.test/a.jpg', mediaKey: 'studio/2026-08/a.jpg' });
    assert.equal(r.ok, false);
    assert.match(r.error, /MP4 or MOV/);
  } finally { f.restore(); }
  assert.ok(VIDEO_ONLY.test('a.mp4') && VIDEO_ONLY.test('a.mov') && !VIDEO_ONLY.test('a.jpg'));
});

// ---------- the container carries media_type=REELS and video_url — the whole missing piece ----------

test('the container is created with media_type=REELS and video_url, not image_url', async () => {
  let containerParams = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'MEDIA1' });
    if (url.includes('/media') && !url.includes('MEDIA1')) {
      containerParams = decodeURIComponent(body);
      return jsonRes({ id: 'CONTAINER1' });
    }
    if (url.includes('CONTAINER1')) return jsonRes({ status_code: 'FINISHED' });
    if (url.includes('MEDIA1')) return jsonRes({ permalink: 'https://instagram.com/reel/abc' });
    throw new Error('unexpected ' + url);
  });
  try {
    const r = await publishReel(env('tok-happy'), { videoUrl: 'https://x.test/clip.mp4', caption: 'watch this', mediaKey: 'studio/2026-08/clip.mp4' });
    assert.equal(r.ok, true);
    assert.equal(r.media_id, 'MEDIA1');
    assert.equal(r.permalink, 'https://instagram.com/reel/abc', 'read back as proof it is live');
    assert.match(containerParams, /media_type=REELS/);
    assert.match(containerParams, /video_url=https:\/\/x\.test\/clip\.mp4/);
    assert.ok(!/image_url=/.test(containerParams), 'a Reel must never be built with image_url');
  } finally { f.restore(); }
});

test('an optional cover_url is passed through when supplied', async () => {
  let containerParams = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M' });
    if (url.includes('/media')) { containerParams = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    return jsonRes({ status_code: 'FINISHED' });
  });
  try {
    await publishReel(env('tok-cover'), { videoUrl: 'https://x.test/clip.mp4', coverUrl: 'https://x.test/still.jpg' });
    assert.match(containerParams, /cover_url=https:\/\/x\.test\/still\.jpg/);
  } finally { f.restore(); }
});

// ---------- the poll: video takes far longer than an image, and must still bound out ----------

test('an unfinished video container is polled repeatedly, then gives up cleanly — never published on a guess', async () => {
  let polls = 0, published = false;
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) { published = true; return jsonRes({ id: 'X' }); }
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    polls++;
    return jsonRes({ status_code: 'IN_PROGRESS' });   // never finishes
  });
  try {
    const r = await publishReel(env('tok-stuck'), { videoUrl: 'https://x.test/clip.mp4' });
    assert.equal(r.ok, false);
    assert.equal(published, false, 'nothing may be posted while transcoding is unfinished');
    assert.match(r.error, /nothing was posted/);
    // Video gets a materially longer leash than an image (VIDEO_POLL_MAX vs POLL_MAX) — proof the
    // longer ceiling is actually in effect, not just declared.
    assert.ok(polls > 12, `expected more than the image ceiling of 12 polls, got ${polls}`);
  } finally { f.restore(); }
});

test('the poll is still BOUNDED — a container that truly never finishes does not hang forever', () => {
  // Structural pin: publishReel must call waitFinished with an explicit, finite ceiling, not the
  // image default and not Infinity.
  const fnStart = LIB.indexOf('export async function publishReel');
  const fnBody = LIB.slice(fnStart, LIB.indexOf('export async function publishStory'));
  assert.match(fnBody, /waitFinished\(env, base, creationId, VIDEO_POLL_MAX\)/);
});

test('an ERROR container fails fast with the reason, and never publishes', async () => {
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) throw new Error('must not publish');
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    return jsonRes({ status_code: 'ERROR', status: 'Video format not supported' });
  });
  try {
    const r = await publishReel(env('tok-err'), { videoUrl: 'https://x.test/clip.mp4' });
    assert.equal(r.ok, false);
    assert.match(r.error, /Video format not supported/);
  } finally { f.restore(); }
});

test('an EXPIRED container fails with the reason surfaced, not a bare status', async () => {
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) throw new Error('must not publish');
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    return jsonRes({ status_code: 'EXPIRED', status: 'Container expired after 24h' });
  });
  try {
    const r = await publishReel(env('tok-exp'), { videoUrl: 'https://x.test/clip.mp4' });
    assert.equal(r.ok, false);
    assert.match(r.error, /EXPIRED/);
    assert.match(r.error, /Container expired after 24h/);
  } finally { f.restore(); }
});

test('publishReel reuses the shared waitFinished helper rather than a second poll loop', () => {
  // The task's own instruction: "follow its shape rather than inventing a second one." Pin that
  // there is exactly one function named waitFinished in the module, and both publishImage and
  // publishReel call it.
  const waitFinishedDefs = (LIB.match(/function waitFinished/g) || []).length;
  assert.equal(waitFinishedDefs, 1, 'exactly one poll helper for every media type');
  assert.match(LIB, /export async function publishImage[\s\S]*?waitFinished\(env, base, creationId\)/);
  assert.match(LIB, /export async function publishReel[\s\S]*?waitFinished\(env, base, creationId, VIDEO_POLL_MAX\)/);
});
