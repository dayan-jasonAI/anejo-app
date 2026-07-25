// /api/hub/automations/run
//   POST { type, date? }  → run an automation now (also the retry path — a retry is simply
//                           the same job run again on CURRENT data, not a replay of the
//                           original input, which agent_runs does not retain in full).
//   GET  ?limit=20        → recent agent_runs + last-run-per-type (owner visibility).
//                           Rows may carry outcome 'running' (in flight) or 'stuck' (started,
//                           never reported back) — see claimRun/sweepStuck below.
// Auth: owner session OR a matching x-cron-key header (env.CRON_KEY) for a scheduled
// trigger. NOTE: Cloudflare Pages Functions have no native cron — a tiny Workers cron (or
// any scheduler) should POST here daily with the X-Cron-Key header. That deploy is an
// owner action (see HUB_BUILD_REPORT). Until then, the owner can run these on demand.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { runAutomation, IMPLEMENTED, PLANNED } from '../../../_lib/automations.js';

// A run is only "in flight" for as long as a request can plausibly still be alive. Past this
// the placeholder below can never be closed by anyone, so it is a dead job, not a slow one.
const STUCK_AFTER_MS = 10 * 60 * 1000;

// LIVE STATE. runAutomation() writes its agent_runs row only AFTER the job finishes, so a
// hung job was indistinguishable from one that never started. That writer is not ours to
// change, so this route claims a placeholder row up front (outcome='running') and deletes it
// once the real row lands. If the worker dies mid-run the placeholder survives — which is
// exactly the signal the owner needs: "started, never reported back".
// Best-effort throughout: bookkeeping must never stop the actual automation from running.
async function claimRun(env, type, { date, triggeredBy }) {
  const runId = id('run');
  const started = now();
  try {
    await env.DB
      .prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, started_at, created_at) ' +
        "VALUES (?,?,?,'running','system',?,?,?)"
      )
      .bind(runId, type, type, JSON.stringify({ date: date || null, triggered_by: triggeredBy, placeholder: true }), started, started)
      .run();
    return runId;
  } catch { return null; }
}

async function releaseRun(env, runId) {
  if (!runId) return;
  // Guarded on outcome so a sweep that already reclassified this row as 'stuck' keeps its
  // verdict (the owner has likely already seen and acted on it).
  try { await env.DB.prepare("DELETE FROM agent_runs WHERE id=? AND outcome='running'").bind(runId).run(); } catch { /* best-effort */ }
}

// Abandoned placeholders become a terminal 'stuck' outcome — a real, actionable failure with
// an error the owner can read, rather than a spinner that never resolves. ('stuck' extends
// the success|partial|failed vocabulary in agent_runs; the column has no CHECK constraint.)
async function sweepStuck(env) {
  const t = now();
  try {
    await env.DB
      .prepare("UPDATE agent_runs SET outcome='stuck', error=COALESCE(error,?), finished_at=? WHERE outcome='running' AND started_at < ?")
      .bind('Run started but never reported completion — the worker stopped or timed out.', t, t - STUCK_AFTER_MS)
      .run();
  } catch { /* best-effort */ }
}

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

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  let triggeredBy = 'cron';
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
    triggeredBy = 'owner';
  }
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const type = (b && b.type || '').trim();
  if (!type) return bad('Missing automation type. Implemented: ' + IMPLEMENTED.join(', '));

  await sweepStuck(env);
  const runId = await claimRun(env, type, { date: b.date, triggeredBy });
  let result;
  try {
    result = await runAutomation(env, type, { date: b.date, triggeredBy });
  } finally {
    // Always drop the placeholder: runAutomation logs its own row on completion, and an
    // unimplemented type logs nothing at all.
    await releaseRun(env, runId);
  }
  if (!result.ok && result.error === 'not_implemented') {
    return json({ ok: false, error: 'Not implemented yet.', type, planned: PLANNED.includes(type), implemented: IMPLEMENTED }, 501);
  }
  return json(result);
};

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const limit = Math.min(50, parseInt(new URL(request.url).searchParams.get('limit') || '20', 10) || 20);
  // Sweeping on the read path is deliberate: a job that died is most often discovered by the
  // owner opening this panel, and without it a dead placeholder would keep reporting itself as
  // "running" until someone happened to POST. The write only touches rows that are already
  // abandoned by definition, so it is idempotent and cannot disturb a live run.
  await sweepStuck(env);
  const res = await env.DB
    .prepare('SELECT id, automation_type, outcome, duration_ms, tokens, started_at, finished_at, error FROM agent_runs ORDER BY started_at DESC LIMIT ?')
    .bind(limit)
    .all();
  // Last run per automation type — powers the Schedule health panel. Without it a dead cron
  // worker is invisible: "Recent runs" just quietly stops growing and the HUB looks normal.
  // SQLite's bare-column rule returns outcome/error from the same row as MAX(started_at).
  const last = await env.DB
    .prepare('SELECT automation_type, MAX(started_at) AS last_started, outcome AS last_outcome, error AS last_error, COUNT(*) AS run_count FROM agent_runs WHERE automation_type IS NOT NULL GROUP BY automation_type')
    .all();
  return json({
    ok: true,
    runs: (res && res.results) || [],
    last_runs: (last && last.results) || [],
    server_now: Date.now(),   // staleness is judged against server time, not a skewed client clock
    stuck_after_ms: STUCK_AFTER_MS,  // shared threshold so the panel and the sweep agree
    implemented: IMPLEMENTED,
    planned: PLANNED,
  });
};
