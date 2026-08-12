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
import { requireRole, HUB_ROLES } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';

// Every role, staff and portal alike — this endpoint is open to anyone signed in.
// Imported rather than re-typed: as a literal it silently omitted each newly added role
// (marketing, 2026-08-11) and the omission reads as a deliberate exclusion.
const ALL_ROLES = HUB_ROLES;
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
        "SELECT title, body, alert_type, created_at FROM alerts WHERE status = 'open' AND created_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(now() - ALERT_FRESH_MS).first();
      if (row) alert = { title: row.title || null, body: row.body || null, alert_type: row.alert_type || null, created_at: row.created_at };
    } catch { alert = null; }
  }

  // Marketing only: a request the owner JUST decided is the headline she's waiting on. Reads the
  // freshest decided-in-the-last-10-min improvement_request (mirror of the owner's alert window)
  // and turns her payload-less tickle into "Dayan accepted your request: …". Degrades to unread
  // if the table isn't there or nothing was decided recently.
  let decision = null;
  if (ctx.role === 'marketing') {
    try {
      const row = await env.DB.prepare(
        "SELECT title, status, owner_note, decided_at FROM improvement_requests WHERE decided_at IS NOT NULL AND decided_at > ? ORDER BY decided_at DESC LIMIT 1"
      ).bind(now() - ALERT_FRESH_MS).first();
      if (row) decision = { title: row.title || '', status: row.status || 'decided', note: row.owner_note || null };
    } catch { decision = null; }
  }

  // Driver only: a pending delivery-order offer is the most important headline.
  let offer = null;
  if (ctx.role === 'driver') {
    try {
      const row = await env.DB.prepare(
        "SELECT id, route_date, stop_count FROM routes WHERE driver_id = ? AND offer_status = 'pending' ORDER BY offered_at DESC LIMIT 1"
      ).bind(ctx.distinct_id).first();
      if (row) offer = { route_id: row.id, stops: row.stop_count, date: row.route_date };
    } catch { offer = null; }
  }

  let title;
  let body;
  if (offer) {
    title = 'New delivery order — Añejo HUB';
    body = `${offer.stops || ''} stop(s)${offer.date ? ' on ' + offer.date : ''}. Tap to accept or deny.`;
  } else if (alert) {
    title = alert.title || 'New alert at Añejo HUB';
    body = alert.body || 'Open the Owner Command Center for details.';
  } else if (decision) {
    const verb = decision.status === 'accepted' ? 'accepted' : decision.status === 'declined' ? 'declined'
      : decision.status === 'shipped' ? 'shipped' : 'decided';
    title = `Dayan ${verb} your request`;
    body = decision.title + (decision.note ? ' — ' + decision.note : '');
  } else {
    title = 'New message at Añejo HUB';
    body = unread === 1 ? 'You have 1 unread message.' : `You have ${unread} unread messages.`;
  }

  // Deep-link the notification tap to the right place, so the reader lands ON the item.
  let url = '/hub/';
  if (offer) url = '/hub/driver/route.html';
  else if (alert && alert.alert_type === 'partner_application') url = '/hub/owner/partners.html';
  else if (alert) url = '/hub/owner/';                 // other owner alerts → command center
  else if (decision) url = '/hub/marketing/';          // her Requests-to-Dayan board
  else if (unread) url = ctx.role === 'owner' ? '/hub/owner/comms.html' : '/hub/comms.html';

  return json({ ok: true, unread, alert, offer, decision, title, body, url });
};
