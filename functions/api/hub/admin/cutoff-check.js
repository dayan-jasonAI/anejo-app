// POST /api/hub/admin/cutoff-check — "has every contract site sent today's headcount yet?"
//
// This is the highest-frequency operational question Añejo has: DGP's two clinics submit a count
// before their 09:15 cutoff on the days THEY order — mon/tue/wed as of 2026-07-29, not that it
// matters here, because this reads each site's own delivery_days and never assumes a week shape.
// (An earlier version of this comment said "five days a week" and the code defaulted to Mon–Fri;
// both were wrong, and a wrong default here texts a clinic on a day they do not order.)
// Miss the cutoff and the order goes in as a rush — a worse morning for the kitchen and, until the
// fees were corrected, a charge the client never approved.
//
// Today the owner finds out AFTER it is late. This runs a few minutes BEFORE the cutoff and says
// who is missing while there is still time to send one text.
//
// Auth: owner session OR X-Cron-Key (same contract as ops-tick).
// DST-safe by design: the cron fires at two UTC hours (one for EDT, one for EST) and this endpoint
// decides whether the ET clock is actually inside the pre-cutoff window. Exactly one is meaningful
// on any given day, so no drift twice a year and no double-alerting.
import { json, bad, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { captureSystem } from '../../../_lib/track.js';
import { parseDeliveryDays } from '../../../_lib/contract.js';

// How long before a site's cutoff we want to be told. Long enough to text someone and have them
// act; short enough that they have plausibly had time to send it.
const LEAD_MINUTES = 12;

function etNow(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: p.weekday,
    clock: `${p.hour}:${p.minute}`,
  };
}

const cutoffMinutes = (s) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '09:00'));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
};

export const onRequestPost = async ({ request, env }) => {
  const key = request.headers.get('x-cron-key');
  const viaCron = !!(env.CRON_KEY && key && ctEq(key, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);

  const t = etNow();
  const url = new URL(request.url);
  // ?force=1 lets the owner ask "who's missing right now?" from the HUB at any hour.
  const force = url.searchParams.get('force') === '1';

  let sites = [];
  try {
    const r = await env.DB.prepare(
      `SELECT s.id, s.name, s.cutoff_time, s.delivery_days, s.contact_name, s.contact_phone,
              a.name AS account
         FROM contract_sites s LEFT JOIN contract_accounts a ON a.id = s.account_id
        WHERE s.active = 1`
    ).all();
    sites = (r && r.results) || [];
  } catch { sites = []; }

  const missing = [];
  const checked = [];
  // Sites we skipped because nobody told us when they order — a config gap, surfaced rather than
  // guessed around.
  const unconfigured = [];

  for (const s of sites) {
    // Only sites that actually deliver today.
    //
    // This read the column as a CSV of NUMBERS ('1,2,3,4,5'). It is written as a CSV of day NAMES
    // ('mon,tue,wed') everywhere it is produced, and Number('mon') is NaN — so `days.includes(dow)`
    // was false for every site on every day and this loop `continue`d past all of them. The whole
    // pre-cutoff reminder has therefore never fired once in production: it reported "0 missing"
    // every morning, which reads exactly like "everybody submitted".
    const today = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(t.weekday)
    ];
    // NEVER GUESS A CLIENT'S DELIVERY DAYS.
    //
    // This defaulted to Mon–Fri when the column was empty, which meant a misconfigured site would
    // text its office contact "we haven't got your head count yet" on a day they never order. A
    // wrong reminder to a client is worse than a missing one: it makes them doubt every reminder
    // after it. DGP is mon,tue,wed — nothing here should be able to invent Thursday for them.
    //
    // No days configured => we do not know when they order => stay silent and let it surface as a
    // gap in the desk, not as a text to the customer.
    const days = parseDeliveryDays(s.delivery_days);
    if (!days.length) { unconfigured.push(s.name); continue; }
    if (!today || !days.includes(today)) continue;

    const cut = cutoffMinutes(s.cutoff_time);
    const inWindow = t.minutes >= cut - LEAD_MINUTES && t.minutes < cut;
    if (!force && !inWindow) continue;

    checked.push(s.name);
    let existing = null;
    try {
      existing = await env.DB.prepare(
        'SELECT headcount FROM contract_orders WHERE site_id = ? AND service_date = ?'
      ).bind(s.id, t.date).first();
    } catch { existing = null; }

    if (!existing) {
      missing.push({
        site: s.name,
        account: s.account || '',
        contact: s.contact_name || null,
        phone: s.contact_phone || null,
        cutoff: s.cutoff_time || '09:00',
        minutes_left: cut - t.minutes,
      });
    }
  }

  // Alert only when there is something to do AND we are in the real pre-cutoff window. A forced
  // check from the HUB is the owner looking; it should not raise an alert for them to dismiss.
  if (missing.length && !force) {
    for (const m of missing) {
      try {
        await raiseAlert(env, {
          alert_type: 'delivery_failed', severity: 'warning',
          // Per site per day: re-running the cron must not stack duplicates.
          dedupe_key: `cutoff_missing:${m.site}:${t.date}`,
          title: `${m.site} has not sent today's lunch count`,
          body: `${m.account || 'Contract site'} — cutoff is ${m.cutoff} (${m.minutes_left} min away). `
            + `${m.contact ? m.contact + ' ' : ''}${m.phone ? '· ' + m.phone + ' ' : ''}`
            + `— a count after the cutoff goes in as a rush.`,
          ref_type: 'contract_site', ref_id: m.site,
        });
      } catch (_) { /* an alert failing must not hide the rest of the result */ }
    }
    await captureSystem(env, {
      event: 'contract.cutoff_missing',
      properties: { date: t.date, missing: missing.map((m) => m.site), count: missing.length },
    });
  }

  return json({
    ok: true,
    et_clock: t.clock,
    date: t.date,
    weekday: t.weekday,
    in_window: checked.length > 0,
    checked,
    missing,
    unconfigured,
    // Says plainly why nothing was checked, instead of an empty result that reads like "all good".
    note: checked.length
      ? (missing.length ? `${missing.length} site(s) still missing` : 'All delivering sites have submitted')
      : 'No site is inside its pre-cutoff window right now (or none deliver today)',
    // Never silently absorbed: a site with no delivery days set will never be reminded, and the
    // only way anyone finds out is if this says so.
    ...(unconfigured.length ? { warning: `${unconfigured.length} site(s) have no delivery days set and were skipped: ${unconfigured.join(', ')}` } : {}),
  });
};
