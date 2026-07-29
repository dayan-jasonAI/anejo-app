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
const pollMs = (env) => { const n = Number(env && env.IG_POLL_MS); return Number.isFinite(n) && n >= 0 ? n : POLL_MS; };
export const JPEG_ONLY = /\.jpe?g$/i;

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
  let state = null;
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((res) => setTimeout(res, pollMs(env)));
    const st = await graph(env, `/${creationId}`, { params: { fields: 'status_code,status' } }, base);
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
