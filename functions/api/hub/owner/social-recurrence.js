import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { json, id } from '../../../_lib/util.js';
import { nextOccurrence, normalizeRecurrence, reviewRecurringPost } from '../../../_lib/social_recurrence.js';

const fail = (error, status = 400) => json({ ok: false, error }, status);

export async function onRequestGet({ request, env }) {
  const actor = await requireRole(request, env, MARKETING_DESK);
  if (actor instanceof Response) return actor;
  const postId = new URL(request.url).searchParams.get('post');
  try {
    if (postId) {
      const review = await reviewRecurringPost(env, postId);
      return review.error ? fail(review.error, 409) : json({ ok: true, ...review });
    }
    const rows = await env.DB.prepare(`SELECT r.id,r.source_post_id,r.snapshot_json,r.rule_json,r.status,r.next_at,
      r.last_post_id,r.missed_at,r.version,p.status AS last_status,p.scheduled_at AS last_at,p.permalink AS last_link
      FROM social_recurrences r LEFT JOIN social_posts p ON p.id=r.last_post_id
      WHERE r.status IN ('active','paused') OR r.id IN (
        SELECT id FROM social_recurrences WHERE status IN ('ended','stopped') ORDER BY approved_at DESC LIMIT 30
      )
      ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
        r.next_at, r.approved_at DESC`).all();
    return json({ ok: true, series: rows.results.map(({ snapshot_json, rule_json, ...row }) => ({
      ...row, snapshot: JSON.parse(snapshot_json), rule: JSON.parse(rule_json),
    })) });
  } catch {
    return fail('recurrence_unavailable', 503);
  }
}

export async function onRequestPost({ request, env }) {
  const actor = await requireRole(request, env, MARKETING_DESK);
  if (actor instanceof Response) return actor;
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail('recurrence_unavailable', 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return fail('invalid_rule', 415);
  let body;
  try { body = await request.json(); } catch { return fail('invalid_rule'); }
  const { op, version } = body || {};
  const at = Date.now();
  try {
    if (op === 'create') {
      const rule = normalizeRecurrence(body.rule);
      if (!rule) return fail('invalid_rule');
      const next = nextOccurrence(rule, at);
      if (next === null) return fail('no_future_times');
      const review = await reviewRecurringPost(env, String(body.post_id || ''));
      if (review.error) return fail(review.error, 409);
      if (review.hash !== body.preview_hash) return fail('preview_changed', 409);
      const seriesId = id('recurrence');
      const result = await env.DB.prepare(`INSERT INTO social_recurrences
        (id,source_post_id,snapshot_json,rule_json,status,next_at,approved_by,approved_at)
        SELECT ?,?,?,?,'active',?,?,? FROM social_posts
        WHERE id=? AND status IN ('draft','failed','published') AND campaign_cycle_id IS NULL AND source NOT IN ('inventory','recurring')
        ON CONFLICT DO NOTHING`).bind(seriesId, body.post_id, JSON.stringify(review.snapshot), JSON.stringify(rule),
        next, actor.distinct_id || actor.email, at, body.post_id).run();
      return result.meta?.changes === 1
        ? json({ ok: true, id: seriesId, next_at: next })
        : fail('series_exists_or_post_changed', 409);
    }

    if (!['edit', 'pause', 'resume', 'stop'].includes(op) || !Number.isInteger(version)) return fail('invalid_rule');
    const row = await env.DB.prepare('SELECT id,status,version,rule_json FROM social_recurrences WHERE id=?')
      .bind(String(body.id || '')).first();
    if (!row || row.version !== version || !['active', 'paused'].includes(row.status)) return fail('series_changed', 409);
    if ((op === 'pause' && row.status !== 'active') || (op === 'resume' && row.status !== 'paused')) return fail('series_changed', 409);
    const rule = op === 'edit' ? normalizeRecurrence(body.rule) : JSON.parse(row.rule_json);
    if (!rule) return fail('invalid_rule');
    const status = op === 'stop' ? 'stopped' : op === 'pause' ? 'paused' : op === 'resume' ? 'active' : row.status;
    const next = (op === 'edit' || status === 'active') ? nextOccurrence(rule, at) : null;
    if ((op === 'edit' || status === 'active') && next === null) return fail('no_future_times');
    const updated = await env.DB.prepare(`UPDATE social_recurrences SET status=?,rule_json=?,next_at=?,version=version+1
      WHERE id=? AND version=?`).bind(status, JSON.stringify(rule), status === 'active' ? next : null, row.id, version).run();
    return updated.meta?.changes === 1 ? json({ ok: true, status }) : fail('series_changed', 409);
  } catch {
    return fail('recurrence_unavailable', 503);
  }
}
