// Sales OS — the scheduled jobs and the owner's "run it now" buttons, one implementation each.
// Files under functions/_lib are NOT routed.
//
// Every job: (1) checks its flag first and no-ops cheaply when off, (2) runs inside a strict
// batch and time budget sized for a Worker request, (3) is resumable — the next tick continues
// where this one stopped, (4) is idempotent — dedupe keys and UNIQUE indexes make a repeated run
// harmless, and (5) writes an agent_runs row, the same trail every HUB automation leaves.
import { id, now, toJson, etDateOf, etDayBounds } from '../hub.js';
import { captureSystem } from '../track.js';
import { discoverOrganizations, usableDiscoveryProvider } from './discovery.js';
import { crawlOrganization } from './enrich.js';
import { findWebsite } from './sitefind.js';
import { upsertOrganization, addContact, recordSource, scoreAndStore, logActivity, salesRow, salesRows } from './store.js';
import { classifyCategory } from './scoring.js';
import { ICP_CATEGORIES, DISCOVERY_QUERIES, DISCOVERY_AREAS, DISCOVERY_PLAN } from './anejo.js';
import { sendApproved, draftDueFollowups } from './outreach.js';
import { funnel } from './metrics.js';

export const JOBS = ['discovery', 'enrich', 'followup', 'send', 'metrics'];
const TICK_BUDGET_MS = 22000;

async function logRun(env, type, started, outcome, output, error, triggeredBy) {
  const finished = now();
  try {
    await env.DB.prepare(
      'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
      "VALUES (?,?,?,?,'system',?,?,?,NULL,?,?,?,?)"
    ).bind(id('run'), type, type, outcome, toJson({ triggered_by: triggeredBy || 'cron' }), toJson(output || null),
      finished - started, error ? String(error).slice(0, 500) : null, started, finished, started).run();
  } catch { /* best-effort */ }
  await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: type, outcome } });
}

// ---------------------------------------------------------------- enrichment

function emailBelongsTo(email, person) {
  const local = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  const first = String(person.full_name || '').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  const last = String(person.full_name || '').split(/\s+/).slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!local || !last || last.length < 2) return false;
  return local === first + last || local === first[0] + last || local === first + '.' + last || local.includes(last) && local.includes(first[0]);
}

/** Persist one crawl: evidence rows, contacts (never guessed), category, and status. */
export async function applyEnrichment(env, org, crawl, { ctx } = {}) {
  const out = { pages: 0, contacts_added: 0, signals: 0, skipped: (crawl.skipped || []).length };
  for (const pg of crawl.pages || []) {
    await recordSource(env, {
      organization_id: org.id, source_type: 'website_page', source_url: pg.url,
      captured: { signals: pg.signals, emails: pg.emails.map((e) => e.email), phones: pg.phones, people: pg.people.map((p) => ({ full_name: p.full_name, title: p.title })), excerpt: pg.excerpt },
    });
    out.pages++;
    out.signals += pg.signals.length;
  }
  for (const sk of crawl.skipped || []) {
    if (/robots/.test(sk.reason)) await recordSource(env, { organization_id: org.id, source_type: 'robots_block', source_url: sk.url, captured: { reason: sk.reason } });
  }
  // People first, then the addresses — so an address that matches a named person lands on that person.
  const people = [];
  for (const pg of crawl.pages || []) for (const p of pg.people) people.push({ ...p, url: pg.url });
  const emails = [];
  for (const pg of crawl.pages || []) for (const e of pg.emails) if (!emails.some((x) => x.email === e.email)) emails.push({ ...e, url: pg.url });
  for (const p of people) {
    const match = emails.find((e) => !e.role_address && emailBelongsTo(e.email, p));
    const r = await addContact(env, org.id, {
      full_name: p.full_name, title: p.title, role_category: p.role_category, confidence: p.confidence,
      email: match ? match.email : undefined,
    }, { ctx, source: 'website', source_url: p.url });
    if (r.ok && r.created) out.contacts_added++;
    if (match) match.used = true;
  }
  for (const e of emails.filter((x) => !x.used)) {
    const local = e.email.split('@')[0];
    const role = /admission|intake|referral/i.test(local) ? 'admissions' : 'general_office';
    const r = await addContact(env, org.id, { email: e.email, role_category: role, confidence: 'medium' }, { ctx, source: 'website', source_url: e.url });
    if (r.ok && r.created) out.contacts_added++;
  }
  const t = now();
  const set = { last_enriched_at: t, enrich_error: crawl.ok ? null : String(crawl.error || 'failed').slice(0, 200) };
  const firstPhone = (crawl.pages || []).flatMap((p) => p.phones)[0];
  if (!org.phone && firstPhone) set.phone = firstPhone;
  if (!org.category_locked && crawl.text) {
    const c = classifyCategory({ name: org.name, text: crawl.text }, ICP_CATEGORIES);
    if (c.key && c.key !== org.business_category) set.business_category = c.key;
  }
  const cols = Object.keys(set);
  await env.DB.prepare(`UPDATE sales_organizations SET ${cols.map((c) => `${c}=?`).join(', ')}, enrich_attempts = enrich_attempts + 1,
      status = CASE WHEN status = 'discovered' THEN 'researching' ELSE status END, updated_at=? WHERE id=?`)
    .bind(...cols.map((c) => set[c]), t, org.id).run();
  await logActivity(env, {
    organization_id: org.id, kind: 'enrichment', ctx, detail: { ...out, ok: !!crawl.ok, error: crawl.ok ? null : crawl.error },
    event: 'sales.organization_enriched', props: { pages: out.pages, contacts_added: out.contacts_added, signals: out.signals, ok: !!crawl.ok },
  });
  return out;
}

