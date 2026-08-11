// /api/hub/marketing/session — the marketing desk's time trace and end-of-session report.
//   POST { op:'ping' }     → open a session if none is live, otherwise accrue active time
//   POST { op:'report', work_done, obstacles, good_news, bad_news, feedback }
//                          → close the session and send the update to the owner
//   GET                    → the live session (if any) + today's total + recent sessions
//
// NOT a timeclock. There is no clock-in button and no shift row; the session opens by itself the
// first time she touches the desk. What is recorded is ENGAGED time, accrued from heartbeats —
// see accrue() for why that is different from (ended - started), and why the difference matters.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK, currentStaff } from '../../../_lib/roles.js';
import { id as genId, now, today } from '../../../_lib/hub.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { capture } from '../../../_lib/track.js';

// A heartbeat further apart than this means she walked away — a phone locked, a tab left open
// overnight. The gap contributes ZERO active time rather than the whole interval. Set above the
// client's 60s heartbeat with enough slack for a slow network or a backgrounded tab, and below
// the point where "still at the desk" stops being a fair assumption.
export const IDLE_GAP_MS = 5 * 60 * 1000;

// After this long with no heartbeat, a session is considered abandoned and a new ping starts a
// fresh one rather than resuming. Without it, opening the desk the next morning would silently
// continue yesterday's session and the day boundary would be meaningless.
export const STALE_SESSION_MS = 30 * 60 * 1000;

const MAX_FIELD = 2000;

// The five questions, in the order they are asked. Kept here so the API, the UI and the report
// email cannot disagree about what a session report contains.
export const REPORT_FIELDS = [
  { key: 'work_done', label: 'What you got done' },
  { key: 'obstacles', label: 'What got in the way' },
  { key: 'good_news', label: 'Good news' },
  { key: 'bad_news', label: 'Bad news' },
  { key: 'feedback', label: 'Feedback' },
];

