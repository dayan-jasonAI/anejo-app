// POST /api/hub/admin/sales-tick?job=discovery|enrich|followup|send|metrics
// Auth: the X-Cron-Key header (the anejo-cron Worker) OR a signed-in owner — same as every tick.
//
// Each job checks its own feature flag first and no-ops in one settings read when it is off, which
// is the production default for every job but metrics. Scheduling this therefore changes nothing
// until Dayan turns a job on in Sales → Settings.
//
//   discovery — daily; bounded by sales.max_new_prospects_per_day and sales.max_discovery_calls_per_day
//   enrich    — hourly; a few organizations per tick (website read + score)
//   followup  — daily; DRAFTS due follow-ups into the approval queue (never sends)
//   send      — hourly; sends only owner-APPROVED emails, in business hours, under the daily cap
//   metrics   — nightly; funnel snapshot into agent_runs
import { json, bad, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { loadSalesConfig } from '../../../_lib/sales/config.js';
import { runSalesJob, JOBS } from '../../../_lib/sales/jobs.js';

export const onRequestPost = async ({ request, env }) => {
  const viaCron = !!(env.CRON_KEY && ctEq(request.headers.get('x-cron-key') || '', env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);
  const job = new URL(request.url).searchParams.get('job') || '';
  if (!JOBS.includes(job)) return bad(`Unknown job. Use one of: ${JOBS.join(', ')}.`);
  const cfg = await loadSalesConfig(env);
  const r = await runSalesJob(env, job, { cfg, triggeredBy: viaCron ? 'cron' : 'owner' });
  return json(r, r.ok ? 200 : 500);
};
