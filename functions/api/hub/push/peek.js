// Web Push — what should the notification say? (any authenticated role)
//   GET /api/hub/push/peek → { ok, unread, alert, title, body }
// The service worker calls this AFTER a payload-less tickle (see _lib/push.js)
// to decide what to render:
//   unread — the session's comms unread count (exact scoping mirror of
//            functions/api/hub/comms/unread.js, one query).
//   alert  — owner only: the latest OPEN alerts row raised in the last 10
//            minutes ({ title, body, created_at }), else null (one query).
//   title/body — best notification text: a fresh alert wins (owner), otherwise
//            'New message at Añejo HUB' with the unread count.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];
const ALERT_FRESH_MS = 10 * 60 * 1000;

// Visibility WHERE clause for the session (mirror of comms/unread.js scopeWhere).
function scopeWhere(ctx) {
  if (ctx.role === 'owner') return { where: '1=1', binds: [] };
  if (ctx.role === 'trainer') return { where: 't.trainer_id = ?', binds: [ctx.distinct_id] };
  if (ctx.role === 'client') return { where: 't.client_id = ?', binds: [ctx.distinct_id] };
  return {
    where: "(t.staff_id = ? OR t.created_by = ? OR t.audience = 'broadcast')",
    binds: [ctx.distinct_id, ctx.distinct_id],
  };
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  const readerId = ctx.distinct_id || ctx.email || '';
  const { where, binds } = scopeWhere(ctx);

  let unread = 0;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM messages m
         JOIN threads t ON t.id = m.thread_id
         LEFT JOIN thread_reads r ON r.thread_id = m.thread_id AND r.reader_id = ?
        WHERE ${where}
          AND m.created_at > COALESCE(r.last_read_at, 0)
          AND COALESCE(m.sender_id, '') != ?`
    ).bind(readerId, ...binds, readerId).first();
    unread = Number(row && row.n) || 0;
  } catch { unread = 0; /* thread_reads not migrated yet */ }

  // Owner only: surface a just-raised open alert as the notification headline.
  let alert = null;
  if (ctx.role === 'owner') {
    try {
      const row = await env.DB.prepare(
        "SELECT title, body, created_at FROM alerts WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(now() - ALERT_FRESH_MS).first();
      if (row) alert = { title: row.title || null, body: row.body || null, created_at: row.created_at };
    } catch { alert = null; }
  }

  let title;
  let body;
  if (alert) {
    title = alert.title || 'New alert at Añejo HUB';
    body = alert.body || 'Open the Owner Command Center for details.';
  } else {
    title = 'New message at Añejo HUB';
    body = unread === 1 ? 'You have 1 unread message.' : `You have ${unread} unread messages.`;
  }

  return json({ ok: true, unread, alert, title, body });
};