/** Research one organization now: crawl its site, store evidence, rescore. */
export async function enrichOne(env, orgId, { cfg, ctx, fetchImpl } = {}) {
  let org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  if (org.do_not_contact) return { ok: false, error: 'This organization is marked do-not-contact.' };
  let applied = null;
  let crawl = null;
  let found = null;

  // A licensed facility from the state registry arrives with a phone and no website, and without a
  // website enrichment has nothing to read. Look for one — and only keep it if the page proves it
  // belongs to this facility (its phone, its address, or its distinctive name plus its city).
  if (!org.website) {
    found = await findWebsite(org, { fetchImpl });
    await recordSource(env, {
      organization_id: org.id, source_type: 'site_lookup',
      source_url: found.ok ? found.website : null,
      captured: { tried: found.tried, verified: found.ok ? found.signals : null },
    });
    if (found.ok) {
      await env.DB.prepare('UPDATE sales_organizations SET website=?, domain=?, updated_at=? WHERE id=?')
        .bind(found.website, found.domain, now(), org.id).run();
      org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
      await logActivity(env, { organization_id: org.id, kind: 'site_found', ctx, detail: { website: found.website, signals: found.signals } });
    }
  }
  if (org.website && org.domain) {
    crawl = await crawlOrganization(org, { fetchImpl });
    applied = await applyEnrichment(env, org, crawl, { ctx });
  }
  const score = await scoreAndStore(env, orgId, { cfg, ctx });
  return {
    ok: true, crawled: !!crawl, crawl_ok: crawl ? crawl.ok : null, crawl_error: crawl && !crawl.ok ? crawl.error : null,
    site_lookup: found ? { ok: found.ok, website: found.ok ? found.website : null, tried: found.tried.length } : null,
    ...(applied || {}), score: score.score, tier: score.tier,
  };
}

export async function runEnrichmentTick(env, { cfg, fetchImpl, limit = 4, budgetMs = TICK_BUDGET_MS } = {}) {
  if (!cfg.flags['sales.enabled'] || !cfg.flags['sales.enrichment_enabled']) return { skipped: 'enrichment is switched off' };
  const started = Date.now();
  const due = await salesRows(env,
    `SELECT id FROM sales_organizations
      WHERE status IN ('discovered','researching') AND do_not_contact = 0 AND last_enriched_at IS NULL AND enrich_attempts < 3
      ORDER BY CASE WHEN website IS NULL THEN 1 ELSE 0 END, created_at LIMIT ?`, limit);
  const done = [];
  for (const r of due) {
    if (Date.now() - started > budgetMs) break;
    const x = await enrichOne(env, r.id, { cfg, fetchImpl });
    done.push({ id: r.id, ok: x.ok, tier: x.tier, contacts_added: x.contacts_added || 0 });
  }
  return { enriched: done.length, results: done };
}

// ---------------------------------------------------------------- discovery

