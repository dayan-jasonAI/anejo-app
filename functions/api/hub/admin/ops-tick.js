// POST /api/hub/admin/ops-tick
//   Añejo Ops nightly run: produce tomorrow's demand forecast + the kitchen prep sheet
//   (per-bowl counts). Numbers are deterministic; logged to agent_runs. Auth: owner session
//   OR X-Cron-Key. Triggered ~10pm ET by the cron worker (time-matched).
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { toJson } from '../../../_lib/hub.js';
import { runDemandForecast, runProductionPlan } from '../../../_lib/ops.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }

  const started = now();
  let forecast = { ok: false };
  let plan = { ok: false };
  try {
    forecast = await runDemandForecast(env, {});
    if (forecast && forecast.ok && forecast.forecast) {
      plan = await runProductionPlan(env, { forecast: forecast.forecast });
    }
  } catch (e) {
    forecast = { ok: false, reason: (e && e.message) || 'error' };
  }
  const finished = now();
  const ok = !!(forecast && forecast.ok);

  // Log to agent_runs (so it shows in AI Ops → Recent runs) + tracking.
  try {
    await env.DB.prepare(
      'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
    ).bind(
      id('run'), 'demand_forecast', 'demand_forecast', ok ? 'success' : 'failed',
      toJson({ trigger: cronAuthed(request, env) ? 'cron' : 'owner' }),
      toJson({ forecast_date: forecast && forecast.date, total: forecast && forecast.forecast && forecast.forecast.total_bowls, prep_total: plan && plan.total_bowls }),
      finished - started, null, ok ? null : (forecast && forecast.reason) || 'failed', started, finished, finished
    ).run();
  } catch { /* best-effort */ }

  try {
    await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: 'demand_forecast', outcome: ok ? 'success' : 'failed' } });
  } catch { /* best-effort */ }

  return json({ ok, forecast, plan });
};
