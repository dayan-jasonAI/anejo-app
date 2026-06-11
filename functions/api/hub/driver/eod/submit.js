// End-of-day report for drivers.
//   GET  /api/hub/driver/eod/submit?draft=1  → AI pre-draft from today's activity.
//        No-ops gracefully (ai_drafted:false + a built-from-data summary) when
//        ANTHROPIC_API_KEY is absent, so the UI always gets something to edit.
//   POST /api/hub/driver/eod/submit          → persist the (edited) report.
//        Body: { report_date?, summary, structured?, has_blockers?, blockers?, on_time?, ai_drafted? }
//        Upserts on (staff_id, report_date). Fires eod_report.submitted.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, today, toJson } from '../../../../_lib/hub.js';

const MODEL = 'claude-sonnet-4-6';

// Pull a compact picture of the driver's day to feed the draft (and the structured field).
async function gatherDay(env, staffId, date) {
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const dayEnd = dayStart + 86400000;

  const shift = await env.DB
    .prepare('SELECT * FROM shifts WHERE staff_id=? AND clock_in_at>=? AND clock_in_at<? ORDER BY clock_in_at DESC LIMIT 1')
    .bind(staffId, dayStart, dayEnd)
    .first();

  const route = await env.DB
    .prepare('SELECT * FROM routes WHERE driver_id=? AND route_date=? ORDER BY created_at DESC LIMIT 1')
    .bind(staffId, date)
    .first();

  const delTally = await env.DB
    .prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM deliveries WHERE driver_id=? AND created_at>=? AND created_at<?")
    .bind(staffId, dayStart, dayEnd)
    .first();

  const temps = await env.DB
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN in_range=0 THEN 1 ELSE 0 END) AS excursions FROM temp_logs WHERE staff_id=? AND created_at>=? AND created_at<?")
    .bind(staffId, dayStart, dayEnd)
    .first();

  const tickets = await env.DB
    .prepare('SELECT COUNT(*) AS total FROM tickets WHERE created_by=? AND created_at>=? AND created_at<?')
    .bind(staffId, dayStart, dayEnd)
    .first();

  return {
    shift_minutes: shift ? shift.total_minutes : null,
    route_status: route ? route.status : null,
    stops_completed: route ? route.stops_completed : (delTally && delTally.completed) || 0,
    deliveries_completed: (delTally && delTally.completed) || 0,
    deliveries_failed: (delTally && delTally.failed) || 0,
    temp_logs: (temps && temps.total) || 0,
    temp_excursions: (temps && temps.excursions) || 0,
    tickets_created: (tickets && tickets.total) || 0,
  };
}

function fallbackSummary(d) {
  const parts = [];
  parts.push(`Completed ${d.deliveries_completed} deliveries${d.deliveries_failed ? `, ${d.deliveries_failed} failed` : ''}.`);
  if (d.route_status) parts.push(`Route ${d.route_status}.`);
  if (d.shift_minutes != null) parts.push(`On shift ${Math.round(d.shift_minutes / 60 * 10) / 10}h.`);
  parts.push(`${d.temp_logs} temperature checks${d.temp_excursions ? ` (${d.temp_excursions} out of range)` : ''}.`);
  if (d.tickets_created) parts.push(`${d.tickets_created} issue(s) reported.`);
  return parts.join(' ');
}

async function aiDraft(env, day) {
  if (!env.ANTHROPIC_API_KEY) return { summary: fallbackSummary(day), ai_drafted: false };
  const userPrompt =
    'Write a concise, first-person end-of-day report for a catering delivery driver. ' +
    "2-4 sentences, plain and professional. Note anything that needs the owner's attention " +
    '(failed deliveries, temperature excursions, issues). Here is today\'s data as JSON:\n' +
    JSON.stringify(day);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: 'You are an assistant that drafts brief, accurate end-of-day reports for catering drivers. Never invent facts not present in the data.',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!resp.ok) return { summary: fallbackSummary(day), ai_drafted: false };
    const data = await resp.json();
    const text = (data.content || []).map((c) => c.text || '').join('').trim();
    return text ? { summary: text, ai_drafted: true } : { summary: fallbackSummary(day), ai_drafted: false };
  } catch {
    return { summary: fallbackSummary(day), ai_drafted: false };
  }
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  const url = new URL(request.url);
  const date = url.searchParams.get('report_date') || today();
  const day = await gatherDay(env, staff.id, date);

  // Existing report for the day (so the UI can show/edit it).
  const existing = await env.DB
    .prepare('SELECT * FROM eod_reports WHERE staff_id=? AND report_date=?')
    .bind(staff.id, date)
    .first();

  if (!url.searchParams.get('draft')) {
    return json({ report_date: date, structured: day, existing: existing || null });
  }

  const draft = await aiDraft(env, day);
  return json({ report_date: date, structured: day, draft: draft.summary, ai_drafted: draft.ai_drafted, ai_available: !!env.ANTHROPIC_API_KEY, existing: existing || null });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const summary = (b && b.summary || '').toString().trim();
  if (!summary) return bad('summary is required.');

  const date = (b && b.report_date) || today();
  const ts = now();
  const hasBlockers = b && b.has_blockers ? 1 : 0;
  const blockers = (b && b.blockers || '').toString().slice(0, 4000) || null;
  const onTime = b && b.on_time === false ? 0 : 1;
  const aiDrafted = b && b.ai_drafted ? 1 : 0;
  const structured = b && b.structured ? toJson(b.structured) : toJson(await gatherDay(env, staff.id, date));

  // Link the most recent shift for the day if present.
  const dayStart = new Date(`${date}T00:00:00`).getTime();
  const shift = await env.DB
    .prepare('SELECT id FROM shifts WHERE staff_id=? AND clock_in_at>=? AND clock_in_at<? ORDER BY clock_in_at DESC LIMIT 1')
    .bind(staff.id, dayStart, dayStart + 86400000)
    .first();

  const existing = await env.DB
    .prepare('SELECT id FROM eod_reports WHERE staff_id=? AND report_date=?')
    .bind(staff.id, date)
    .first();

  let reportId;
  if (existing) {
    reportId = existing.id;
    await env.DB
      .prepare("UPDATE eod_reports SET role=?, shift_id=?, summary=?, structured=?, has_blockers=?, blockers=?, on_time=?, ai_drafted=?, status='submitted', updated_at=? WHERE id=?")
      .bind(ctx.role, shift ? shift.id : null, summary, structured, hasBlockers, blockers, onTime, aiDrafted, ts, reportId)
      .run();
  } else {
    reportId = id('eod');
    await env.DB
      .prepare('INSERT INTO eod_reports (id, staff_id, report_date, role, shift_id, summary, structured, has_blockers, blockers, on_time, ai_drafted, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(reportId, staff.id, date, ctx.role, shift ? shift.id : null, summary, structured, hasBlockers, blockers, onTime, aiDrafted, 'submitted', ts, ts)
      .run();
  }

  await capture(env, {
    event: 'eod_report.submitted',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { role: ctx.role, on_time: !!onTime, has_blockers: !!hasBlockers, ai_drafted: !!aiDrafted, platform: 'pwa' },
  });

  // Filed it → close the owner's "EOD missing" nag for this person/day.
  try {
    await env.DB.prepare("UPDATE alerts SET status='acknowledged', acknowledged_at=?, updated_at=? WHERE dedupe_key=? AND status='open'")
      .bind(now(), now(), `eod_missing:${staff.id}:${date}`).run();
  } catch { /* best-effort */ }

  return json({ ok: true, report: { id: reportId, report_date: date, status: 'submitted' } });
};
