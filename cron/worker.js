// anejo-cron — standalone Workers cron that triggers HUB automations unattended.
// Each cron expression maps to one or more automation types; for each we POST to the
// Pages app's /api/hub/automations/run with the shared X-Cron-Key header (the endpoint
// also accepts an owner session for manual runs). Logs results; NEVER throws — a failed
// automation must not fail the cron invocation.
// Deploy: cd cron && wrangler deploy && wrangler secret put CRON_KEY  (see README.md)

const SCHEDULE = {
  '30 1 * * *': ['eod_chase', 'daily_summary'],
  '30 9 * * *': ['route_optimize'],
  '0 18 * * *': ['sentiment_scan', 'ticket_triage'],
  '0 10 * * 1': ['restock_suggest'],
  '0 12 1,15 * *': ['payroll_prep'],
};

async function scheduled(event, env) {
  const types = SCHEDULE[event.cron] || [];
  if (!types.length) {
    console.log(`anejo-cron: no automations mapped for cron "${event.cron}"`);
    return;
  }
  const base = (env.HUB_BASE_URL || 'https://anejocateringco.com').replace(/\/$/, '');
  const url = `${base}/api/hub/automations/run`;

  for (const type of types) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Key': env.CRON_KEY || '' },
        body: JSON.stringify({ type }),
      });
      const body = await r.text().catch(() => '');
      console.log(`anejo-cron: ${type} → HTTP ${r.status} ${body.slice(0, 300)}`);
    } catch (e) {
      console.log(`anejo-cron: ${type} failed — ${String(e).slice(0, 300)}`);
    }
  }
}

export default {
  scheduled,
  fetch: () => new Response('anejo-cron ok'),
};
