// Instagram publishing via the Meta Graph API. Files under _lib are NOT routed.
//
// Posture matches twilio.js / geo.js / qbo.js: with no IG_ACCESS_TOKEN this module NO-OPS and
// returns { ok:false, reason:'not_configured' }. Nothing else in the HUB changes.
//
// THE FLOW IS NOT TWO STEPS, IT IS THREE — and the middle one is easy to miss:
//   1. POST /{ig-user-id}/media          → a CONTAINER (creation_id). Instagram now goes and
//                                          FETCHES our image_url on its own schedule.
//   2. GET  /{container-id}?fields=status_code → POLL until FINISHED. Publishing an IN_PROGRESS
//                                          container fails, and how long the fetch takes is not
//                                          ours to control — it depends on Instagram reaching our
//                                          server and the image size.
//   3. POST /{ig-user-id}/media_publish  → the actual post.
//
// Instagram's own constraints that bite in practice:
//   · JPEG ONLY. No PNG, no WebP, no GIF — checked before we waste a container on it.
//   · Aspect ratio between 4:5 and 1.91:1.
//   · A container EXPIRES after 24 hours, so a stalled post is retried from step 1, never resumed.
// THERE ARE TWO INSTAGRAM APIS AND THEIR TOKENS ARE NOT INTERCHANGEABLE:
//   · "Instagram API with Instagram Login" → graph.instagram.com — no Facebook Page, two
//     permissions, and a 60-day token generated straight from the App Dashboard.
//   · "Instagram API with Facebook Login"  → graph.facebook.com  — the professional account must
//     be connected to a Page, and the token is a PAGE token with four permissions.
// Nothing in the token says which one it is. Rather than make the owner commit to a path at setup
// time and discover the mismatch later, we PROBE both once and remember — because a token used
// against the wrong host fails with "Invalid OAuth 2.0 Access Token", which is indistinguishable
// from an expired token and would send them off renewing a token that was never the problem.
import { now } from './hub.js';

const HOSTS = {
  instagram: 'https://graph.instagram.com/v23.0',
  facebook: 'https://graph.facebook.com/v23.0',
};
const hostLabel = (base) => (String(base).includes('graph.instagram.com') ? 'instagram_login' : 'facebook_login');
// Meta's fetch of our image is the slow part and it is not instant. Poll politely, and give up
// long before a Worker would be killed — a stuck container is retried, not waited on forever.
// Overridable so the test suite does not spend 24 real seconds proving that an unfinished
// container is never published. A slow suite is a suite people stop running.
const POLL_MS = 2000;
const POLL_MAX = 12;          // ~24s
// Video containers go through actual transcoding at Meta, not just a fetch — a Reel or a Story
// video routinely takes tens of seconds where a JPEG takes two or three polls. Same helper, same
// cadence, just a longer leash before giving up. Still finite: a container that never finishes
// fails cleanly at this ceiling rather than hanging the tick indefinitely.
const VIDEO_POLL_MAX = 90;    // ~180s at the default cadence — headroom over observed Reels processing, not unbounded
const pollMs = (env) => { const n = Number(env && env.IG_POLL_MS); return Number.isFinite(n) && n >= 0 ? n : POLL_MS; };
export const JPEG_ONLY = /\.jpe?g$/i;
// Instagram's video containers (Reels and video Stories) accept MP4 or MOV only.
export const VIDEO_ONLY = /\.(mp4|mov)$/i;

// IG_USER_ID is NOT required on the Instagram Login path — /me tells us who we are, and making the
// owner run a curl to find a 17-digit number is a step that exists only to be got wrong.
export function igConfigured(env) {
  return !!(env && env.IG_ACCESS_TOKEN);
}

async function graph(env, path, { method = 'GET', params = {} } = {}, base = HOSTS.facebook) {
  const url = new URL(`${base}${path}`);
  const body = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN });
  let r;
  try {
    r = method === 'GET'
      ? await fetch(`${url.toString()}?${body.toString()}`)
      : await fetch(url.toString(), { method, body });
  } catch (e) {
    return { ok: false, error: 'Could not reach Instagram. ' + String((e && e.message) || '').slice(0, 120) };
  }
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* Meta returns HTML on some failures */ }
  if (!r.ok || (j && j.error)) {
    // Meta nests the useful part. "400 Bad Request" alone tells the owner nothing about whether
    // the token expired, the image was rejected, or they hit the daily limit.
    const e = (j && j.error) || {};
    const detail = [e.message, e.error_user_msg].filter(Boolean).join(' — ') || text.slice(0, 160);
    return { ok: false, error: detail, code: e.code || r.status, subcode: e.error_subcode || null };
  }
  return { ok: true, body: j };
}

