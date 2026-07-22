// Kitchen end-of-day report.
//   GET  /api/hub/kitchen/eod/submit?draft=1 → AI pre-draft from today's activity (graceful demo)
//   GET  /api/hub/kitchen/eod/submit         → today's existing report (if any)
//   POST /api/hub/kitchen/eod/submit         → submit/upsert the report
//        body: { summary, structured?{}, has_blockers?, blockers?, on_time?, ai_drafted? }
// Fires eod_report.submitted.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, today, toJson, bit } from '../../../../_lib/hub.js';

const MODEL = 'claude-sonnet-4-6';

async function gatherStats(env, day, staffId) {
  const since = new Date(`${day}T00:00:00`).getTime();
  const out = {};
  try {
    const orders = await env.DB.prepare(
      // PAYMENT GATE: unpaid checkouts ('pending') don't count as kitchen orders.
      "SELECT COUNT(*) AS n FROM orders WHERE delivery_date = ? AND status NOT IN ('canceled','pending')"
    ).bind(day).first();
    out.orders_today = orders ? orders.n : 0;
    const ready = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE delivery_date = ? AND status IN ('ready','fulfilled')"
    ).bind(day).first();
    out.orders_ready = ready ? ready.n : 0;
    const checks = await env.DB.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(items_failed),0) AS f FROM checklist_runs WHERE created_at >= ? AND team = 'kitchen'"
    ).bind(since).first();
    out.checklists_completed = checks ? checks.n : 0;
    out.checklist_items_failed = checks ? checks.f : 0;
  } catch { /* best-effort */ }
  return out;
}

async function aiDraft(env, day, stats) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const sys = 'You write a brief, professional kitchen end-of-day report for Añejo Catering Co. Given the day\'s stats, write 3-5 plain sentences covering throughput, quality, and anything to flag. First person plural ("we"). No markdown.';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: sys, messages: [{ role: 'user', content: `Date ${day}. Stats: ${JSON.stringify(stats)}. Write the EOD summary.` }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data.content || []).map((c) => c.text || '').join('').trim() || null;
  } catch { return null; }
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  const url = new URL(request.url);
  const day = url.searchParams.get('date') || today();

  if (url.searchParams.get('draft') === '1') {
    const stats = await gatherStats(env, day, staff.id);
    const drafted = await aiDraft(env, day, stats);
    if (drafted) return json({ ok: true, demo: false, draft: drafted, stats });
    const demo = `Kitchen EOD ${day}: we handled ${stats.orders_today || 0} orders, with ${stats.orders_ready || 0} marked ready and ${stats.checklists_completed || 0} checklists completed. (Demo draft — connect ANTHROPIC_API_KEY for a full AI summary.)`;
    return json({ ok: true, demo: true, draft: demo, stats });
  }

  const existing = await env.DB.prepare(
    'SELECT * FROM eod_reports WHERE staff_id = ? AND report_date = ?'
  ).bind(staff.id, day).first();
  return json({ report: existing || null, date: day });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const summary = (b && b.summary || '').toString().trim();
  if (!summary) return bad('Summary is required.');

  const day = (b && b.date) || today();
  const ts = now();
  const hasBlockers = !!(b && b.has_blockers);
  const onTime = b && b.on_time === false ? 0 : 1;
  const aiDrafted = !!(b && b.ai_drafted);

  // Link the current/most-recent shift for context.
  const shift = await env.DB.prepare(
    'SELECT id FROM shifts WHERE staff_id = ? ORDER BY clock_in_at DESC LIMIT 1'
  ).bind(staff.id).first();

  // Upsert on (staff_id, report_date).
  await env.DB.prepare(
    `INSERT INTO eod_reports (id, staff_id, report_date, role, shift_id, summary, structured, has_blockers, blockers, on_time, ai_drafted, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(staff_id, report_date) DO UPDATE SET
       summary = excluded.summary,
       structured = excluded.structured,
       has_blockers = excluded.has_blockers,
       blockers = excluded.blockers,
       on_time = excluded.on_time,
       ai_drafted = excluded.ai_drafted,
       status = 'submitted',
       updated_at = excluded.updated_at`
  ).bind(
    id('eod'), staff.id, day, 'kitchen', shift ? shift.id : null, summary,
    toJson((b && b.structured) || null), bit(hasBlockers), (b && b.blockers) || null,
    onTime, bit(aiDrafted), 'submitted', ts, ts
  ).run();

  await capture(env, {
    event: 'eod_report.submitted',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { role: 'kitchen', on_time: !!onTime, has_blockers: hasBlockers, ai_drafted: aiDrafted },
  });

  // Filed it → close the owner's "EOD missing" nag for this person/day.
  try {
    await env.DB.prepare("UPDATE alerts SET status='acknowledged', acknowledged_at=?, updated_at=? WHERE dedupe_key=? AND status='open'")
      .bind(now(), now(), `eod_missing:${staff.id}:${day}`).run();
  } catch { /* best-effort */ }

  const report = await env.DB.prepare(
    'SELECT * FROM eod_reports WHERE staff_id = ? AND report_date = ?'
  ).bind(staff.id, day).first();
  return json({ ok: true, report });
};
