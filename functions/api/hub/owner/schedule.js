// /api/hub/owner/schedule — owner assigns driver shifts in advance (drivers only;
// cooks are full-time and exempt by owner decision).
//   GET  ?from=YYYY-MM-DD&days=7
//        → { drivers (active role='driver'), shifts (shift_schedule rows in range,
//            status='scheduled', with driver name) }
//   POST { action:'assign', staff_id, shift_date, start:'HH:MM', end:'HH:MM', label?, notes? }
//        → validates the staffer is an active driver, computes start_at/end_at in
//          America/New_York, inserts the row, SMSes the driver (safe no-op without
//          Twilio creds) and posts an in_app thread message.
//   POST { action:'cancel', id } → status='canceled' (never deleted) + SMS/thread note.
// Owner-only. Fires shift.scheduled / shift.schedule_canceled + message.sent.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { sendSms } from '../../../_lib/twilio.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// UTC offset string for America/New_York on a given date (e.g. '-04:00' under DST).
// Computed via Intl so the March/November transitions are handled; falls back to
// '-04:00' (summer) if the runtime lacks longOffset support.
function nyOffset(dateStr) {
  try {
    const probe = new Date(`${dateStr}T12:00:00Z`);
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' });
    const part = (fmt.formatToParts(probe) || []).find((p) => p.type === 'timeZoneName');
    const m = part && part.value && part.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (m) return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`;
  } catch { /* fall through */ }
  return '-04:00';
}

// Unix ms for a local New York date + HH:MM.
function nyMs(dateStr, hhmm) {
  const t = Date.parse(`${dateStr}T${hhmm}:00${nyOffset(dateStr)}`);
  return Number.isFinite(t) ? t : null;
}

// Find the driver's latest open thread, or create one (audience 'driver').
// Same find-or-create used by owner/routes.js: prefers threads.staff_id when the
// comms module added it; falls back to created_by for the base 0003 schema.
async function findOrCreateDriverThread(env, driver, t) {
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE staff_id=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(driver.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* no staff_id column yet */ }
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE created_by=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(driver.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* tolerate */ }

  const tid = id('thr');
  try {
    await env.DB
      .prepare("INSERT INTO threads (id, audience, subject, created_by, staff_id, status, created_at, updated_at) VALUES (?,'driver',?,?,?,'open',?,?)")
      .bind(tid, 'Shift schedule', driver.id, driver.id, t, t)
      .run();
    return tid;
  } catch { /* no staff_id column yet */ }
  await env.DB
    .prepare("INSERT INTO threads (id, audience, subject, created_by, status, created_at, updated_at) VALUES (?,'driver',?,?,'open',?,?)")
    .bind(tid, 'Shift schedule', driver.id, t, t)
    .run();
  return tid;
}

// In-app thread message to the driver (best-effort; never breaks the schedule write).
async function postDriverNote(env, ctx, driver, body, t) {
  try {
    const threadId = await findOrCreateDriverThread(env, driver, t);
    await env.DB
      .prepare("INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,'outbound','in_app',?,?,?,0,?)")
      .bind(id('msg'), threadId, ctx.distinct_id || null, ctx.role || 'owner', body, t)
      .run();
    await env.DB.prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?').bind(t, t, threadId).run();
    await capture(env, {
      event: 'message.sent',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { channel: 'in_app', audience: 'driver', ai_drafted: false },
    });
  } catch { /* messaging must not break scheduling */ }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  let from = (url.searchParams.get('from') || '').trim();
  if (!DATE_RE.test(from)) from = today();
  let days = parseInt(url.searchParams.get('days') || '7', 10);
  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > 31) days = 31;

  // Exclusive upper bound: from + days (date math at noon UTC to dodge DST edges).
  let to = from;
  try {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    to = d.toISOString().slice(0, 10);
  } catch { /* keep from */ }

  let drivers = [];
  try {
    const res = await env.DB
      .prepare("SELECT id, name, phone, team FROM staff WHERE role='driver' AND active=1 ORDER BY name")
      .all();
    drivers = (res && res.results) || [];
  } catch { drivers = []; }

  let shifts = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT ss.id, ss.staff_id, ss.shift_date, ss.start_at, ss.end_at, ss.label, ss.notes, ss.status, ss.created_at, ' +
        'st.name AS driver_name ' +
        "FROM shift_schedule ss LEFT JOIN staff st ON st.id = ss.staff_id " +
        "WHERE ss.shift_date >= ? AND ss.shift_date < ? AND ss.status='scheduled' " +
        'ORDER BY ss.shift_date, ss.start_at'
      )
      .bind(from, to)
      .all();
    shifts = (res && res.results) || [];
  } catch { shifts = []; }

  return json({ ok: true, from, days, drivers, shifts });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = (b && b.action || '').toString().trim();
  const t = now();

  // ---- cancel: soft-archive (status='canceled'), never delete ----
  if (action === 'cancel') {
    const sid = (b && b.id || '').toString().trim();
    if (!sid) return bad('Missing schedule id.');
    const row = await env.DB
      .prepare("SELECT ss.*, st.name AS driver_name, st.phone AS driver_phone FROM shift_schedule ss LEFT JOIN staff st ON st.id = ss.staff_id WHERE ss.id=?")
      .bind(sid)
      .first();
    if (!row) return bad('Scheduled shift not found.', 404);
    if (row.status === 'canceled') return json({ ok: true, id: sid, already_canceled: true });

    await env.DB
      .prepare("UPDATE shift_schedule SET status='canceled', updated_at=? WHERE id=?")
      .bind(t, sid)
      .run();

    await capture(env, {
      event: 'shift.schedule_canceled',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { schedule_id: sid, staff_id: row.staff_id, shift_date: row.shift_date },
    });

    let sms = null;
    if (row.driver_phone) {
      sms = await sendSms(env, {
        to: row.driver_phone,
        body: `Añejo: your ${row.shift_date} shift${row.label ? ` (${row.label})` : ''} was canceled. Open the HUB.`,
      });
    }
    await postDriverNote(env, ctx, { id: row.staff_id, name: row.driver_name },
      `Shift canceled: ${row.shift_date}${row.label ? ` — ${row.label}` : ''}.`, t);

    return json({ ok: true, id: sid, sms_sent: !!(sms && sms.sent), sms_noop: !!(sms && sms.noop) });
  }

  // ---- assign ----
  if (action !== 'assign') return bad('Unknown action.');

  const staffId = (b && b.staff_id || '').toString().trim();
  const shiftDate = (b && b.shift_date || '').toString().trim();
  const start = (b && b.start || '').toString().trim();
  const end = (b && b.end || '').toString().trim();
  const label = (b && b.label || '').toString().trim().slice(0, 80) || null;
  const notes = (b && b.notes || '').toString().trim().slice(0, 500) || null;

  if (!staffId) return bad('Pick a driver.');
  if (!DATE_RE.test(shiftDate)) return bad('Invalid shift date.');
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return bad('Start and end must be HH:MM times.');

  const driver = await env.DB
    .prepare('SELECT id, name, phone, role, active FROM staff WHERE id=?')
    .bind(staffId)
    .first();
  if (!driver || driver.role !== 'driver' || !driver.active) {
    return bad('Scheduling is for drivers only.');
  }

  const startAt = nyMs(shiftDate, start);
  const endAt = nyMs(shiftDate, end);
  if (startAt == null || endAt == null) return bad('Could not compute shift times.');
  if (endAt <= startAt) return bad('End time must be after start time.');

  const sid = id('sched');
  await env.DB
    .prepare(
      'INSERT INTO shift_schedule (id, staff_id, shift_date, start_at, end_at, label, notes, status, created_by, created_at, updated_at) ' +
      "VALUES (?,?,?,?,?,?,?,'scheduled',?,?,?)"
    )
    .bind(sid, driver.id, shiftDate, startAt, endAt, label, notes, ctx.distinct_id || null, t, t)
    .run();

  await capture(env, {
    event: 'shift.scheduled',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { schedule_id: sid, staff_id: driver.id, shift_date: shiftDate, start, end, label },
  });

  let sms = null;
  if (driver.phone) {
    sms = await sendSms(env, {
      to: driver.phone,
      body: `Añejo: you're scheduled ${shiftDate} ${start}–${end}${label ? ` (${label})` : ''}. Open the HUB.`,
    });
  }
  await postDriverNote(env, ctx, driver,
    `New shift scheduled: ${shiftDate} ${start}–${end}${label ? ` — ${label}` : ''}.`, t);

  return json({
    ok: true,
    id: sid,
    shift: { id: sid, staff_id: driver.id, shift_date: shiftDate, start_at: startAt, end_at: endAt, label, notes, status: 'scheduled' },
    sms_sent: !!(sms && sms.sent),
    sms_noop: !!(sms && sms.noop),
  });
};
