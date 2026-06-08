// Añejo HUB — AI automation engine. Each automation is a pure-ish function that reads
// ops data and produces an outcome; the runner wraps it with timing, agent_runs logging,
// and tracking-plan events (automation.run + agent_task.completed). Best-effort + guarded.
// Files under functions/_lib are NOT routed.
import { id, now, today, toJson } from './hub.js';
import { captureSystem } from './track.js';
import { raiseAlert } from './alerts.js';

const MODEL = 'claude-sonnet-4-6';
export const IMPLEMENTED = ['daily_summary', 'eod_chase'];
export const PLANNED = ['restock_suggest', 'route_optimize', 'ticket_triage', 'sentiment_scan', 'payroll_prep'];

async function scalar(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).first();
    if (!r) return 0;
    const k = Object.keys(r)[0];
    return Number(r[k]) || 0;
  } catch { return 0; }
}

// --- EOD CHASE: flag active kitchen/driver staff with no EOD report for the date. ---
async function eodChase(env, date) {
  const expRes = await env.DB
    .prepare("SELECT id, name, role, team FROM staff WHERE active=1 AND role IN ('kitchen','driver')")
    .all();
  const expected = (expRes && expRes.results) || [];
  const repRes = await env.DB
    .prepare('SELECT staff_id FROM eod_reports WHERE report_date=?')
    .bind(date)
    .all();
  const filed = new Set(((repRes && repRes.results) || []).map((r) => r.staff_id));
  const missing = expected.filter((s) => !filed.has(s.id));

  for (const s of missing) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'warning',
      title: 'End-of-day report missing',
      body: `${s.name || s.id} (${s.role}) has not filed an EOD for ${date}.`,
      team: s.team || null,
      ref_type: 'eod_report', ref_id: s.id,
      source: 'automation',
      dedupe_key: `eod_missing:${s.id}:${date}`,
    });
  }
  return {
    outcome: 'success',
    output: { date, expected: expected.length, missing: missing.length, missing_staff: missing.map((m) => m.name || m.id) },
    summary: `EOD chase for ${date}: ${missing.length} of ${expected.length} reports missing.`,
  };
}

// --- DAILY SUMMARY: snapshot the day; optional AI narrative; alert if compliance low. ---
async function dailySummary(env, date) {
  const ordersOpen = await scalar(env, "SELECT COUNT(*) n FROM orders WHERE status IN ('pending','paid')");
  const onShift = await scalar(env, "SELECT COUNT(*) n FROM shifts WHERE status='open'");
  const openAlerts = await scalar(env, "SELECT COUNT(*) n FROM alerts WHERE status='open'");
  const expensesPending = await scalar(env, "SELECT COUNT(*) n FROM expenses WHERE status='pending'");
  const expected = await scalar(env, "SELECT COUNT(*) n FROM staff WHERE active=1 AND role IN ('kitchen','driver')");
  const filed = await scalar(env, 'SELECT COUNT(*) n FROM eod_reports WHERE report_date=?', date);
  const pct = expected ? Math.round((filed / expected) * 100) : null;

  const stats = { date, orders_open: ordersOpen, on_shift: onShift, open_alerts: openAlerts, expenses_pending: expensesPending, eod_filed: filed, eod_expected: expected, eod_pct: pct };

  let narrative = `Daily summary for ${date}: ${ordersOpen} open orders, ${onShift} on shift, ` +
    `${filed}/${expected} EOD reports filed${pct != null ? ` (${pct}%)` : ''}, ` +
    `${openAlerts} open alerts, ${expensesPending} expenses awaiting review.`;
  let tokens = null;

  // Optional AI polish — fully guarded; deterministic narrative stands if it fails.
  if (env.ANTHROPIC_API_KEY) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 220,
          system: 'You are the operations chief of staff for Añejo Catering Co. Write a crisp 2-3 sentence end-of-day briefing for the owner from the JSON stats. Be specific, flag anything that needs attention, no fluff.',
          messages: [{ role: 'user', content: JSON.stringify(stats) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = (j.content && j.content[0] && j.content[0].text || '').trim();
        if (text) narrative = text;
        if (j.usage) tokens = (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0);
      }
    } catch { /* keep deterministic narrative */ }
  }

  // Low-compliance nudge for the owner (end of day).
  if (pct != null && pct < 80) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'info',
      title: 'EOD compliance low',
      body: `${pct}% of EOD reports filed for ${date}.`,
      team: null, source: 'automation',
      dedupe_key: `eod_compliance_low:${date}`,
    });
  }

  return { outcome: 'success', output: { ...stats, narrative }, summary: narrative, tokens };
}

const RUNNERS = { daily_summary: dailySummary, eod_chase: eodChase };

// Public runner: times, logs agent_runs, fires automation.run + agent_task.completed.
export async function runAutomation(env, type, opts = {}) {
  if (!env || !env.DB) return { ok: false, error: 'no_db' };
  const date = opts.date || today();
  const runner = RUNNERS[type];
  if (!runner) {
    return { ok: false, error: 'not_implemented', type, planned: PLANNED.includes(type) };
  }

  const started = now();
  let result, outcome = 'success', errMsg = null;
  try {
    result = await runner(env, date);
    outcome = result.outcome || 'success';
  } catch (e) {
    outcome = 'failed';
    errMsg = String(e && e.message || e).slice(0, 500);
    result = { output: null, summary: 'Automation failed.' };
  }
  const finished = now();
  const duration = finished - started;

  // Log the agent run (best-effort).
  try {
    await env.DB
      .prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
      )
      .bind(id('run'), type, type, outcome, toJson({ date, triggered_by: opts.triggeredBy || 'manual' }),
        toJson(result.output || null), duration, result.tokens || null, errMsg, started, finished, started)
      .run();
  } catch { /* best-effort */ }

  // Tracking-plan events.
  await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: type, outcome } });
  await captureSystem(env, { event: 'agent_task.completed', role: 'system', properties: { task_type: type, duration_ms: duration, tokens: result.tokens || undefined } });

  return { ok: outcome !== 'failed', type, date, outcome, duration_ms: duration, summary: result.summary, output: result.output, error: errMsg };
}