// Detection is memoized: a token does not change hosts, and probing on every page load would
// double the API calls for an answer that is fixed.
const targetMemo = new Map();

function forcedBase(env) {
  const h = String((env && env.IG_API_HOST) || '').trim().toLowerCase();
  if (h === 'instagram' || h === 'facebook') return HOSTS[h];
  if (h.startsWith('https://')) return h.replace(/\/+$/, '');
  return null;
}

/**
 * Ask one host who we are. The two APIs disagree on both the path and the name of the id:
 * Instagram Login answers /me and calls it `user_id`; Facebook Login answers /{ig-user-id}
 * and calls it `id`.
 */
async function selfInfo(env, base) {
  const isIg = hostLabel(base) === 'instagram_login';
  if (!isIg && !env.IG_USER_ID) {
    return { ok: false, error: 'The Facebook Login path needs IG_USER_ID as well as the token.' };
  }
  const fields = `${isIg ? 'user_id' : 'id'},username,followers_count,media_count`;
  const r = await graph(env, isIg ? '/me' : `/${env.IG_USER_ID}`, { params: { fields } }, base);
  if (!r.ok) return r;
  const b = r.body || {};
  return {
    ok: true,
    base,
    id: String(b.user_id || b.id || env.IG_USER_ID || ''),
    username: b.username || null,
    followers_count: b.followers_count ?? null,
    media_count: b.media_count ?? null,
  };
}

/** Which API does this token belong to, and what account id do we post to? */
export async function resolveTarget(env) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const key = `${env.IG_ACCESS_TOKEN}|${env.IG_USER_ID || ''}|${env.IG_API_HOST || ''}`;
  if (targetMemo.has(key)) return targetMemo.get(key);

  const forced = forcedBase(env);
  // Fully explicit config needs no discovery — and no network call to find out what we were told.
  if (forced && env.IG_USER_ID) {
    const t = { ok: true, base: forced, id: String(env.IG_USER_ID) };
    targetMemo.set(key, t);
    return t;
  }

  // Instagram Login first: it is the path we recommend, so it is the one most likely to hit.
  const bases = forced ? [forced] : [HOSTS.instagram, HOSTS.facebook];
  let last = null;
  for (const base of bases) {
    const r = await selfInfo(env, base);
    if (r.ok) { targetMemo.set(key, r); return r; }
    last = r;
  }
  return last || { ok: false, error: 'Instagram did not accept the token.' };
}

/** Who are we posting as? Also the cheapest way to prove a token still works. */
export async function accountInfo(env) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const t = await resolveTarget(env);
  if (!t.ok) return t;
  // A forced-config target is a claim, not an observation — go and confirm it.
  const info = t.username ? t : await selfInfo(env, t.base);
  if (!info.ok) return info;
  return { ok: true, id: info.id, username: info.username, followers_count: info.followers_count, media_count: info.media_count, host: hostLabel(t.base) };
}

/**
 * Poll a container until FINISHED. One definition of "ready to publish", shared by the single
 * image, every carousel child and parent, and now video (Reels/Stories) — two poll loops would
 * eventually disagree about what counts as finished, and the one that guessed is the one that
 * double-posts. `maxAttempts` is the only thing a caller may vary — video needs a longer ceiling
 * (VIDEO_POLL_MAX above) than an image, but the definition of FINISHED/ERROR/EXPIRED, and what
 * happens on each, is identical for every media type.
 */
async function waitFinished(env, base, containerId, maxAttempts = POLL_MAX) {
  let state = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((res) => setTimeout(res, pollMs(env)));
    const st = await graph(env, `/${containerId}`, { params: { fields: 'status_code,status' } }, base);
    if (!st.ok) return st;
    state = (st.body && st.body.status_code) || null;
    if (state === 'FINISHED') return { ok: true };
    if (state === 'ERROR' || state === 'EXPIRED') {
      return { ok: false, error: `Instagram could not process the image (${state}). ${(st.body && st.body.status) || ''}`.trim() };
    }
  }
  // Deliberately NOT published: a container that never finished is retried from scratch later
  // (they expire in 24h). Publishing on a guess is how the same photo goes up twice.
  return { ok: false, error: 'Instagram is still processing the image. It will be retried — nothing was posted.' };
}

