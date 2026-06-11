// Kitchen reminders.
//   GET  /api/hub/kitchen/reminders              → today's open reminders for the kitchen team
//   GET  /api/hub/kitchen/reminders?manage=1     → owner/lead management view (upcoming + recent acks)
//   POST /api/hub/kitchen/reminders { id }       → acknowledge a reminder
//   POST /api/hub/kitchen/reminders { action:'create', title, body?, reminder_type, team,
//                                     due_at, target_staff_id? } → owner/lead schedules a reminder
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id as genId, now } from '../../../_lib/hub.js';

const REMINDER_TYPES = ['prep', 'sanitation', 'order_cutoff', 'temp_check', 'custom'];
const REMINDER_TEAMS = ['kitchen', 'delivery'];

// Owners and team leads may compose/manage reminders.
function isManager(ctx, staff) {
  return ctx.role === 'owner' || !!ctx.is_lead || !!(staff && staff.is_lead);
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  const url = new URL(request.url);

  // Management view (owner/lead): everything upcoming + recently acknowledged.
  if (url.searchParams.get('manage') === '1') {
    if (!isManager(ctx, staff)) return bad('Only owners or team leads can manage reminders.', 403);
    const up = await env.DB.prepare(
      `SELECT * FROM reminders
         WHERE acknowledged = 0
         ORDER BY due_at ASC NULLS LAST, created_at ASC
         LIMIT 30`
    ).all();
    const acked = await env.DB.prepare(
      `SELECT * FROM reminders
         WHERE acknowledged = 1
         ORDER BY acknowledged_at DESC
         LIMIT 30`
    ).all();
    return json({ ok: true, upcoming: (up && up.results) || [], acknowledged: (acked && acked.results) || [] });
  }

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

  // ----- Compose (owner/lead only) -----
  if (b && b.action === 'create') {
    if (!isManager(ctx, staff)) return bad('Only owners or team leads can schedule reminders.', 403);

    const title = (b.title || '').toString().trim();
    if (!title) return bad('Title is required.');
    const reminder_type = (b.reminder_type || '').toString().trim();
    if (!REMINDER_TYPES.includes(reminder_type)) return bad('Invalid reminder type.');
    const team = (b.team || '').toString().trim();
    if (!REMINDER_TEAMS.includes(team)) return bad('Team must be kitchen or delivery.');
    const due_at = Number(b.due_at);
    if (!Number.isFinite(due_at) || due_at <= 0) return bad('A due date/time (unix ms) is required.');
    const body = (b.body || '').toString().trim() || null;

    let target = (b.target_staff_id || '').toString().trim() || null;
    if (target) {
      const t = await env.DB.prepare('SELECT id FROM staff WHERE id = ?').bind(target).first();
      if (!t) return bad('Target staff member not found.', 404);
    }

    const ts = now();
    const rid = genId('rem');
    await env.DB.prepare(
      'INSERT INTO reminders (id, reminder_type, title, body, team, target_staff_id, due_at, acknowledged, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).bind(rid, reminder_type, title, body, team, target, due_at, ts, ts).run();

    await capture(env, {
      event: 'reminder.created',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { reminder_type, reminder_id: rid, target_team: team, targeted: !!target },
    });

    return json({ ok: true, id: rid });
  }

  // ----- Acknowledge (existing behavior) -----
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