async function discoveryCursor(env) {
  const r = await salesRow(env, "SELECT value FROM app_settings WHERE key = 'sales.discovery_cursor'");
  // An older cursor ({qi, ai}) walked the Places grid; it simply restarts the plan at step 0.
  try { const v = JSON.parse((r && r.value) || '{}'); return { pi: Number(v.pi) || 0, token: v.token || null }; }
  catch { return { pi: 0, token: null }; }
}
async function saveCursor(env, c) {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('sales.discovery_cursor', ?, 'sales_os', ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(JSON.stringify(c), now()).run();
}

/**
 * The steps one full walk takes: the public-registry plan, then — only if Google Places has been
 * APPROVED for persistence, which this build never does — the Places query × area grid.
 */
export function discoverySteps(env, flags) {
  const steps = DISCOVERY_PLAN.map((p) => ({ ...p }));
  if (usableDiscoveryProvider(env, flags) === 'google_places') {
    for (const query of DISCOVERY_QUERIES) for (const area of DISCOVERY_AREAS) steps.push({ provider: 'google_places', query, area });
  }
  return steps;
}

const stepLabel = (st) => st.provider === 'ahca_healthfinder' ? `AHCA ${st.facility_type} · ${st.county}`
  : st.provider === 'samhsa_findtreatment' ? `SAMHSA · ${st.label || `${st.lat},${st.lng}`}` : `${st.query} · ${st.area}`;

/**
 * One bounded discovery pass: walk the plan from where the last pass stopped, dedupe everything,
 * score what is new. Stops at the daily new-prospect cap, the daily call cap, or the time budget —
 * whichever comes first. Google Places is never reached unless approved (it is not, in this build).
 */
export async function runDiscoveryTick(env, { cfg, fetchImpl, budgetMs = TICK_BUDGET_MS, atMs = Date.now(), ctx, maxCalls } = {}) {
  if (!cfg.flags['sales.enabled']) return { skipped: 'sales is switched off' };
  if (!ctx && !cfg.flags['sales.discovery_enabled']) return { skipped: 'discovery is switched off' };
  const steps = discoverySteps(env, cfg.flags);
  if (!steps.length) return { skipped: 'no approved automated discovery source — use CSV import', not_configured: true };
  const started = Date.now();
  const { start, end } = etDayBounds(etDateOf(atMs));
  const createdToday = await salesRow(env, "SELECT COUNT(*) AS n FROM sales_organizations WHERE source IN ('google_places','ahca_healthfinder','samhsa_findtreatment') AND created_at >= ? AND created_at < ?", start, end);
  const callsToday = await salesRow(env, "SELECT COUNT(*) AS n FROM sales_activity WHERE kind = 'discovery_call' AND created_at >= ? AND created_at < ?", start, end);
  let created = Number((createdToday && createdToday.n) || 0);
  let calls = Number((callsToday && callsToday.n) || 0);
  const maxNew = cfg.flags['sales.max_new_prospects_per_day'];
  const callCap = Math.min(cfg.flags['sales.max_discovery_calls_per_day'], maxCalls || Infinity);
  const cur = await discoveryCursor(env);
  const out = { calls: 0, results: 0, created: 0, merged: 0, errors: [], steps: [] };
  let walked = 0;
  while (created < maxNew && calls < cfg.flags['sales.max_discovery_calls_per_day'] && out.calls < callCap
    && Date.now() - started < budgetMs && walked < steps.length) {
    const step = steps[cur.pi % steps.length];
    const { provider, ...params } = step;
    const r = await discoverOrganizations(env, {
      provider, approved: provider !== 'google_places' || provider === usableDiscoveryProvider(env, cfg.flags),
      ...params, cursor: cur.token, limit: 20, fetchImpl,
    });
    calls++; out.calls++;
    let made = 0;
    const label = stepLabel(step);
    if (!r.ok) {
      out.errors.push(`${label}: ${r.error}`);
      await logActivity(env, { kind: 'discovery_call', actor: ctx ? undefined : 'system', ctx, detail: { step: label, provider, ok: false, error: r.error } });
      // Move past a failing step so one broken registry page cannot stall the whole walk forever.
      cur.token = null; cur.pi = (cur.pi + 1) % steps.length; walked++;
      continue;
    }
    for (const rec of r.results) {
      if (created >= maxNew) break;
      const u = await upsertOrganization(env, rec, { ctx, captured: rec.captured, source_url: rec.source_url });
      out.results++;
      if (u.ok && u.created) { created++; made++; out.created++; await scoreAndStore(env, u.organization_id, { cfg, ctx }); }
      else if (u.ok) {
        out.merged++;
        // A prospect already on the list just gained license evidence (capacity, meals by rule):
        // score it again so the registry match shows in its tier today, not at the next rescore.
        if (rec.captured && Array.isArray(rec.captured.signals) && rec.captured.signals.length) await scoreAndStore(env, u.organization_id, { cfg, ctx });
      }
    }
    out.steps.push({ step: label, results: r.results.length, created: made });
    await logActivity(env, { kind: 'discovery_call', actor: ctx ? undefined : 'system', ctx, detail: { step: label, provider, ok: true, results: r.results.length, created: made } });
    if (r.next_cursor && created < maxNew) cur.token = r.next_cursor;
    else if (r.next_cursor) { /* cap reached mid-step: resume this same page next pass */ }
    else { cur.token = null; cur.pi = (cur.pi + 1) % steps.length; walked++; }
  }
  await saveCursor(env, cur);
  return out;
}

// ---------------------------------------------------------------- entry point for the tick endpoint

/**
 * Run one named job with agent_runs logging. Never throws.
 *
 * A job that is switched off, or finds nothing to do, returns 'skipped' and writes NOTHING — no
 * agent_runs row, no automation.run event. With every flag at its default the scheduler fires about
 * fifty times a day; the deployment must stay inert, not fill the owner's AI Ops log with no-ops.
 */
/** Is this job switched on? Decides whether a skipped tick is worth a row — see runSalesJob. */
function jobEnabled(cfg, job) {
  const f = (cfg && cfg.flags) || {};
  if (!f['sales.enabled']) return false;
  if (job === 'discovery') return !!f['sales.discovery_enabled'];
  if (job === 'enrich') return !!f['sales.enrichment_enabled'];
  if (job === 'followup') return !!f['sales.followup_enabled'];
  if (job === 'send') return !!f['sales.email_enabled'];
  return true; // metrics rides on sales.enabled alone
}

export async function runSalesJob(env, job, { cfg, fetchImpl, triggeredBy = 'cron', atMs } = {}) {
  const started = now();
  const type = `sales_${job}`;
  try {
    let output;
    if (job === 'discovery') output = await runDiscoveryTick(env, { cfg, fetchImpl, atMs });
    else if (job === 'enrich') {
      output = await runEnrichmentTick(env, { cfg, fetchImpl });
      if (!output.skipped && !output.enriched) output = { ...output, skipped: 'nothing to research' };
    } else if (job === 'followup') {
      output = await draftDueFollowups(env, { cfg, atMs });
      if (!output.skipped && !(output.drafted || output.completed || output.stopped)) output = { ...output, skipped: 'nothing due' };
    } else if (job === 'send') {
      if (!cfg.flags['sales.enabled'] || !cfg.flags['sales.email_enabled']) output = { skipped: 'prospect email is switched off' };
      else {
        // THE STANDING APPROVAL RUNS FIRST, in the same hourly pass that sends. New prospects that
        // clear every bar get their step-1 letter drafted and approved against the owner's attested
        // email; everything else waits for him. Then the ordinary send pass does what it always did.
        let auto = null;
        if (cfg.flags['sales.auto_intro_enabled']) {
          const { autoEnrollNew, autoApproveIntros } = await import('./autosend.js');
          const enrolled = await autoEnrollNew(env, { cfg });
          const approved = await autoApproveIntros(env, { cfg, atMs });
          auto = { enrolled: enrolled.enrolled, considered: enrolled.considered, approved: approved.approved,
                   skipped: [...(enrolled.skipped || []), ...(approved.skipped || [])].slice(0, 10),
                   halted: approved.halted || null };
        }
        const r = await sendApproved(env, { cfg, atMs });
        const did = r.sent || r.failed || r.skipped || r.reapproval || (auto && (auto.enrolled || auto.approved));
        output = did ? { ...r, auto } : { ...r, auto, skipped: 'nothing sent' };
      }
    } else if (job === 'metrics') {
      output = cfg.flags['sales.enabled'] ? await funnel(env) : { skipped: 'sales is switched off' };
      if (!output.skipped && !output.organizations_discovered) output = { skipped: 'no prospects yet' };
    } else return { ok: false, error: `Unknown job ${job}.` };
    // A SWITCHED-ON JOB THAT SKIPS MUST STILL LEAVE A TRACE. This used to return here, before
    // logRun, so a job that ran and found nothing to do wrote nothing at all — and a job skipping
    // every hour for a BAD reason was indistinguishable from a job that had never been scheduled.
    // The only way to tell them apart was to read this file. That is how an automation stays dead
    // for weeks while the dashboard stays calm.
    //
    // A job that is switched OFF stays silent, exactly as before. That is not an unknown to be
    // investigated, it is the documented default, and logging it hourly forever would bury the one
    // line that matters. So the rule is narrow: silence means off, a row means it ran.
    if (output && typeof output.skipped === 'string') {
      if (jobEnabled(cfg, job)) await logRun(env, type, started, 'skipped', output, null, triggeredBy);
      return { ok: true, job, outcome: 'skipped', output };
    }
    await logRun(env, type, started, 'success', output, null, triggeredBy);
    return { ok: true, job, outcome: 'success', output };
  } catch (e) {
    await logRun(env, type, started, 'failed', null, (e && e.message) || e, triggeredBy);
    return { ok: false, job, error: String((e && e.message) || e).slice(0, 300) };
  }
}