// Meta's own bounds for a carousel. Enforced here as well as at attach time, because this module
// must hold even if a future caller forgets the UI-side check.
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

/**
 * Publish a CAROUSEL: 2-10 images as one post.
 *
 * The flow is the single-image flow one level deeper, and the same rule governs every level:
 * NOTHING IS PUBLISHED ON A GUESS. Every child container is polled to FINISHED before the parent
 * is even created — a parent built over an unfinished child fails at Meta — and the parent is
 * polled to FINISHED before media_publish. If child 3 of 5 fails, the whole post fails and is
 * retried from scratch: a truncated carousel is a WRONG post on a public profile, not a partial
 * success. Abandoned containers cost nothing and expire in 24h.
 *
 * `opts.publish=false` (dry run) stops after the parent container is FINISHED: every real Meta
 * step exercised, nothing on the profile. It exists so the first carousel can be verified live
 * without posting.
 */
export async function publishCarousel(env, { items, caption } = {}, opts = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const list = Array.isArray(items) ? items : [];
  if (list.length < CAROUSEL_MIN || list.length > CAROUSEL_MAX) {
    return { ok: false, error: `A carousel is ${CAROUSEL_MIN}-${CAROUSEL_MAX} photos — this post has ${list.length}.` };
  }
  for (const it of list) {
    if (!it || !it.imageUrl) return { ok: false, error: 'A slide is missing its image.' };
    if (it.mediaKey && !JPEG_ONLY.test(it.mediaKey)) {
      return { ok: false, error: 'Instagram only accepts JPEG images. Re-export the non-JPEG slide as .jpg.' };
    }
  }

  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  // 1) children, IN ORDER — slide order is the order of creation ids handed to the parent.
  const childIds = [];
  for (const it of list) {
    const made = await graph(env, `/${igId}/media`, {
      method: 'POST',
      params: { image_url: it.imageUrl, is_carousel_item: 'true' },
    }, base);
    if (!made.ok) return { ...made, children: childIds };
    const cid = made.body && made.body.id;
    if (!cid) return { ok: false, error: 'Instagram did not return a container for a slide.', children: childIds };
    childIds.push(cid);
  }

  // 2) EVERY child must finish before the parent exists at all.
  for (const cid of childIds) {
    const done = await waitFinished(env, base, cid);
    if (!done.ok) return { ...done, children: childIds };
  }

  // 3) the parent carousel container
  const parent = await graph(env, `/${igId}/media`, {
    method: 'POST',
    params: {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      ...(caption ? { caption: String(caption).slice(0, 2200) } : {}),
    },
  }, base);
  if (!parent.ok) return { ...parent, children: childIds };
  const parentId = parent.body && parent.body.id;
  if (!parentId) return { ok: false, error: 'Instagram did not return the carousel container.', children: childIds };

  const parentDone = await waitFinished(env, base, parentId);
  if (!parentDone.ok) return { ...parentDone, container_id: parentId, children: childIds };

  if (opts.publish === false) {
    return { ok: true, dry_run: true, container_id: parentId, children: childIds };
  }

  // 4) publish, and read the permalink BACK — a 200 means Meta accepted the call, not that a
  // post exists on the profile.
  const pub = await graph(env, `/${igId}/media_publish`, { method: 'POST', params: { creation_id: parentId } }, base);
  if (!pub.ok) return { ...pub, container_id: parentId };
  const mediaId = pub.body && pub.body.id;
  if (!mediaId) return { ok: false, container_id: parentId, error: 'Instagram did not return a post id.' };

  let permalink = null;
  const back = await graph(env, `/${mediaId}`, { params: { fields: 'permalink' } }, base);
  if (back.ok) permalink = (back.body && back.body.permalink) || null;

  return { ok: true, container_id: parentId, media_id: mediaId, permalink, published_at: now() };
}

/**
 * Publish one post. `imageUrl` must be PUBLICLY reachable — Instagram fetches it itself, with no
 * credentials, so anything behind our HUB auth is invisible to it.
 *
 * Returns { ok, media_id, permalink } or { ok:false, error }. Never throws.
 */
