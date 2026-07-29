// GET/POST /api/hub/owner/social — draft, schedule and publish Instagram posts. Owner-only.
//
// Creative Studio already writes the caption and generates the plate image; this is the missing
// path from "generated" to "on the profile". Six posts on the account is what happens when that
// path is a human copying files.
import { json, bad, id, now, randToken } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { igConfigured, accountInfo, publishImage, JPEG_ONLY } from '../../../_lib/instagram.js';

// Instagram's own cap. Worth knowing locally so a scheduled batch cannot quietly burn it.
const DAILY_CAP = 25;

const publicUrlFor = (request, token) => `${new URL(request.url).origin}/api/social/media/${token}`;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let posts = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, platform, caption, media_key, status, scheduled_at, published_at, permalink, error, created_at FROM social_posts ORDER BY created_at DESC LIMIT 60'
    ).all();
    posts = (r && r.results) || [];
  } catch { posts = []; }

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

    // CLAIM IT FIRST. The publish flow takes ~20s (Instagram fetches the image, we poll), and a
    // second click — or the scheduler firing mid-click — would otherwise post the same photo twice.
    // The status guard in the UPDATE is the lock: only one caller can move it out of draft.
    const claim = await env.DB.prepare(
      "UPDATE social_posts SET status='publishing', error=NULL, updated_at=? WHERE id=? AND status IN ('draft','scheduled','failed')"
    ).bind(now(), postId).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) {
      return bad('That post is already being published.', 409);
    }

    const res = await publishImage(env, {
      imageUrl: publicUrlFor(request, post.public_token),
      caption: post.caption,
      mediaKey: post.media_key,
    });

    const t = now();
    if (!res.ok) {
      // Back to a retryable state with the reason attached — never left stuck in 'publishing',
      // which nothing would ever pick up again.
      await env.DB.prepare("UPDATE social_posts SET status='failed', error=?, ig_container_id=COALESCE(?,ig_container_id), updated_at=? WHERE id=?")
        .bind(String(res.error || 'Publish failed').slice(0, 300), res.container_id || null, t, postId).run();
      return bad(res.error || 'Could not publish to Instagram.', 502);
    }

    await env.DB.prepare(
      "UPDATE social_posts SET status='published', ig_container_id=?, ig_media_id=?, permalink=?, published_at=?, error=NULL, updated_at=? WHERE id=?"
    ).bind(res.container_id || null, res.media_id, res.permalink || null, res.published_at || t, t, postId).run();

    await capture(env, {
      event: 'social.post_published',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, has_permalink: !!res.permalink },
    });
    return json({ ok: true, id: postId, media_id: res.media_id, permalink: res.permalink });
  }

  return bad('Unknown action.');
};
