// Kitchen reminders.
//   GET  /api/hub/kitchen/reminders        → today's open reminders for the kitchen team
//   POST /api/hub/kitchen/reminders { id } → acknowledge a reminder
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  // Due within the next 24h (or already due) and not yet acknowledged, scoped to the
  // kitchen team or directly targeted at this staffer.
  const horizon = now() + 24 * 3600 * 1000;
  const { results } = await env.DB.prepare(
    `SELECT * FROM reminders
       WHERE acknowledged = 0
         AND (due_at IS NULL OR due_at <= ?)
         AND (team = 'kitchen' OR team IS NULL OR target_staff_id = ?)
       ORDER BY due_at ASC NULLS LAST, created_at ASC
       LIMIT 50`
  ).bind(horizon, staff ? staff.id : '').all();

  return json({ reminders: results || [] });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const rId = (b && b.id || '').toString().trim();
  if (!rId) return bad('Missing reminder id.');

  const reminder = await env.DB.prepare('SELECT * FROM reminders WHERE id = ?').bind(rId).first();
  if (!reminder) return bad('Reminder not found.', 404);

  const ts = now();
  await env.DB.prepare(
    'UPDATE reminders SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = ?, updated_at = ? WHERE id = ?'
  ).bind(staff ? staff.id : null, ts, ts, rId).run();

  await capture(env, {
    event: 'reminder.acknowledged',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { reminder_type: reminder.reminder_type, reminder_id: rId },
  });

  return json({ ok: true, id: rId });
};
