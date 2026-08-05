// GET /api/hub/me/activity — what the HUB has recorded about YOU.
//   Query: ?limit=50 (max 200), ?before=<unix-ms cursor>
//
// This closes the "read" half of TELEMETRY_ESTATE.md §4.1 — *"A log you cannot inspect is
// surveillance, whichever direction it points."*
//
// Until now that half was only nominally satisfied. Every route touching activity_log was
// `requireRole(['owner'])`, so the OWNER could read everyone's history and a kitchen worker could
// read nothing — including their own. The registry recorded Añejo as "read YES" because it measured
// the system's ability to read the table, not the subject's. For the six people actually in the
// table it was read NO.
//
// SCOPE IS TAKEN FROM THE SESSION, NEVER FROM THE REQUEST. There is no actor_id parameter, so
// there is no version of this endpoint that can be talked into showing one staff member another's
// history. The owner's cross-person view already exists separately at /api/hub/owner/activity.
import { json, bad } from '../../../_lib/util.js';
import { currentRole } from '../../../_lib/roles.js';
import { eventLabel } from '../../../_lib/activity_labels.js';
import { parseJson } from '../../../_lib/hub.js';
import { PURGE_EXCLUDED } from '../../../_lib/purge.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  // No identity, no rows. An anonymous session must not fall through to an unscoped query.
  if (!ctx.distinct_id) return json({ ok: true, rows: [], total: 0, purgeable: 0, kept: 0 });

  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get('limit') || '50', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  if (limit > 200) limit = 200;
  const before = parseInt(url.searchParams.get('before') || '0', 10);

  const where = ['actor_id = ?'];
  const binds = [ctx.distinct_id];
  if (Number.isFinite(before) && before > 0) { where.push('created_at < ?'); binds.push(before); }

  let rows = [];
  try {
    rows = ((await env.DB
      .prepare(`SELECT id, event, actor_role, actor_type, team, properties, created_at
                  FROM activity_log WHERE ${where.join(' AND ')}
                 ORDER BY created_at DESC LIMIT ?`)
      .bind(...binds, limit)
      .all()).results) || [];
  } catch {
    rows = [];
  }

  // Totals, and the split the person is entitled to understand BEFORE asking for an erasure:
  // what would go, and what would stay because it is a compliance record rather than telemetry.
  const holes = PURGE_EXCLUDED.map(() => '?').join(',');
  let total = 0, purgeable = 0, kept = 0;
  try {
    const t = await env.DB
      .prepare(`SELECT COUNT(*) AS total,
                       SUM(CASE WHEN event NOT IN (${holes}) THEN 1 ELSE 0 END) AS purgeable
                  FROM activity_log WHERE actor_id = ?`)
      .bind(...PURGE_EXCLUDED, ctx.distinct_id)
      .first();
    total = (t && t.total) || 0;
    purgeable = (t && t.purgeable) || 0;
    kept = total - purgeable;
  } catch { /* counts are a nicety; the list is the point */ }

  return json({
    ok: true,
    total,
    purgeable,
    kept,
    kept_reason: 'Money, food-safety and contract records are kept as the business\'s compliance trail, and are not erased by a purge request.',
    rows: rows.map((r) => ({
      id: r.id,
      event: r.event,
      label: eventLabel ? eventLabel(r.event) : r.event,
      role: r.actor_role,
      team: r.team,
      properties: parseJson(r.properties, null),
      created_at: r.created_at,
      purgeable: !PURGE_EXCLUDED.includes(r.event),
    })),
    next_before: rows.length === limit ? rows[rows.length - 1].created_at : null,
  });
};
