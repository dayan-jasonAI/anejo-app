// anejo-cron — standalone Workers cron that triggers HUB automations unattended.
// Each cron expression maps to one or more automation types; for each we POST to the
// Pages app's /api/hub/automations/run with the shared X-Cron-Key header (the endpoint
// also accepts an owner session for manual runs). Logs results; NEVER throws — a failed
// automation must not fail the cron invocation.
// Deploy: cd cron && wrangler deploy && wrangler secret put CRON_KEY  (see README.md)
//
// Free-plan note: Cloudflare caps the Workers free plan at 5 cron triggers, so every
// schedule below is already in use. New Phase-5 jobs (D1 backup, reminders-tick) are
// therefore FOLDED into existing slots via EXTRA_ENDPOINTS rather than adding new crons.

// cron expr (UTC) → automation types POSTed to /api/hub/automations/run
const SCHEDULE = {
  '30 1 * * *': ['eod_chase', 'daily_summary'],
  '30 9 * * *': ['route_optimize'],
  '0 18 * * *': ['sentiment_scan', 'ticket_triage'],
  '0 10 * * 1': ['restock_suggest'],
  '0 12 1,15 * *': ['payroll_prep'],
};

// cron expr (UTC) → direct endpoint paths POSTed with the same X-Cron-Key header.
// These target dedicated admin endpoints (not /automations/run), so they ride along
// on existing schedules to stay within the 5-cron free-plan cap.
//   30 9 * * *  = 05:30 ET (EDT) / 04:30 ET (EST) → a morning NY tick so reminders-tick
//                 materializes instances dated to the correct America/New_York day.
//   0 10 * * 1  = Monday 06:00 ET (EDT) → weekly D1 → R2 backup.
const EXTRA_ENDPOINTS = {
  '30 9 * * *': ['/api/hub/admin/reminders-tick'],
  '0 10 * * 1': ['/api/hub/admin/backup'],
};

async function scheduled(event, env) {
  const base = (env.HUB_BASE_URL || 'https://anejocateringco.com').replace(/\/$/, '');
  const key = env.CRON_KEY || '';

  // 1) Automation-type jobs → /api/hub/automations/run { type }
  const types = SCHEDULE[event.cron] || [];
  if (types.length) {
    const url = `${base}/api/hub/automations/run`;
    for (const type of types) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Cron-Key': key },
          body: JSON.stringify({ type }),
        });
        const body = await r.text().catch(() => '');
        console.log(`anejo-cron: ${type} → HTTP ${r.status} ${body.slice(0, 300)}`);
      } catch (e) {
        console.log(`anejo-cron: ${type} failed — ${String(e).slice(0, 300)}`);
      }
    }
  }

  // 2) Direct-endpoint jobs (Phase 5: reminders-tick, D1 backup)
  const paths = EXTRA_ENDPOINTS[event.cron] || [];
  for (const path of paths) {
    try {
      const r = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Cron-Key': key },
        body: '{}',
      });
      const body = await r.text().catch(() => '');
      console.log(`anejo-cron: ${path} → HTTP ${r.status} ${body.slice(0, 300)}`);
    } catch (e) {
      console.log(`anejo-cron: ${path} failed — ${String(e).slice(0, 300)}`);
    }
  }

  if (!types.length && !paths.length) {
    console.log(`anejo-cron: no jobs mapped for cron "${event.cron}"`);
  }
}

export default {
  scheduled,
  fetch: () => new Response('anejo-cron ok'),
};
