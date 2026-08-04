// Stories: media_type=STORIES, the other half of the gap migrations/0080 closes.
//
// A Story is genuinely NOT a feed post with a shorter fuse — see the comment above publishStory in
// functions/_lib/instagram.js. This file pins the two things that make it different in code, not
// just in the comment: (1) there is no carousel path — one item, image OR video, never children —
// and (2) a photo Story and a video Story go through the SAME function, with `isVideo` choosing
// both the Graph API param name and which format check applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publishStory } from '../../functions/_lib/instagram.js';

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
  const r = await publishStory({}, { mediaUrl: 'https://x.test/a.jpg' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_configured');
});

test('no media URL is refused before any network call', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishStory(env('tok-none'), {});
    assert.equal(r.ok, false);
    assert.match(r.error, /No photo or video/);
  } finally { f.restore(); }
});

test('a video Story with a non-MP4/MOV key is refused before a container is spent', async () => {
  const f = stubFetch(() => { throw new Error('must not call Instagram'); });
  try {
    const r = await publishStory(env('tok-badvid'), { mediaUrl: 'https://x.test/a.png', mediaKey: 'studio/2026-08/a.png', isVideo: true });
    assert.equal(r.ok, false);
    assert.match(r.error, /MP4 or MOV/);
  } finally { f.restore(); }
});

test('a photo Story with a non-JPEG key is refused before a container is spent — same rule as feed', () => {
  return (async () => {
    const f = stubFetch(() => { throw new Error('must not call Instagram'); });
    try {
      const r = await publishStory(env('tok-badphoto'), { mediaUrl: 'https://x.test/a.png', mediaKey: 'studio/2026-08/a.png', isVideo: false });
      assert.equal(r.ok, false);
      assert.match(r.error, /only accepts JPEG/);
    } finally { f.restore(); }
  })();
});

// ---------- the container: media_type=STORIES, and image_url vs video_url picked by isVideo ----------

test('a photo Story sends image_url, never video_url', async () => {
  let params = null;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M' });
    if (url.includes('/media') && !url.includes('/M')) { params = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    if (url.includes('C1')) return jsonRes({ status_code: 'FINISHED' });
    return jsonRes({ permalink: null });   // Stories are not guaranteed a permalink — see below
  });
  try {
    const r = await publishStory(env('tok-photo'), { mediaUrl: 'https://x.test/a.jpg', mediaKey: 'studio/2026-08/a.jpg', isVideo: false });
    assert.equal(r.ok, true);
    assert.match(params, /media_type=STORIES/);
    assert.match(params, /image_url=https:\/\/x\.test\/a\.jpg/);
    assert.ok(!/video_url=/.test(params));
  } finally { f.restore(); }
});

test('a video Story sends video_url, never image_url, and gets the video poll ceiling', async () => {
  let params = null, polls = 0;
  const f = stubFetch(({ url, body }) => {
    if (url.includes('/media_publish')) return jsonRes({ id: 'M' });
    if (url.includes('/media') && !url.includes('/M')) { params = decodeURIComponent(body); return jsonRes({ id: 'C1' }); }
    polls++;
    return jsonRes({ status_code: 'IN_PROGRESS' });   // never finishes — proves the ceiling, doesn't need to succeed
  });
  try {
    const r = await publishStory(env('tok-vid'), { mediaUrl: 'https://x.test/clip.mp4', mediaKey: 'studio/2026-08/clip.mp4', isVideo: true });
    assert.equal(r.ok, false, 'never finishes in this stub — proving the ceiling, not the happy path');
    assert.match(params, /media_type=STORIES/);
    assert.match(params, /video_url=https:\/\/x\.test\/clip\.mp4/);
    assert.ok(!/image_url=/.test(params));
    assert.ok(polls > 12, `a video Story should get the longer video poll ceiling, got ${polls} polls`);
  } finally { f.restore(); }
});

test('a photo Story that never finishes gives up at the SHORT (image) ceiling, not the video one', async () => {
  let polls = 0;
  const f = stubFetch(({ url }) => {
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    polls++;
    return jsonRes({ status_code: 'IN_PROGRESS' });
  });
  try {
    const r = await publishStory(env('tok-photostuck'), { mediaUrl: 'https://x.test/a.jpg', mediaKey: 'a.jpg', isVideo: false });
    assert.equal(r.ok, false);
    assert.ok(polls <= 12, `a photo Story should use the image ceiling (~12), got ${polls} polls`);
  } finally { f.restore(); }
});

// ---------- no carousel, ever ----------

test('publishStory takes no items/children — there is no carousel path for a Story', () => {
  const fnStart = LIB.indexOf('export async function publishStory');
  const fnBody = LIB.slice(fnStart);
  assert.ok(!/children\s*:/.test(fnBody), 'a Story container must never be built with a children param');
  assert.ok(!/media_type:\s*'CAROUSEL'/.test(fnBody), 'a Story is never sent as a CAROUSEL media_type');
  assert.match(fnBody, /media_type: 'STORIES'/);
});

// ---------- ERROR handling, same rule as every other media type ----------

test('an ERROR container fails with the reason, and never publishes', async () => {
  const f = stubFetch(({ url }) => {
    if (url.includes('/media_publish')) throw new Error('must not publish');
    if (url.includes('/media')) return jsonRes({ id: 'C1' });
    return jsonRes({ status_code: 'ERROR', status: 'Media processing failed' });
  });
  try {
    const r = await publishStory(env('tok-err'), { mediaUrl: 'https://x.test/a.jpg', isVideo: false });
    assert.equal(r.ok, false);
    assert.match(r.error, /Media processing failed/);
  } finally { f.restore(); }
});

// ---------- honesty about what this module does NOT claim ----------

test('the module documents that Stories insights are not fetched here, and permalink is not guaranteed', () => {
  const fnStart = LIB.indexOf('export async function publishStory');
  const commentBlock = LIB.slice(LIB.lastIndexOf('// ---', fnStart), fnStart);
  assert.match(commentBlock, /NO CAROUSEL/);
  assert.match(commentBlock, /24-HOUR LIFE/);
  assert.match(commentBlock, /INSIGHTS DIFFER/);
});
