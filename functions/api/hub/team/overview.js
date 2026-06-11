// GET /api/hub/team/overview — team-lead (or owner) snapshot of one team.
// Access: owner, OR any staff whose staff row has is_lead=1 (checked live via
// currentStaff so a freshly-promoted lead works without re-login).
// Scope: leads always see THEIR team (staff.team); the owner may pass ?team=.
// Returns: { team, members:[{staff_id,name,role,on_shift,last_active_at}],
//            eod_today:{filed,expected,missing:[names]}, open_tickets,
//            temp_excursions_today (kitchen team only, else null), reminders_due }.
import { json, bad } from '../../../_lib/util.js';
import { requireStaff, currentStaff } from '../../../_lib/roles.js';
import { today, now } from '../../../_lib/hub.js';

// Start of the New York day (unix ms) for "today" counts. Falls back to summer offset.
function nyDayStartMs(dateStr) {
  let offset = '-04:00';
  try {
    const probe = new Date(`${dateStr}T12:00:00Z`);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' });
    const part = (fmt.formatToParts(probe) || []).find((p) => p.type === 'timeZoneName');
    const m = part && part.value && part.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (m) offset = `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
  } catch { /* keep fallback */ }
  const t = Date.parse(`${dateStr}T00:00:00${offset}`);
  return Number.isFinite(t) ? t : now() - 24 * 3600 * 1000;
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireStaff(request, env);
  if (ctx instanceof Response) return ctx;

  // Live lead check via the staff row (session is_lead may be stale).
  const staff = await currentStaff(env, request);
  const isOwner = ctx.role === 'owner';
  const isLead = !!(staff && staff.is_lead);
  if (!isOwner && !isLead) return json({ error: 'Team view is for leads and the owner.' }, 403);

  const url = new URL(request.url);
  let team;
  if (isOwner) {
    team = (url.searchParams.get('team') || '').trim() || (staff && staff.team) || 'kitchen';
  } else {
    team = (staff && staff.team) || null;
  }
  if (!team) return bad('No team on your staff profile — ask the owner to set one.', 400);

  const date = today();
  const dayStart = nyDayStartMs(date);

  // Members + on-shift flag (open shift exists) in one query.
  let members = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT s.id AS staff_id, s.name, s.role, s.is_lead, s.last_active_at, ' +
        "EXISTS (SELECT 1 FROM shifts sh WHERE sh.staff_id = s.id AND sh.status='open') AS on_shift " +
        'FROM staff s WHERE s.team=? AND s.active=1 ORDER BY s.is_lead DESC, s.name'
      )
      .bind(team)
      .all();
    members = ((res && res.results) || []).map((m) => ({
      staff_id: m.staff_id,
      name: m.name || m.staff_id,
      role: m.role,
      is_lead: !!m.is_lead,
      on_shift: !!m.on_shift,
      last_active_at: m.last_active_at || null,
    }));
  } catch { members = []; }

  // EOD compliance today, scoped to the team's kitchen/driver staff.
  const eod = { filed: 0, expected: 0, missing: [] };
  try {
    const res = await env.DB
      .prepare(
        'SELECT s.id, s.name, EXISTS (SELECT 1 FROM eod_reports e WHERE e.staff_id = s.id AND e.report_date = ?) AS filed ' +
        "FROM staff s WHERE s.team=? AND s.active=1 AND s.role IN ('kitchen','driver') ORDER BY s.name"
      )
      .bind(date, team)
      .all();
    for (const r of (res && res.results) || []) {
      eod.expected++;
      if (r.filed) eod.filed++;
      else eod.missing.push(r.name || r.id);
    }
  } catch { /* keep zeros */ }

  // Open tickets created by anyone on the team.
  let openTickets = 0;
  try {
    const r = await env.DB
      .prepare(
        "SELECT COUNT(*) n FROM tickets t JOIN staff s ON s.id = t.created_by " +
        "WHERE s.team=? AND t.status IN ('open','in_progress')"
      )
      .bind(team)
      .first();
    openTickets = (r && Number(r.n)) || 0;
  } catch { openTickets = 0; }

  // Temp excursions today — kitchen team only (drivers' transit logs roll up elsewhere).
  let tempExcursions = null;
  if (team === 'kitchen') {
    try {
      const r = await env.DB
        .prepare('SELECT COUNT(*) n FROM temp_logs WHERE in_range=0 AND created_at >= ?')
        .bind(dayStart)
        .first();
      tempExcursions = (r && Number(r.n)) || 0;
    } catch { tempExcursions = 0; }
  }

  // Reminders currently due (unacknowledged, due now or undated) for the team or its members.
  let remindersDue = 0;
  try {
    const r = await env.DB
      .prepare(
        'SELECT COUNT(*) n FROM reminders rm WHERE rm.acknowledged=0 ' +
        'AND (rm.due_at IS NULL OR rm.due_at <= ?) ' +
        'AND (rm.team=? OR rm.target_staff_id IN (SELECT id FROM staff WHERE team=? AND active=1))'
      )
      .bind(now(), team, team)
      .first();
    remindersDue = (r && Number(r.n)) || 0;
  } catch { remindersDue = 0; }

  return json({
    ok: true,
    team,
    date,
    is_owner: isOwner,
    members,
    eod_today: eod,
    open_tickets: openTickets,
    temp_excursions_today: tempExcursions,
    reminders_due: remindersDue,
  });
};