async function liveSession(env, staffId) {
  try {
    return await env.DB
      .prepare('SELECT * FROM marketing_sessions WHERE staff_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
      .bind(staffId)
      .first();
  } catch {
    return null;   // table not migrated yet — the desk still works, it just records nothing
  }
}

// How much engaged time this heartbeat is worth. A gap inside IDLE_GAP_MS counts in full; a
// longer one counts for nothing. This is the whole honesty of the number: a session that shows
// 6h of active time means six hours of heartbeats, not a tab that was never closed.
export function accrue(prevSeenAt, atMs) {
  const gap = atMs - Number(prevSeenAt || 0);
  if (!Number.isFinite(gap) || gap <= 0) return 0;
  if (gap > IDLE_GAP_MS) return 0;
  return Math.round(gap / 1000);
}

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    run_date: row.run_date,
    started_at: row.started_at,
    last_seen_at: row.last_seen_at,
    ended_at: row.ended_at || null,
    active_seconds: row.active_seconds || 0,
    reported_at: row.reported_at || null,
    live: !row.ended_at,
  };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const staff = await currentStaff(env, request);
  const staffId = (staff && staff.id) || ctx.distinct_id || null;
  const date = today();

  const live = await liveSession(env, staffId);

  let recent = [];
  let todaySeconds = 0;
  try {
    const r = await env.DB
      .prepare('SELECT id, run_date, started_at, ended_at, active_seconds, reported_at FROM marketing_sessions WHERE staff_id = ? ORDER BY started_at DESC LIMIT 20')
      .bind(staffId)
      .all();
    recent = (r && r.results) || [];
    todaySeconds = recent
      .filter((s) => s.run_date === date)
      .reduce((n, s) => n + (s.active_seconds || 0), 0);
  } catch { recent = []; }

  return json({
    ok: true,
    date,
    fields: REPORT_FIELDS,
    session: shape(live),
    today_active_seconds: todaySeconds,
    recent,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON.'); }
  const op = String((b && b.op) || '');
  if (op !== 'ping' && op !== 'report') return bad('Unknown op.');

  const staff = await currentStaff(env, request);
  const staffId = (staff && staff.id) || ctx.distinct_id || null;
  const t = now();
  const date = today();

  let live = await liveSession(env, staffId);

  // A session that has not been heard from in STALE_SESSION_MS is closed where it stopped, not
  // where we noticed. Its active_seconds already exclude the silence, so nothing is invented.
  if (live && (t - Number(live.last_seen_at || 0)) > STALE_SESSION_MS) {
    try {
      await env.DB.prepare('UPDATE marketing_sessions SET ended_at=?, updated_at=? WHERE id=?')
        .bind(live.last_seen_at, t, live.id).run();
    } catch { /* best-effort */ }
    live = null;
  }

  if (op === 'ping') {
    if (!live) {
      const sid = genId('msess');
      try {
        await env.DB.prepare(
          'INSERT INTO marketing_sessions (id, staff_id, run_date, started_at, last_seen_at, active_seconds, created_at, updated_at) VALUES (?,?,?,?,?,0,?,?)'
        ).bind(sid, staffId, date, t, t, t, t).run();
      } catch { return json({ ok: true, session: null, recording: false }); }
      await capture(env, { event: 'marketing.session_started', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team });
      live = await liveSession(env, staffId);
      return json({ ok: true, session: shape(live), recording: true });
    }
    const add = accrue(live.last_seen_at, t);
    try {
      await env.DB.prepare('UPDATE marketing_sessions SET last_seen_at=?, active_seconds=active_seconds+?, updated_at=? WHERE id=?')
        .bind(t, add, t, live.id).run();
    } catch { /* best-effort */ }
    live = await liveSession(env, staffId);
    return json({ ok: true, session: shape(live), recording: true });
  }

  // ---- op === 'report' : close the session and send the update to the owner ----
  const vals = {};
  for (const f of REPORT_FIELDS) {
    const v = b[f.key];
    vals[f.key] = typeof v === 'string' ? v.trim().slice(0, MAX_FIELD) || null : null;
  }
  if (!REPORT_FIELDS.some((f) => vals[f.key])) {
    return bad('Write at least one line before sending the update.');
  }

  // Close the session she is reporting on. If there is no live one (she reported after the
  // session went stale), the report still goes to the owner — the point is the update reaching
  // him, not the bookkeeping.
  let seconds = 0;
  if (live) {
    const add = accrue(live.last_seen_at, t);
    seconds = (live.active_seconds || 0) + add;
    try {
      await env.DB.prepare(
        'UPDATE marketing_sessions SET ended_at=?, last_seen_at=?, active_seconds=?, work_done=?, obstacles=?, good_news=?, bad_news=?, feedback=?, reported_at=?, updated_at=? WHERE id=?'
      ).bind(t, t, seconds, vals.work_done, vals.obstacles, vals.good_news, vals.bad_news, vals.feedback, t, t, live.id).run();
    } catch { /* fall through — the alert below is what actually matters */ }
  }

  const mins = Math.round(seconds / 60);
  const lines = REPORT_FIELDS.filter((f) => vals[f.key]).map((f) => `${f.label}: ${vals[f.key]}`);

  // Bad news raises the severity. A session report is normally an FYI; one that carries bad news
  // is something he should look at today, and the feed's colour is how that gets said.
  const severity = vals.bad_news ? 'warning' : 'info';

  await raiseAlert(env, {
    alert_type: 'marketing_session_report',
    severity,
    title: `Marketing update — ${mins} min worked`,
    body: lines.join('\n'),
    team: 'marketing',
    source: 'marketing_desk',
    ref_type: 'marketing_session',
    ref_id: (live && live.id) || date,
  });

  await capture(env, {
    event: 'marketing.session_reported',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { active_minutes: mins, has_bad_news: !!vals.bad_news },
  });

  return json({ ok: true, reported: true, active_seconds: seconds, active_minutes: mins });
};
