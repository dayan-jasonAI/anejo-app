// POST /api/hub/admin/insights-tick — capture today's Instagram performance snapshot.
// Auth: owner session OR the X-Cron-Key header, same as every other tick. Fired daily by
// anejo-cron; safe to fire by hand from the HUB whenever.
//
// IDEMPOTENT PER DAY: rows are keyed (media_id, capture_date), so re-running replaces today's
// snapshot instead of stacking duplicates — and yesterday's rows are never touched, because the
// day-over-day curve is the signal the learning loop reads.
//
// A permission failure on /insights is a PARTIAL result, not a failed run: likes, comments and
// follower count still land (they ride the media list, not the insights edge), and the response
// names the fix — regenerate the token so it carries manage_insights.
import { json, bad, now, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { etDateOf } from '../../../_lib/hub.js';
import { igConfigured } from '../../../_lib/instagram.js';
import { sweepAccountInsights } from '../../../_lib/instagram_insights.js';

export const onRequestPost = async ({ request, env }) => {
  const cronKey = request.headers.get('x-cron-key') || '';
  const viaCron = !!(env.CRON_KEY && ctEq(cronKey, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);
  if (!igConfigured(env)) return json({ ok: true, skipped: 'instagram_not_configured' });

  const sweep = await sweepAccountInsights(env, { limit: 25 });
  if (!sweep.ok) return bad(sweep.error || 'Could not read the account.', 502);

  const t = now();
  const day = etDateOf(t);

  // Match Meta's media ids to our own posts once, so "ours vs pre-pipeline" is a column, not a
  // join nobody remembers to write.
  let ourIds = {};
  try {
    const r = await env.DB.prepare('SELECT id, ig_media_id FROM social_posts WHERE ig_media_id IS NOT NULL').all();
    for (const row of (r && r.results) || []) ourIds[row.ig_media_id] = row.id;
  } catch { ourIds = {}; }

  let stored = 0;
  for (const m of sweep.rows) {
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO ig_media_metrics
           (media_id, capture_date, post_id, media_type, caption, permalink, posted_at,
            likes, comments, reach, saved, shares, views, total_interactions, captured_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        m.media_id, day, ourIds[m.media_id] || null, m.media_type, m.caption, m.permalink, m.posted_at,
        m.likes, m.comments, m.reach, m.saved, m.shares, m.views, m.total_interactions, t
      ).run();
      stored += 1;
    } catch { /* one bad row must not lose the day */ }
  }

  if (sweep.account) {
    try {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO ig_account_metrics (capture_date, followers, media_count, captured_at) VALUES (?,?,?,?)'
      ).bind(day, sweep.account.followers, sweep.account.media_count, t).run();
    } catch { /* best-effort */ }
  }

  return json({
    ok: true,
    date: day,
    posts_captured: stored,
    followers: sweep.account ? sweep.account.followers : null,
    // Non-null means likes/comments only — the token predates manage_insights. Named plainly so
    // the fix is obvious from the response alone.
    insights_error: sweep.insights_error || null,
    hint: sweep.insights_error ? 'Regenerate the token under Instagram → API setup with Instagram business login, then update IG_ACCESS_TOKEN.' : null,
  });
};
