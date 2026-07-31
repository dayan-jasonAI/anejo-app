// Reading how posts performed — the input half of the learning loop. NOT routed.
//
// Needs the instagram_business_manage_insights permission, which means a token generated AFTER
// that permission was added to the app. An old token fails with a permission error, and callers
// surface that as "regenerate the token", not as a mystery.
//
// TWO FACTS ABOUT META'S INSIGHTS API THAT SHAPE THIS FILE:
//   1. likes/comments come free on the media list; reach/saved/shares/views need the /insights
//      edge. Two different calls, different failure modes.
//   2. /insights REJECTS THE WHOLE CALL if any one metric is invalid for that media type — and
//      validity varies by type and API version. So on failure we retry with the minimal set
//      (reach, saved) rather than losing everything because 'views' was renamed again. A partial
//      snapshot beats no snapshot; the columns simply stay NULL.
import { resolveTarget, igConfigured } from './instagram.js';
import { etDateOf } from './hub.js';

async function graphGet(env, base, path, params) {
  const qs = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN });
  try {
    const r = await fetch(`${base}${path}?${qs}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || (j && j.error)) {
      const e = (j && j.error) || {};
      return { ok: false, error: [e.message, e.error_user_msg].filter(Boolean).join(' — ') || `HTTP ${r.status}`, code: e.code || r.status };
    }
    return { ok: true, body: j };
  } catch (e) {
    return { ok: false, error: 'Could not reach Instagram. ' + String((e && e.message) || '').slice(0, 120) };
  }
}

const FULL_METRICS = 'reach,saved,shares,views,total_interactions';
const MIN_METRICS = 'reach,saved';

/** { reach, saved, shares, views, total_interactions } — whatever Meta will give us for this post. */
async function mediaInsights(env, base, mediaId) {
  let r = await graphGet(env, base, `/${mediaId}/insights`, { metric: FULL_METRICS });
  if (!r.ok && !/permission|#10\b|#200\b/i.test(String(r.error))) {
    // Invalid-metric shape, not a permissions problem — fall back rather than lose the snapshot.
    r = await graphGet(env, base, `/${mediaId}/insights`, { metric: MIN_METRICS });
  }
  if (!r.ok) return { ok: false, error: r.error };
  const out = {};
  for (const m of (r.body && r.body.data) || []) {
    const v = m.values && m.values[0] ? Number(m.values[0].value) : null;
    if (Number.isFinite(v)) out[m.name] = v;
  }
  return { ok: true, metrics: out };
}

/**
 * One sweep: every recent post on the account (ours or not), with whatever metrics Meta grants.
 * A permission failure on /insights does not sink the sweep — likes/comments and the account
 * numbers still land, and `insights_error` tells the caller exactly what to fix.
 */
export async function sweepAccountInsights(env, { limit = 25 } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  const acct = await graphGet(env, base, `/${igId}`, { fields: 'followers_count,media_count' });
  const media = await graphGet(env, base, `/${igId}/media`, {
    fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
  });
  if (!media.ok) return { ok: false, error: media.error };

  const rows = [];
  let insightsError = null;
  for (const m of (media.body && media.body.data) || []) {
    const ins = await mediaInsights(env, base, m.id);
    if (!ins.ok && !insightsError) insightsError = ins.error;
    const mm = ins.ok ? ins.metrics : {};
    rows.push({
      media_id: m.id,
      media_type: m.media_type || null,
      caption: String(m.caption || '').slice(0, 300) || null,
      permalink: m.permalink || null,
      posted_at: m.timestamp ? Date.parse(m.timestamp) : null,
      likes: Number.isFinite(m.like_count) ? m.like_count : null,
      comments: Number.isFinite(m.comments_count) ? m.comments_count : null,
      reach: mm.reach ?? null,
      saved: mm.saved ?? null,
      shares: mm.shares ?? null,
      views: mm.views ?? null,
      total_interactions: mm.total_interactions ?? null,
    });
  }

  return {
    ok: true,
    account: acct.ok ? { followers: acct.body.followers_count ?? null, media_count: acct.body.media_count ?? null } : null,
    rows,
    insights_error: insightsError,   // non-null = likes/comments only; the token needs the new scope
  };
}

/**
 * A compact performance readout for the planner: what recently worked, what did not. Returns ''
 * when there is nothing yet — the planner must never see an empty scaffold that reads like data.
 */
export async function performanceBrief(env) {
  if (!env || !env.DB) return '';
  try {
    const today = etDateOf(Date.now());
    const r = await env.DB.prepare(
      `SELECT caption, media_type, likes, comments, reach, saved
         FROM ig_media_metrics
        WHERE capture_date = (SELECT MAX(capture_date) FROM ig_media_metrics)
        ORDER BY COALESCE(reach, likes, 0) DESC LIMIT 8`
    ).all();
    const rows = (r && r.results) || [];
    if (!rows.length) return '';
    const line = (m, i) => {
      const parts = [];
      if (m.reach != null) parts.push(`reach ${m.reach}`);
      if (m.likes != null) parts.push(`${m.likes} likes`);
      if (m.saved != null) parts.push(`${m.saved} saves`);
      if (m.comments != null) parts.push(`${m.comments} comments`);
      return `${i + 1}. [${m.media_type || 'POST'}] "${String(m.caption || '').slice(0, 90)}" — ${parts.join(', ') || 'no metrics yet'}`;
    };
    const top = rows.slice(0, 3).map(line).join('\n');
    const bottom = rows.length > 3 ? line(rows[rows.length - 1], rows.length - 1) : '';
    return (
      `=== HOW RECENT POSTS PERFORMED (as of ${today}) ===\n` +
      `Best performers:\n${top}\n` +
      (bottom ? `Weakest:\n${bottom}\n` : '') +
      `Write toward what the numbers say people respond to — subject, angle and format — without repeating captions verbatim.\n` +
      `=== END PERFORMANCE ===`
    );
  } catch { return ''; }
}
