// POST /api/hub/admin/social-tick — publish social posts whose scheduled time has arrived.
// Auth: owner session OR the X-Cron-Key header, same as every other tick.
//
// This is the half of the publishing path that was missing. social_posts.scheduled_at has existed
// since the feature shipped and NOTHING ever read it — a post marked "scheduled" sat there
// forever, which is worse than not offering to schedule at all.
//
// Everything dangerous here is already solved in functions/api/hub/owner/social.js and is reused
// rather than reimplemented:
//   · the CLAIM (status='publishing' guarded on the previous status) is what stops a tick
//     overlapping a click and putting the same photo up twice
//   · the shared publish path polls every container until FINISHED and never publishes on a guess
//
// What is specific to running unattended:
//   · LATE IS NOT DUE. A post written for a 9 AM breakfast slot that fires at 4 PM because the
//     scheduler was down is not "late", it is wrong — and it is on a public profile where the
//     mistake is visible to everyone and has to be deleted by hand. Past the grace window it goes
//     back to DRAFT with the reason recorded.
//   · ONE AT A TIME. Instagram's flow takes ~20s per post; a backlog is worked one per tick
//     rather than in a burst that would look like a bot and burn the daily cap.
import { json, bad, now, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { igConfigured } from '../../../_lib/instagram.js';
import { publishSocialPost } from '../../../_lib/social_publish.js';
import { capture } from '../../../_lib/track.js';

// A social post is tied to a moment — a lunch window, a drop, a weekend. Two hours late is a
// different post. Same threshold as campaigns, for the same reason.
const GRACE_MS = 2 * 60 * 60 * 1000;
const PER_TICK = 1;


export const onRequestPost = async ({ request, env }) => {
  const cronKey = request.headers.get('x-cron-key') || '';
  const viaCron = !!(env.CRON_KEY && ctEq(cronKey, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);

  // Not configured is not an error — it is the normal state before the Meta token exists. Say so
  // and stop, rather than marking every due post as failed once a minute.
  if (!igConfigured(env)) return json({ ok: true, skipped: 'instagram_not_configured', published: [], missed: [] });

  const t = now();
  const published = [], missed = [], failed = [];

  let due = [];
  try {
    const r = await env.DB.prepare(
      // EXISTS a slide: a planner draft has a caption and a time but no picture yet. Instagram
      // will not accept a post without an image, so those must never be claimed here — they would
      // burn through 'publishing' into 'failed' once a minute. Slides live in social_post_media
      // now (carousels), so the old media_key IS NOT NULL check would miss every new post.
      "SELECT id, caption, scheduled_at FROM social_posts WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? AND EXISTS (SELECT 1 FROM social_post_media m WHERE m.post_id = social_posts.id) ORDER BY scheduled_at LIMIT 5"
    ).bind(t).all();
    due = (r && r.results) || [];
  } catch { due = []; }

  for (const p of due) {
    const late = t - Number(p.scheduled_at || 0);
    if (late > GRACE_MS) {
      await env.DB.prepare(
        "UPDATE social_posts SET status='draft', error=?, updated_at=? WHERE id=? AND status='scheduled'"
      ).bind(
        `Not posted: it came due ${Math.round(late / 60000)} minutes late, past the ${Math.round(GRACE_MS / 60000)}-minute window. Posting it now would put it out at the wrong time of day, so it is back to draft.`,
        t, p.id
      ).run();
      missed.push({ id: p.id, late_minutes: Math.round(late / 60000) });
    }
  }

  const work = due.filter((p) => !missed.some((m) => m.id === p.id)).slice(0, PER_TICK);

  for (const p of work) {
    // Same claim the manual button uses — this is the mutex, and it has to be taken before the
    // ~20 seconds of container work, not after.
    const claim = await env.DB.prepare(
      "UPDATE social_posts SET status='publishing', error=NULL, updated_at=? WHERE id=? AND status='scheduled'"
    ).bind(now(), p.id).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) continue;   // a click got there first

    // The SAME publish path the owner's button uses — single image or carousel decided inside it.
    // The tick knowing how to publish differently from the button is exactly the drift the shared
    // function exists to prevent.
    const res = await publishSocialPost(env, request, p);
    if (!res.ok) {
      failed.push({ id: p.id, error: res.error || null });
      continue;
    }

    await capture(env, {
      event: 'social.post_published',
      distinct_id: 'system', role: 'system', team: 'marketing',
      properties: { post_id: p.id, scheduled: true, has_permalink: !!res.permalink },
    });
    published.push({ id: p.id, permalink: res.permalink || null });
  }

  return json({ ok: true, at: t, checked: due.length, published, failed, missed });
};
