// anejo-cron — standalone Workers cron that triggers HUB automations unattended.
// Runs EVERY MINUTE (a single trigger) and dispatches each job when the clock matches its
// schedule. This consolidation (a) frees us from the 5-trigger free-plan cap, and (b) lets
// the route-offer timeout sweep run every minute so an un-answered delivery offer rolls to
// the next driver within ~2 min. Each job POSTs to the Pages app with the X-Cron-Key header.
// NEVER throws — a failed job must not fail the cron invocation.
// Deploy: cd cron && wrangler deploy && wrangler secret put CRON_KEY  (see README.md)

// Schedule (UTC, standard cron min/hour/dom/mon/dow) → automation types → /api/hub/automations/run
const SCHEDULE = {
  '30 1 * * *': ['eod_chase', 'daily_summary'],     // 01:30 UTC — evening ET
  '30 9 * * *': ['route_optimize'],                 // 09:30 UTC — early morning ET
  '0 18 * * *': ['sentiment_scan', 'ticket_triage'],// 18:00 UTC — early afternoon ET
  '0 10 * * 1': ['restock_suggest'],                // Mondays 10:00 UTC
  '0 12 1,15 * *': ['payroll_prep'],                // 1st + 15th 12:00 UTC
};

// Schedule (UTC) → direct admin endpoints POSTed with the X-Cron-Key header.
const EXTRA_ENDPOINTS = {
  '30 9 * * *': ['/api/hub/admin/reminders-tick', '/api/hub/admin/subscriptions-tick', '/api/hub/admin/addons-tick'],
  '0 2 * * *': ['/api/hub/admin/ops-tick'],   // 02:00 UTC ≈ 10pm ET — Añejo Ops nightly forecast + prep + standup + insights
  '30 18 * * *': ['/api/hub/admin/ops-report?type=eod_lunch'],   // ≈ 2:30pm ET — end of lunch service
  '30 0 * * *': ['/api/hub/admin/ops-report?type=eod_dinner'],   // ≈ 8:30pm ET — end of dinner service
  '0 12 * * 0': ['/api/hub/admin/ops-report?type=weekly_summary'], // Sundays ≈ 8am ET — weekly summary
  '0 10 * * 1': ['/api/hub/admin/backup'],
};

// Endpoints POSTed on EVERY minute tick (frequent sweeps).
const EVERY_MINUTE = ['/api/hub/admin/offers-tick'];

// Minimal cron field matcher — supports '*', exact numbers, and comma lists (covers every
// expression above). dom/dow are ANDed here (all our schedules leave one of them '*').
function fieldMatch(field, val) {
  if (field === '*') return true;
  return field.split(',').some((p) => Number(p) === val);
}
function cronMatches(expr, d) {
  const f = expr.split(/\s+/);
  return fieldMatch(f[0], d.getUTCMinutes()) && fieldMatch(f[1], d.getUTCHours()) &&
    fieldMatch(f[2], d.getUTCDate()) && fieldMatch(f[3], d.getUTCMonth() + 1) &&
    fieldMatch(f[4], d.getUTCDay());
}

async function scheduled(event, env) {
  const base = (env.HUB_BASE_URL || 'https://anejocateringco.com').replace(/\/$/, '');
  const key = env.CRON_KEY || '';
  const d = new Date(event.scheduledTime || Date.now());

  const postType = async (type) => {
    try {
      const r = await fetch(`${base}/api/hub/automations/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cron-Key': key }, body: JSON.stringify({ type }),
      });
      console.log(`anejo-cron: ${type} → HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    } catch (e) { console.log(`anejo-cron: ${type} failed — ${String(e).slice(0, 200)}`); }
  };
  const postPath = async (path) => {
    try {
      const r = await fetch(`${base}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cron-Key': key }, body: '{}',
      });
      console.log(`anejo-cron: ${path} → HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`);
    } catch (e) { console.log(`anejo-cron: ${path} failed — ${String(e).slice(0, 200)}`); }
  };

  // Every minute: frequent sweeps (route-offer timeout).
  for (const p of EVERY_MINUTE) await postPath(p);

  // Time-matched jobs.
  for (const [expr, types] of Object.entries(SCHEDULE)) {
    if (cronMatches(expr, d)) for (const t of types) await postType(t);
  }
  for (const [expr, paths] of Object.entries(EXTRA_ENDPOINTS)) {
    if (cronMatches(expr, d)) for (const p of paths) await postPath(p);
  }
}

export default {
  scheduled,
  fetch: () => new Response('anejo-cron ok'),
};