export async function publishImage(env, { imageUrl, caption, mediaKey } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!imageUrl) return { ok: false, error: 'No image to publish.' };

  // Refuse a format Instagram will reject, BEFORE spending a container on it. The R2 bucket
  // accepts png/webp for other purposes, so this really can happen.
  if (mediaKey && !JPEG_ONLY.test(mediaKey)) {
    return { ok: false, error: 'Instagram only accepts JPEG images. Re-export this one as .jpg and try again.' };
  }

  // Which API this token belongs to, and the account id to post to. Both are needed before the
  // first call, and both are memoized after the first publish.
  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  // 1) container
  const made = await graph(env, `/${igId}/media`, {
    method: 'POST',
    params: { image_url: imageUrl, ...(caption ? { caption: String(caption).slice(0, 2200) } : {}) },
  }, base);
  if (!made.ok) return made;
  const creationId = made.body && made.body.id;
  if (!creationId) return { ok: false, error: 'Instagram did not return a media container.' };

  // 2) POLL. Publishing an unfinished container fails, and the wait is Instagram fetching our URL.
  const done = await waitFinished(env, base, creationId);
  if (!done.ok) return { ...done, container_id: creationId };

  // 3) publish
  const pub = await graph(env, `/${igId}/media_publish`, { method: 'POST', params: { creation_id: creationId } }, base);
  if (!pub.ok) return { ...pub, container_id: creationId };
  const mediaId = pub.body && pub.body.id;
  if (!mediaId) return { ok: false, container_id: creationId, error: 'Instagram did not return a post id.' };

  // READ BACK. A 200 means Meta accepted the call, not that a post exists on the profile. The
  // permalink is the only proof, and it is what the owner actually wants to click.
  let permalink = null;
  const back = await graph(env, `/${mediaId}`, { params: { fields: 'permalink' } }, base);
  if (back.ok) permalink = (back.body && back.body.permalink) || null;

  return { ok: true, container_id: creationId, media_id: mediaId, permalink, published_at: now() };
}

// ---------------------------------------------------------------------------
// REELS
//
// Shape lifted from the same three-step contract documented at the top of this file, with the
// media_type parameter that was the whole missing piece: Meta's Content Publishing API treats a
// Reel as a container like any other, just declared with media_type=REELS and video_url instead of
// image_url. See https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reels-publishing
// (as of the 2026 API version this file already pins — graph.instagram.com/v23.0 or
// graph.facebook.com/v23.0, see HOSTS above).
//
// Meta's own bounds worth knowing, honestly — not all enforced here, because this app has no way
// to inspect a video file's actual duration/dimensions before handing Instagram a URL, and a wrong
// guess here is worse than letting Meta's own validation (surfaced through the ERROR status in
// waitFinished) be the source of truth:
//   · length: roughly 3 seconds to 15 minutes (specific ceiling has moved over API versions)
//   · aspect ratio: 9:16 (vertical) is what actually gets recommended placement; anything from
//     0.01:1 to 10:1 is technically accepted but cropped/letterboxed unpredictably outside 9:16
//   · format: MP4 or MOV — checked here, before a container is spent, same as JPEG for images
export async function publishReel(env, { videoUrl, caption, mediaKey, coverUrl } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!videoUrl) return { ok: false, error: 'No video to publish.' };

  if (mediaKey && !VIDEO_ONLY.test(mediaKey)) {
    return { ok: false, error: 'Instagram Reels only accept MP4 or MOV video. Re-export this one and try again.' };
  }

  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  // 1) container — media_type=REELS is the one literal this whole feature was missing.
  const made = await graph(env, `/${igId}/media`, {
    method: 'POST',
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      ...(caption ? { caption: String(caption).slice(0, 2200) } : {}),
      ...(coverUrl ? { cover_url: coverUrl } : {}),   // optional still-frame thumbnail; Meta picks one if omitted
    },
  }, base);
  if (!made.ok) return made;
  const creationId = made.body && made.body.id;
  if (!creationId) return { ok: false, error: 'Instagram did not return a media container.' };

  // 2) POLL — video is transcoded server-side, so this genuinely takes longer than an image fetch.
  // waitFinished already treats ERROR/EXPIRED as an explicit failure with Meta's reason attached
  // and gives up (never hangs) past maxAttempts; VIDEO_POLL_MAX just gives that same logic more
  // time before it does.
  const done = await waitFinished(env, base, creationId, VIDEO_POLL_MAX);
  if (!done.ok) return { ...done, container_id: creationId };

  // 3) publish
  const pub = await graph(env, `/${igId}/media_publish`, { method: 'POST', params: { creation_id: creationId } }, base);
  if (!pub.ok) return { ...pub, container_id: creationId };
  const mediaId = pub.body && pub.body.id;
  if (!mediaId) return { ok: false, container_id: creationId, error: 'Instagram did not return a post id.' };

  let permalink = null;
  const back = await graph(env, `/${mediaId}`, { params: { fields: 'permalink' } }, base);
  if (back.ok) permalink = (back.body && back.body.permalink) || null;

  return { ok: true, container_id: creationId, media_id: mediaId, permalink, published_at: now() };
}

