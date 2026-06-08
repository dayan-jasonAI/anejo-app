// GET /api/hub/owner/activity — the live feed for the command center, read from activity_log.
// Owner-only. Query: ?limit=50 (max 200), ?event=<exact>, ?team=<team>, ?before=<unix-ms cursor>.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { parseJson } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get('limit') || '50', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;

  const event = url.searchParams.get('event');
  const team = url.searchParams.get('team');
  const before = parseInt(url.searchParams.get('before') || '0', 10);

  const where = [];
  const binds = [];
  if (event) { where.push('event = ?'); binds.push(event); }
  if (team) { where.push('team = ?'); binds.push(team); }
  if (Number.isFinite(before) && before > 0) { where.push('created_at < ?'); binds.push(before); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let rows = [];
  try {
    const res = await env.DB
      .prepare(`SELECT id, event, actor_id, actor_role, actor_type, team, properties, created_at FROM activity_log ${clause} ORDER BY created_at DESC LIMIT ?`)
      .bind(...binds, limit)
      .all();
    rows = (res && res.results) || [];
  } catch {
    rows = [];
  }

  const items = rows.map((r) => ({
    id: r.id,
    event: r.event,
    actor_id: r.actor_id,
    actor_role: r.actor_role,
    actor_type: r.actor_type,
    team: r.team,
    properties: parseJson(r.properties, {}),
    created_at: r.created_at,
  }));

  const next_before = items.length === limit ? items[items.length - 1].created_at : null;
  return json({ ok: true, items, next_before });
};
