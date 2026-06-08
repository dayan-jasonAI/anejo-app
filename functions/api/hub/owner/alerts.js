// /api/hub/owner/alerts — the owner alerts feed.
//   GET  ?status=open|acknowledged|all (default open) &limit=  → list alerts
//   POST { id, action:'acknowledge' }                          → acknowledge one alert
// Owner-only. Alerts are mostly system-generated; this endpoint surfaces + acknowledges them.
// (Other surfaces/automations RAISE alerts via _lib/alerts.js raiseAlert(), not via this route.)
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { acknowledgeAlert } from '../../../_lib/alerts.js';
import { capture } from '../../../_lib/track.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'open').toLowerCase();
  let limit = parseInt(url.searchParams.get('limit') || '100', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 100;
  if (limit > 300) limit = 300;

  const where = [];
  const binds = [];
  if (status === 'open' || status === 'acknowledged') { where.push('status = ?'); binds.push(status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let rows = [];
  try {
    const res = await env.DB
      .prepare(`SELECT id, alert_type, severity, title, body, team, ref_type, ref_id, source, status, acknowledged_by, acknowledged_at, created_at FROM alerts ${clause} ORDER BY (severity='critical') DESC, created_at DESC LIMIT ?`)
      .bind(...binds, limit)
      .all();
    rows = (res && res.results) || [];
  } catch {
    rows = [];
  }

  const open_count = rows.filter((r) => r.status === 'open').length;
  return json({ ok: true, items: rows, count: rows.length, open_count });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const alertId = (b && b.id || '').toString().trim();
  const action = (b && b.action || 'acknowledge').toString();
  if (!alertId) return bad('Missing alert id.');
  if (action !== 'acknowledge') return bad('Unsupported action.');

  // Look up the type first so we can attach it to the tracking event.
  let alert = null;
  try {
    alert = await env.DB.prepare('SELECT id, alert_type, status FROM alerts WHERE id = ?').bind(alertId).first();
  } catch { /* fall through */ }
  if (!alert) return json({ error: 'Alert not found.' }, 404);

  const res = await acknowledgeAlert(env, alertId, ctx.distinct_id);
  if (!res.ok) return json({ error: 'Could not acknowledge.' }, 500);

  if (res.changed) {
    await capture(env, {
      event: 'alert.acknowledged',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      actor_type: 'human',
      team: ctx.team,
      properties: { alert_type: alert.alert_type, alert_id: alertId, platform: 'api' },
    });
  }

  return json({ ok: true, acknowledged: !!res.changed, already: !res.changed });
};
