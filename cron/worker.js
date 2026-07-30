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
  // Sundays 14:00 UTC ≈ 10am ET — draft the coming week's Instagram posts from the LIVE menu.
  // Weekly, not daily: a planner that tops the queue up every morning becomes a backlog nobody
  // reads. It only drafts; nothing reaches the profile without a human approving it.
  '0 14 * * 0': ['social_plan'],
};

// Schedule (UTC) → direct admin endpoints POSTed with the X-Cron-Key header.
const EXTRA_ENDPOINTS = {
  '30 9 * * *': ['/api/hub/admin/reminders-tick', '/api/hub/admin/subscriptions-tick', '/api/hub/admin/addons-tick'],
  '0 2 * * *': ['/api/hub/admin/ops-tick'],   // 02:00 UTC ≈ 10pm ET — Añejo Ops nightly forecast + prep + standup + insights
  '30 18 * * *': ['/api/hub/admin/ops-report?type=eod_lunch'],   // ≈ 2:30pm ET — end of lunch service
  '30 0 * * *': ['/api/hub/admin/ops-report?type=eod_dinner'],   // ≈ 8:30pm ET — end of dinner service
  '0 12 * * 0': ['/api/hub/admin/ops-report?type=weekly_summary'], // Sundays ≈ 8am ET — weekly summary
  '0 10 * * 1': ['/api/hub/admin/backup'],
  // Contract cutoff check — "has every site sent today's lunch count?" — fired a few minutes
  // BEFORE the 09:15 cutoff, while there is still time to send one text.
  //
  // TWO UTC hours on purpose: 13:03 is 09:03 ET in summer (EDT), 14:03 is 09:03 ET in winter
  // (EST). The endpoint checks the ET clock itself and no-ops outside the pre-cutoff window, so
  // exactly one of these does real work on any given day and the check never drifts across a
  // daylight-saving change. For a deadline-driven job that drift is the difference between
  // useful and actively misleading.
  '3 13 * * 1,2,3,4,5': ['/api/hub/admin/cutoff-check'],
  '3 14 * * 1,2,3,4,5': ['/api/hub/admin/cutoff-check'],
};

// Endpoints POSTed on EVERY minute tick (frequent sweeps).
//
// campaigns-tick sends any campaign whose scheduled time has arrived, and resumes any that is
// mid-send — a list bigger than one tick's budget sits at 'sending' with rows still queued, and
// without a resume it would stall there. Every-minute matters for a different reason than the
// offer sweep: a campaign scheduled for 08:00 that goes out at 08:00 is the feature; one that
// goes out at 08:45 because the sweep is hourly is not what anyone meant by "schedule".
// social-tick publishes posts whose scheduled time has arrived. Every minute for the same reason
// as campaigns: a post set for 11:00 that goes out at 11:45 is not what anyone meant by scheduled,
// and on a public profile the timing IS part of the post.
const EVERY_MINUTE = ['/api/hub/admin/offers-tick', '/api/hub/admin/campaigns-tick', '/api/hub/admin/social-tick'];

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
