// /api/hub/automations/run
//   POST { type, date? }  → run an automation now.
//   GET  ?limit=20        → recent agent_runs (owner visibility).
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
  return json({ ok: true, runs: (res && res.results) || [], implemented: IMPLEMENTED, planned: PLANNED });
};
