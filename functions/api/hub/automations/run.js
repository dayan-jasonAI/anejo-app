// /api/hub/automations/run
//   POST { type, date? }  → run an automation now.
//   GET  ?limit=20        → recent agent_runs + last-run-per-type (owner visibility).
// Auth: owner session OR a matching x-cron-key header (env.CRON_KEY) for a scheduled
// trigger. NOTE: Cloudflare Pages Functions have no native cron — a tiny Workers cron (or
// any scheduler) should POST here daily with the X-Cron-Key header. That deploy is an
// owner action (see HUB_BUILD_REPORT). Until then, the owner can run these on demand.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { runAutomation, IMPLEMENTED, PLANNED } from '../../../_lib/automations.js';

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

  const result = await runAutomation(env, type, { date: b.date, triggeredBy });
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
    implemented: IMPLEMENTED,
    planned: PLANNED,
  });
};
