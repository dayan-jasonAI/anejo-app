// POST /api/hub/driver/ticket/create — driver opens a complaint/issue ticket.
// Body: {
//   ticket_type: 'complaint'|'equipment'|'safety'|'scheduling'|'other',
//   severity?: 'low'|'medium'|'high'|'urgent',
//   title?, body?, order_id?
// }
// Fires ticket.created.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { raiseAlert } from '../../../../_lib/alerts.js';
import { id, now } from '../../../../_lib/hub.js';

const TYPES = ['complaint', 'equipment', 'safety', 'scheduling', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'urgent'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const ticketType = TYPES.includes(b && b.ticket_type) ? b.ticket_type : null;
  if (!ticketType) return bad('ticket_type must be one of: ' + TYPES.join(', '));
  const severity = SEVERITIES.includes(b && b.severity) ? b.severity : 'low';
  const title = (b && b.title || '').toString().slice(0, 200) || null;
  const body = (b && b.body || '').toString().slice(0, 5000) || null;
  if (!title && !body) return bad('Provide a title or body for the ticket.');

  const ts = now();
  const ticketId = id('tkt');

  await env.DB
    .prepare(
      'INSERT INTO tickets (id, ticket_type, severity, status, title, body, created_by, order_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    )
    .bind(ticketId, ticketType, severity, 'open', title, body, staff.id, (b && b.order_id) || null, ts, ts)
    .run();

  await capture(env, {
    event: 'ticket.created',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { ticket_type: ticketType, severity, ai_triaged: false, platform: 'pwa' },
  });

  // Owner alert for high/urgent (and all safety) tickets — needs prompt attention.
  if (severity === 'high' || severity === 'urgent' || ticketType === 'safety') {
    await raiseAlert(env, {
      alert_type: 'negative_sentiment',
      severity: severity === 'urgent' ? 'critical' : 'warning',
      title: `${severity === 'urgent' ? 'Urgent' : 'High-priority'} ${ticketType} ticket`,
      body: (title || body || '').slice(0, 160),
      team: ctx.team || null,
      ref_type: 'ticket', ref_id: ticketId,
      source: 'surface',
      dedupe_key: `ticket:${ticketId}`,
    });
  }

  return json({ ok: true, ticket: { id: ticketId, ticket_type: ticketType, severity, status: 'open' } });
};
