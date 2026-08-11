// /api/hub/marketing/run — the Marketing Expert's daily run of the marketing system.
//   GET                                   → today's run + the check definitions + recent history
//   POST { op:'check', key, result }      → record one check ('ok' | 'issue' | 'skip')
//   POST { op:'submit', note? }           → close today's run (requires every check answered)
//   POST { op:'feedback', title, body, severity? }
//                                         → raise her finding into the OWNER's alerts feed
//
// The marketing desk (owner + marketing) may read and write. The owner is included because he
// has to be able to see the run without impersonating her — and because on any day she is out,
// the run is still his to do.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK, currentStaff } from '../../../_lib/roles.js';
import { id as genId, now, today, parseJson, toJson } from '../../../_lib/hub.js';
import { RUN_CHECKS, CHECK_KEYS, CHECK_RESULTS, normalizeChecks, countIssues, isComplete } from '../../../_lib/marketing_run.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { capture } from '../../../_lib/track.js';

const MAX_NOTE = 2000;
const MAX_TITLE = 160;

// Read today's row without creating one. A GET must never write: the owner opening her desk to
// look at it would otherwise create a run he never did, and "was it checked today" would answer
// yes because someone glanced at the page.
async function loadRun(env, date) {
  try {
    return await env.DB
      .prepare('SELECT id, run_date, staff_id, checks, issues, note, submitted_at, created_at, updated_at FROM marketing_daily_runs WHERE run_date = ?')
      .bind(date)
      .first();
  } catch {
    return null;   // table not migrated yet — the desk still renders, empty
  }
}

function shapeRun(row) {
  if (!row) return null;
  const checks = parseJson(row.checks, {}) || {};
  return {
    run_date: row.run_date,
    checks,
    issues: row.issues || 0,
    note: row.note || null,
    submitted_at: row.submitted_at || null,
    complete: isComplete(checks),
  };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const date = today();
  const row = await loadRun(env, date);

  let history = [];
  try {
    const res = await env.DB
      .prepare('SELECT run_date, issues, note, submitted_at FROM marketing_daily_runs WHERE run_date < ? ORDER BY run_date DESC LIMIT 14')
      .bind(date)
      .all();
    history = (res && res.results) || [];
  } catch { history = []; }

  return json({
    ok: true,
    date,
    checks: RUN_CHECKS,
    run: shapeRun(row) || { run_date: date, checks: {}, issues: 0, note: null, submitted_at: null, complete: false },
    history,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON.'); }
  const op = String((b && b.op) || '');
  const date = today();
  const t = now();
  const staff = await currentStaff(env, request);
  const staffId = (staff && staff.id) || ctx.distinct_id || null;

  if (op === 'feedback') {
    // Her line to the owner. This does not touch the run — a finding is worth sending the moment
    // she has it, not held until the run is closed.
    const title = String((b.title || '')).trim().slice(0, MAX_TITLE);
    const body = String((b.body || '')).trim().slice(0, MAX_NOTE);
    if (!title) return bad('Say what the finding is.');
    const severity = b.severity === 'warning' ? 'warning' : 'info';
    const res = await raiseAlert(env, {
      alert_type: 'marketing_feedback',
      severity,
      title,
      body: body || null,
      team: 'marketing',
      source: 'marketing_desk',
      ref_type: 'marketing_run',
      ref_id: date,
    });
    if (!res || !res.ok) return bad('Could not file that. Try again.', 500);
    await capture(env, { event: 'marketing.feedback_filed', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { severity } });
    return json({ ok: true, filed: true });
  }

  if (op !== 'check' && op !== 'submit') return bad('Unknown op.');

  const existing = await loadRun(env, date);
  const checks = existing ? (parseJson(existing.checks, {}) || {}) : {};

  if (op === 'check') {
    const key = String(b.key || '');
    const result = String(b.result || '');
    if (!CHECK_KEYS.includes(key)) return bad('Unknown check.');
    if (!CHECK_RESULTS.includes(result)) return bad('Result must be ok, issue or skip.');
    checks[key] = result;
  }

  let note = existing ? existing.note : null;
  let submitted_at = existing ? existing.submitted_at : null;

  if (op === 'submit') {
    if (!isComplete(checks)) return bad('Answer every check before closing the run.');
    if (typeof b.note === 'string') note = b.note.trim().slice(0, MAX_NOTE) || null;
    submitted_at = t;
  }

  const clean = normalizeChecks(checks);
  const issues = countIssues(clean);

  if (existing) {
    await env.DB
      .prepare('UPDATE marketing_daily_runs SET staff_id=?, checks=?, issues=?, note=?, submitted_at=?, updated_at=? WHERE run_date=?')
      .bind(staffId, toJson(clean), issues, note, submitted_at, t, date)
      .run();
  } else {
    await env.DB
      .prepare('INSERT INTO marketing_daily_runs (id, run_date, staff_id, checks, issues, note, submitted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(genId('mrun'), date, staffId, toJson(clean), issues, note, submitted_at, t, t)
      .run();
  }

  if (op === 'submit') {
    await capture(env, { event: 'marketing.run_submitted', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { issues } });
    // The owner is told the run happened — and, when she found something, that it found
    // something. A silent green run is not worth an alert; a run with issues always is.
    if (issues > 0) {
      await raiseAlert(env, {
        alert_type: 'marketing_feedback',
        severity: 'warning',
        title: issues + (issues === 1 ? ' issue' : ' issues') + ' on today’s marketing run',
        body: note || 'Open the marketing desk for the detail.',
        team: 'marketing',
        source: 'marketing_desk',
        ref_type: 'marketing_run',
        ref_id: date,
      });
    }
  }

  const row = await loadRun(env, date);
  return json({ ok: true, run: shapeRun(row) });
};
