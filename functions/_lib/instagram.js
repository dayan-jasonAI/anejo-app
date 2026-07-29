// Instagram publishing via the Meta Graph API. Files under _lib are NOT routed.
//
// Posture matches twilio.js / geo.js / qbo.js: with no IG_ACCESS_TOKEN + IG_USER_ID this module
// NO-OPS and returns { ok:false, reason:'not_configured' }. Nothing else in the HUB changes.
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
import { now } from './hub.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
// Meta's fetch of our image is the slow part and it is not instant. Poll politely, and give up
// long before a Worker would be killed — a stuck container is retried, not waited on forever.
// Overridable so the test suite does not spend 24 real seconds proving that an unfinished
// container is never published. A slow suite is a suite people stop running.
const POLL_MS = 2000;
const POLL_MAX = 12;          // ~24s
const pollMs = (env) => { const n = Number(env && env.IG_POLL_MS); return Number.isFinite(n) && n >= 0 ? n : POLL_MS; };
export const JPEG_ONLY = /\.jpe?g$/i;

export function igConfigured(env) {
  return !!(env && env.IG_ACCESS_TOKEN && env.IG_USER_ID);
}

async function graph(env, path, { method = 'GET', params = {} } = {}) {
  const url = new URL(`${GRAPH}${path}`);
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

/** Who are we posting as? Also the cheapest way to prove a token still works. */
export async function accountInfo(env) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const r = await graph(env, `/${env.IG_USER_ID}`, { params: { fields: 'id,username,followers_count,media_count' } });
  if (!r.ok) return r;
  return { ok: true, ...(r.body || {}) };
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

  // 1) container
  const made = await graph(env, `/${env.IG_USER_ID}/media`, {
    method: 'POST',
    params: { image_url: imageUrl, ...(caption ? { caption: String(caption).slice(0, 2200) } : {}) },
  });
  if (!made.ok) return made;
  const creationId = made.body && made.body.id;
  if (!creationId) return { ok: false, error: 'Instagram did not return a media container.' };

  // 2) POLL. Publishing an unfinished container fails, and the wait is Instagram fetching our URL.
  let state = null;
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((res) => setTimeout(res, pollMs(env)));
    const st = await graph(env, `/${creationId}`, { params: { fields: 'status_code,status' } });
    if (!st.ok) return { ...st, container_id: creationId };
    state = (st.body && st.body.status_code) || null;
    if (state === 'FINISHED') break;
    if (state === 'ERROR' || state === 'EXPIRED') {
      return { ok: false, container_id: creationId, error: `Instagram could not process the image (${state}). ${(st.body && st.body.status) || ''}`.trim() };
    }
  }
  if (state !== 'FINISHED') {
    // Deliberately NOT published: a container that never finished is retried from scratch later
    // (they expire in 24h). Publishing on a guess is how the same photo goes up twice.
    return { ok: false, container_id: creationId, error: 'Instagram is still processing the image. It will be retried — nothing was posted.' };
  }

  // 3) publish
  const pub = await graph(env, `/${env.IG_USER_ID}/media_publish`, { method: 'POST', params: { creation_id: creationId } });
  if (!pub.ok) return { ...pub, container_id: creationId };
  const mediaId = pub.body && pub.body.id;
  if (!mediaId) return { ok: false, container_id: creationId, error: 'Instagram did not return a post id.' };

  // READ BACK. A 200 means Meta accepted the call, not that a post exists on the profile. The
  // permalink is the only proof, and it is what the owner actually wants to click.
  let permalink = null;
  const back = await graph(env, `/${mediaId}`, { params: { fields: 'permalink' } });
  if (back.ok) permalink = (back.body && back.body.permalink) || null;

  return { ok: true, container_id: creationId, media_id: mediaId, permalink, published_at: now() };
}
