// GET/POST /api/hub/owner/social — draft, schedule and publish Instagram posts. Owner-only.
//
// Creative Studio already writes the caption and generates the plate image; this is the missing
// path from "generated" to "on the profile". Six posts on the account is what happens when that
// path is a human copying files.
import { json, bad, id, now, randToken } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { igConfigured, accountInfo, JPEG_ONLY, CAROUSEL_MAX } from '../../../_lib/instagram.js';
import { publishSocialPost, loadPostMedia } from '../../../_lib/social_publish.js';

// Instagram's own cap. Worth knowing locally so a scheduled batch cannot quietly burn it.
const DAILY_CAP = 25;


export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let posts = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, platform, caption, media_key, status, scheduled_at, published_at, permalink, error, image_brief, source, ig_media_id, audit_score, audit_flags, audit_at, created_at FROM social_posts ORDER BY created_at DESC LIMIT 60'
    ).all();
    posts = (r && r.results) || [];
  } catch { posts = []; }

  // Slides, per post, in order. One query for the page, grouped here — social_post_media is the
  // authority; the legacy media_key column is display-only history.
  try {
    const m = await env.DB.prepare(
      `SELECT id, post_id, seq, media_key FROM social_post_media
        WHERE post_id IN (SELECT id FROM social_posts ORDER BY created_at DESC LIMIT 60)
        ORDER BY seq, created_at`
    ).all();
    const bySlide = {};
    for (const row of (m && m.results) || []) (bySlide[row.post_id] = bySlide[row.post_id] || []).push({ id: row.id, seq: row.seq, media_key: row.media_key });
    for (const post of posts) post.media = bySlide[post.id] || [];
  } catch { for (const post of posts) post.media = []; }

  // Latest performance snapshot per media id, attached to our published posts. NULL until the
  // daily sweep has run — the page says "no data yet", never fake zeros.
  try {
    const mr = await env.DB.prepare(
      `SELECT media_id, likes, comments, reach, saved, capture_date FROM ig_media_metrics
        WHERE capture_date = (SELECT MAX(capture_date) FROM ig_media_metrics)`
    ).all();
    const byMedia = {};
    for (const row of (mr && mr.results) || []) byMedia[row.media_id] = row;
    for (const post of posts) if (post.ig_media_id && byMedia[post.ig_media_id]) post.metrics = byMedia[post.ig_media_id];
  } catch { /* metrics are additive; the page works without them */ }

  let publishedToday = 0;
  try {
    const since = now() - 24 * 3600 * 1000;
    const r = await env.DB.prepare("SELECT COUNT(*) n FROM social_posts WHERE status='published' AND published_at >= ?").bind(since).first();
    publishedToday = (r && r.n) || 0;
  } catch { publishedToday = 0; }

  // Say WHICH of the three states this is in — they need three different actions: add credentials,
  // fix a broken token, or nothing.
  const configured = igConfigured(env);
  const account = configured ? await accountInfo(env) : null;

  return json({
    ok: true,
    configured,
    connected: !!(account && account.ok),
    account: account && account.ok ? { username: account.username, followers: account.followers_count, media_count: account.media_count } : null,
    account_error: account && !account.ok ? account.error : null,
    daily_cap: DAILY_CAP,
    published_24h: publishedToday,
    remaining_today: Math.max(0, DAILY_CAP - publishedToday),
    setup: configured ? null : 'Set IG_ACCESS_TOKEN (a Cloudflare Pages secret) from a Meta Business app — Instagram → API setup with Instagram business login → Generate token. IG_USER_ID is only needed on the older Facebook Login path.',
    // Which of the two Instagram APIs the token turned out to belong to. Worth surfacing: it
    // decides where the token gets renewed in 60 days.
    host: account && account.ok ? account.host : null,
    posts,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';

  // Stage a post from a Studio image + caption. Nothing leaves the building yet.
  if (op === 'draft') {
    const mediaKey = String(b.media_key || '').trim();
    const caption = String(b.caption || '').trim().slice(0, 2200);
    if (!mediaKey) return bad('Pick an image first.');
    if (mediaKey.includes('..')) return bad('Invalid image.');
    // Refuse here rather than at publish time: telling someone their post failed 20 seconds after
    // they hit publish, for a reason knowable now, is a worse experience than refusing the draft.
    if (!JPEG_ONLY.test(mediaKey)) return bad('Instagram only accepts JPEG images. Re-export this one as .jpg.');

    const postId = id('sp');
    const t = now();
    const scheduledAt = Number(b.scheduled_at) > 0 ? Math.floor(Number(b.scheduled_at)) : null;
    try {
      await env.DB.prepare(
        `INSERT INTO social_posts (id, platform, caption, media_key, public_token, status, scheduled_at, created_by, created_at, updated_at)
         VALUES (?,'instagram',?,?,?,?,?,?,?,?)`
      ).bind(postId, caption || null, mediaKey, randToken(24), scheduledAt ? 'scheduled' : 'draft', scheduledAt, ctx.distinct_id || null, t, t).run();
      // The slide row is what publishing actually reads; the legacy column above is write-through
      // for the deploy window only.
      await env.DB.prepare(
        `INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,0,?,?,?)`
      ).bind(id('spm'), postId, mediaKey, randToken(24), t).run();
    } catch (e) {
      return bad('Could not save the post. ' + String((e && e.message) || '').slice(0, 120), 500);
    }
    await capture(env, {
      event: 'social.post_drafted',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { scheduled: !!scheduledAt, has_caption: !!caption },
    });
    return json({ ok: true, id: postId, status: scheduledAt ? 'scheduled' : 'draft' });
  }

  // Edit the words before approving them. An approval step you cannot correct is not an approval
  // step — it is a yes/no on someone else's draft, and the first planner run produced a caption
  // that invented an ordering deadline. Fixing one line has to be cheaper than deleting and
  // re-running.
  if (op === 'edit') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    // A published caption lives on Instagram; changing our copy would make the record disagree
    // with what people actually read.
    if (row.status === 'published') return bad('That is already live — edit the caption in the Instagram app.', 409);
    const caption = String(b.caption == null ? '' : b.caption).slice(0, 2200);
    await env.DB.prepare('UPDATE social_posts SET caption=?, updated_at=? WHERE id=?').bind(caption, now(), postId).run();
    return json({ ok: true, id: postId });
  }

  // Attach an image to a planned post.
  if (op === 'attach') {
    const postId = String(b.id || '').trim();
    const mediaKey = String(b.media_key || '').trim();
    if (!postId) return bad('Missing id.');
    if (!mediaKey) return bad('Pick an image first.');
    if (mediaKey.includes('..')) return bad('Invalid image.');
    if (!JPEG_ONLY.test(mediaKey)) return bad('Instagram only accepts JPEG images. Re-export this one as .jpg.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That one is already live.', 409);
    if (row.status === 'publishing') return bad('That post is being published right now.', 409);
    const existing = await loadPostMedia(env, postId);
    // Meta's carousel ceiling. Refused at attach — the moment the 11th photo is picked — rather
    // than 20 seconds into a publish that was always going to fail.
    if (existing.length >= CAROUSEL_MAX) return bad(`Instagram allows at most ${CAROUSEL_MAX} photos in one post.`, 409);
    const t2 = now();
    await env.DB.prepare(
      `INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,?,?,?,?)`
    ).bind(id('spm'), postId, existing.length, mediaKey, randToken(24), t2).run();
    await env.DB.prepare('UPDATE social_posts SET updated_at=? WHERE id=?').bind(t2, postId).run();
    return json({ ok: true, id: postId, media_key: mediaKey, slides: existing.length + 1 });
  }

  // Remove one slide. Reversible curation, so no confirm theatre — but never on a live post,
  // whose slides are a public record of what went out.
  if (op === 'detach') {
    const postId = String(b.id || '').trim();
    const slideId = String(b.media_id || '').trim();
    if (!postId || !slideId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published' || row.status === 'publishing') return bad('That post is already on its way out.', 409);
    const r = await env.DB.prepare('DELETE FROM social_post_media WHERE id=? AND post_id=?').bind(slideId, postId).run();
    if (!r.meta || r.meta.changes !== 1) return bad('That photo is not on this post.', 404);
    // Reseal the order so seq stays 0..n-1 — slide order is editorial data, not an accident.
    const left = await loadPostMedia(env, postId);
    for (let i = 0; i < left.length; i++) {
      if (left[i].seq !== i) await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=?').bind(i, left[i].id).run();
    }
    return json({ ok: true, id: postId, slides: left.length });
  }

  // Reorder slides: the array IS the new order. Ignores ids that are not on the post rather than
  // failing the whole reorder over a stale page.
  if (op === 'reorder') {
    const postId = String(b.id || '').trim();
    const order = Array.isArray(b.media_ids) ? b.media_ids.map(String) : [];
    if (!postId || !order.length) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published' || row.status === 'publishing') return bad('That post is already on its way out.', 409);
    const existing = await loadPostMedia(env, postId);
    const mine = new Set(existing.map((m) => m.id));
    let seq = 0;
    for (const mid of order) {
      if (!mine.has(mid)) continue;
      await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=? AND post_id=?').bind(seq++, mid, postId).run();
    }
    return json({ ok: true, id: postId });
  }

  // Build the real containers at Meta and STOP — nothing reaches the profile. How a carousel is
  // verified live before anyone trusts it with a real post.
  if (op === 'dry_run') {
    if (!igConfigured(env)) return bad('Instagram is not set up yet.', 400);
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const post = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!post) return bad('That post no longer exists.', 404);
    // Deliberately NO claim: a dry run must not move the post's status, and the shared path
    // writes nothing in dry mode.
    const res = await publishSocialPost(env, request, post, { publish: false });
    return res.ok ? json({ ok: true, dry_run: true, container_id: res.container_id, slides: (res.children || []).length }) : bad(res.error || 'Dry run failed.', 502);
  }

  // Approve a draft onto the schedule. THIS is the human gate: the planner writes, a person says
  // yes, and only then does the tick have anything to publish.
  if (op === 'schedule') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status !== 'draft' && row.status !== 'scheduled' && row.status !== 'failed') {
      return bad('That post is already on its way out.', 409);
    }
    // A post with no picture cannot go on the schedule, or the tick would have to decide what to
    // do about it at 11am on a Tuesday — and the only honest answer then is "nothing".
    if (!(await loadPostMedia(env, postId)).length) return bad('Add a photo before scheduling it.', 409);
    const when = Number(b.scheduled_at);
    if (!Number.isFinite(when) || when <= 0) return bad('Pick a date and time.');
    if (when < now() - 60000) return bad('That time has already passed.');
    await env.DB.prepare("UPDATE social_posts SET status='scheduled', scheduled_at=?, error=NULL, updated_at=? WHERE id=?")
      .bind(when, now(), postId).run();
    await capture(env, {
      event: 'social.post_scheduled',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, lead_minutes: Math.round((when - now()) / 60000) },
    });
    return json({ ok: true, id: postId, status: 'scheduled', scheduled_at: when });
  }

  if (op === 'unschedule') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const r = await env.DB.prepare("UPDATE social_posts SET status='draft', scheduled_at=NULL, updated_at=? WHERE id=? AND status='scheduled'")
      .bind(now(), postId).run();
    if (!r.meta || r.meta.changes !== 1) return bad('That post is not scheduled.', 409);
    return json({ ok: true, id: postId, status: 'draft' });
  }

  if (op === 'delete') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    // A published post is a real thing on a real profile — deleting our row would just lose the
    // record of it while the post stays up. Refuse and say so.
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That is already live on Instagram — delete it in the app, not here.', 409);
    await env.DB.prepare('DELETE FROM social_posts WHERE id=?').bind(postId).run();
    return json({ ok: true, deleted: postId });
  }

  if (op === 'publish') {
    if (!igConfigured(env)) return bad('Instagram is not set up yet — add IG_ACCESS_TOKEN and IG_USER_ID first.', 400);
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');

    const post = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!post) return bad('That post no longer exists.', 404);
    if (post.status === 'published') return json({ ok: true, already: true, permalink: post.permalink, media_id: post.ig_media_id });
    // A planned post has its words and its timing but no picture yet. Refuse clearly rather than
    // letting Instagram fetch a 404 and reporting that back as a publish failure.


    // CLAIM IT FIRST. The publish flow takes ~20s (Instagram fetches the image, we poll), and a
    // second click — or the scheduler firing mid-click — would otherwise post the same photo twice.
    // The status guard in the UPDATE is the lock: only one caller can move it out of draft.
    const claim = await env.DB.prepare(
      "UPDATE social_posts SET status='publishing', error=NULL, updated_at=? WHERE id=? AND status IN ('draft','scheduled','failed')"
    ).bind(now(), postId).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) {
      return bad('That post is already being published.', 409);
    }

    // Single image or carousel — decided inside the ONE shared path the tick also uses, which
    // writes the outcome rows itself so a failure can never strand the post in 'publishing'.
    const res = await publishSocialPost(env, request, post);
    if (!res.ok) return bad(res.error || 'Could not publish to Instagram.', 502);

    await capture(env, {
      event: 'social.post_published',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, has_permalink: !!res.permalink },
    });
    return json({ ok: true, id: postId, media_id: res.media_id, permalink: res.permalink });
  }

  return bad('Unknown action.');
};