// ---------------------------------------------------------------------------
// STORIES
//
// Same container → poll → publish shape again, this time with media_type=STORIES. Told honestly,
// because the next person to touch this needs to know a Story is not "a feed post with a shorter
// fuse" — it is a genuinely different object on Meta's side:
//   · NO CAROUSEL. A Story container takes exactly one image_url OR one video_url. There is no
//     children/CAROUSEL equivalent for Stories at all — this function does not accept a list.
//   · 24-HOUR LIFE. The post disappears from the profile on its own; `permalink` (when Meta returns
//     one at all) and `ig_media_id` age into pointing at nothing. Nothing in this app currently
//     tries to detect or record that expiry — a published Story row just goes quiet.
//   · INSIGHTS DIFFER. Feed posts report reach/likes/comments/saves (see ig_media_metrics, filled
//     by _lib/instagram_insights.js — a file this task does not touch). Stories report an
//     impressions-based set (impressions, taps_forward, taps_back, exits, replies) through a
//     different metrics endpoint. This module does not fetch Story insights; publishing one here
//     does not give the HUB parity with the feed-post metrics row it already shows.
//   · Both a photo and a video Story go through this ONE function — `isVideo` picks the param name
//     and the format check (JPEG vs MP4/MOV), everything else about the flow is identical.
export async function publishStory(env, { mediaUrl, mediaKey, isVideo } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!mediaUrl) return { ok: false, error: 'No photo or video to publish.' };

  if (isVideo) {
    if (mediaKey && !VIDEO_ONLY.test(mediaKey)) {
      return { ok: false, error: 'Instagram Stories video must be MP4 or MOV. Re-export this one and try again.' };
    }
  } else if (mediaKey && !JPEG_ONLY.test(mediaKey)) {
    return { ok: false, error: 'Instagram only accepts JPEG images. Re-export this one as .jpg and try again.' };
  }

  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  // 1) container — STORIES, never CAROUSEL: one item, image_url or video_url, never both.
  const made = await graph(env, `/${igId}/media`, {
    method: 'POST',
    params: { media_type: 'STORIES', ...(isVideo ? { video_url: mediaUrl } : { image_url: mediaUrl }) },
  }, base);
  if (!made.ok) return made;
  const creationId = made.body && made.body.id;
  if (!creationId) return { ok: false, error: 'Instagram did not return a media container.' };

  // 2) POLL — a video Story processes like any other video; a photo Story is as fast as a feed
  // image. Bound accordingly rather than making every Story wait out the video ceiling.
  const done = await waitFinished(env, base, creationId, isVideo ? VIDEO_POLL_MAX : POLL_MAX);
  if (!done.ok) return { ...done, container_id: creationId };

  // 3) publish
  const pub = await graph(env, `/${igId}/media_publish`, { method: 'POST', params: { creation_id: creationId } }, base);
  if (!pub.ok) return { ...pub, container_id: creationId };
  const mediaId = pub.body && pub.body.id;
  if (!mediaId) return { ok: false, container_id: creationId, error: 'Instagram did not return a post id.' };

  // Stories are not guaranteed to return a usable permalink the way a feed post does — read-back is
  // still attempted (same honesty principle as every other publish path: a 200 from media_publish
  // means Meta accepted the call, not that anything is confirmed live), but `permalink: null` here
  // is an EXPECTED outcome for a Story, not a sign something went wrong.
  let permalink = null;
  const back = await graph(env, `/${mediaId}`, { params: { fields: 'permalink' } }, base);
  if (back.ok) permalink = (back.body && back.body.permalink) || null;

  return { ok: true, container_id: creationId, media_id: mediaId, permalink, published_at: now() };
}
