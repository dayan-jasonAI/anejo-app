// POST /api/hub/admin/reminders-tick
//   Materializes concrete reminder instances from recurring TEMPLATE rows
//   (reminders.is_template = 1). For each active template whose recurrence is due
//   "today" (America/New_York) and that has not already been materialized today
//   (last_materialized_date guard → idempotent), inserts one concrete instance
//   (is_template=0, parent_id=template.id) and stamps the template's
//   last_materialized_date = today.
//
// Auth: owner session OR an X-Cron-Key header matching env.CRON_KEY (constant-time).
//   Cloudflare Pages Functions have no native cron — the integrator's Workers cron
//   should POST here daily (~05:00 America/New_York) with the X-Cron-Key header.
//
// NEVER deletes/updates anything except: insert new instances + stamp the template's
// last_materialized_date. Recurrence JSON shape: { freq:'daily'|'weekly', at:'HH:MM', dow?:0-6 }.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { id as genId, now, today, parseJson } from '../../../_lib/hub.js';

// Constant-time string compare so the cron-key check can't be timing-probed.
function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

// Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD in the given tz.
function dowFor(dateStr, tz = 'America/New_York') {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(dateStr + 'T12:00:00Z'));
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
  } catch {
    return new Date(dateStr + 'T12:00:00Z').getUTCDay();
  }
}

// Unix ms for `${dateStr} ${HH:MM}` interpreted in America/New_York.
// Approximates the zone offset via the Intl longOffset format (e.g. "GMT-04:00").
function dueAtFor(dateStr, hhmm, tz = 'America/New_York') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '09:00'));
  const hh = m ? Math.min(23, parseInt(m[1], 10)) : 9;
  const mm = m ? Math.min(59, parseInt(m[2], 10)) : 0;
  let offMin = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(dateStr + 'T12:00:00Z'));
    const tzn = (parts.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT+00:00';
    const om = /GMT([+-])(\d{2}):?(\d{2})/.exec(tzn);
    if (om) {
      const sign = om[1] === '-' ? -1 : 1;
      offMin = sign * (parseInt(om[2], 10) * 60 + parseInt(om[3], 10));
    }
  } catch { /* default to UTC offset 0 */ }
  // Local wall time → UTC ms: UTC = local - offset.
  const baseUtc = Date.parse(dateStr + 'T00:00:00Z');
  return baseUtc + (hh * 60 + mm - offMin) * 60 * 1000;
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);

  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }

  const tz = 'America/New_York';
  const day = today(tz);
  const todayDow = dowFor(day, tz);
  const ts = now();

  // Active templates that have NOT already spawned an instance for `day`.
  const { results } = await env.DB.prepare(
    `SELECT * FROM reminders
       WHERE is_template = 1
         AND (last_materialized_date IS NULL OR last_materialized_date != ?)
       ORDER BY created_at ASC`
  ).bind(day).all();

  let created = 0;
  for (const tpl of (results || [])) {
    const rec = parseJson(tpl.recurrence, null) || {};
    const freq = (rec.freq || '').toString();
    if (freq !== 'daily' && freq !== 'weekly') continue;
    if (freq === 'weekly') {
      const dow = Number(rec.dow);
      if (!Number.isInteger(dow) || dow !== todayDow) continue;
    }

    const at = (rec.at || '09:00').toString();
    const due = dueAtFor(day, at, tz);
    const rid = genId('rem');

    // Insert a concrete instance — copy title/body/team/type from the template.
    await env.DB.prepare(
      'INSERT INTO reminders (id, reminder_type, title, body, team, target_staff_id, due_at, ' +
      'is_template, parent_id, acknowledged, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)'
    ).bind(
      rid, tpl.reminder_type, tpl.title, tpl.body, tpl.team, tpl.target_staff_id || null,
      due, tpl.id, ts, ts
    ).run();

    // Stamp the template so a re-run today is a no-op (idempotent).
    await env.DB.prepare(
      'UPDATE reminders SET last_materialized_date = ?, updated_at = ? WHERE id = ?'
    ).bind(day, ts, tpl.id).run();

    created += 1;
  }

  return json({ ok: true, created, date: day });
};
