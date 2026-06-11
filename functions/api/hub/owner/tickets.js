// /api/hub/owner/tickets — owner ticket triage.
//   GET  ?status=open                 → open + in_progress tickets with creator name
//   POST { id, action:'resolve', resolution? }
//        → marks resolved, stamps resolved_at, fires ticket.resolved with
//          resolution_minutes, and closes the matching 'ticket:<id>' alert.
// Owner-only.
import { json, bad, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'open').toLowerCase();
  const where = status === 'all'
    ? ''
    : "WHERE t.status IN ('open','in_progress')";

  let rows = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT t.id, t.ticket_type, t.severity, t.status, t.title, t.body, t.created_by, t.assignee_id, ' +
        't.order_id, t.ai_triaged, t.resolution, t.resolved_at, t.created_at, ' +
        's.name AS creator_name, s.role AS creator_role ' +
        `FROM tickets t LEFT JOIN staff s ON s.id = t.created_by ${where} ` +
        "ORDER BY CASE t.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC LIMIT 200"
      )
      .all();
    rows = (res && res.results) || [];
  } catch {
    rows = [];
  }
  return json({ ok: true, items: rows, count: rows.length });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const ticketId = (b && b.id || '').toString().trim();
  const action = (b && b.action || '').toString();
  const resolution = (b && b.resolution || '').toString().trim();
  if (!ticketId) return bad('Missing ticket id.');
  if (action !== 'resolve') return bad('Unsupported action.');

  const ticket = await env.DB.prepare('SELECT * FROM tickets WHERE id=?').bind(ticketId).first();
  if (!ticket) return json({ error: 'Ticket not found.' }, 404);
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return bad('This ticket is already resolved.', 409);
  }

  const t = now();
  await env.DB
    .prepare("UPDATE tickets SET status='resolved', resolution=?, resolved_at=?, updated_at=? WHERE id=?")
    .bind(resolution || null, t, t, ticketId)
    .run();

  const resolution_minutes = ticket.created_at ? Math.round((t - ticket.created_at) / 60000) : null;
  await capture(env, {
    event: 'ticket.resolved',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { ticket_id: ticketId, ticket_type: ticket.ticket_type, resolution_minutes },
  });

  // Close the matching alert (raised on ticket creation) by dedupe key.
  try {
    await env.DB
      .prepare("UPDATE alerts SET status='acknowledged', acknowledged_by=?, acknowledged_at=?, updated_at=? WHERE dedupe_key=? AND status='open'")
      .bind(ctx.distinct_id || null, t, t, `ticket:${ticketId}`)
      .run();
  } catch { /* best-effort */ }

  return json({ ok: true, id: ticketId, status: 'resolved', resolution_minutes });
};
