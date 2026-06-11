// Comms core — cheap unread counter for the session.
//   GET /api/hub/comms/unread → { ok, count }
//        count = total messages across the session's visible threads that are newer
//        than the reader's thread_reads watermark (0 when never read), excluding
//        their own messages. Same visibility scoping as threads.js:
//        owner all; staff/vendor staff_id=me OR created_by=me OR broadcast;
//        trainer/client their own id.
// thread_reads ships in migration 0007 — until the table exists, count degrades to 0.
// Intended for the global hub badge (polled by the shell), so it stays one query.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];

// Visibility WHERE clause for the session (mirror of threads.js scopeWhere).
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

  let count = 0;
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
    count = Number(row && row.n) || 0;
  } catch { count = 0; /* thread_reads not migrated yet */ }

  return json({ ok: true, count });
};
