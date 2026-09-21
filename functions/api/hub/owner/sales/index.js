// /api/hub/owner/sales — the Sales OS workspace (OWNER ONLY).
//
//   GET  ?view=dashboard (default) | list | detail&id= | queue | settings | review | metrics
//   POST { op, ... } — organizations, contacts, opportunities, research, briefs, discovery, jobs
//
// Owner-only on purpose, not the marketing desk: approving a cold email to a clinic director and
// converting a prospect into a billed contract account are the owner's acts. The outreach queue
// lives in ./outreach.js, settings in ./settings.js, proposals and conversion in ./deal.js.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { parseJson } from '../../../../_lib/hub.js';
import { loadSalesConfig, LOCKED_FLAGS, LOCK_REASONS, CAPS } from '../../../../_lib/sales/config.js';
import {
  upsertOrganization, updateOrganization, addContact, updateContact, scoreAndStore, createOpportunity, setStage,
  updateOpportunity, suppressOrganization, recordSalesUnsubscribe, listOrganizations, organizationDetail,
  getContact, salesRow, salesRows, logActivity, ORG_STATUSES, OPP_STAGES, ROLE_CATEGORIES, EMAIL_STATUSES,
} from '../../../../_lib/sales/store.js';
import { VISIT_SCRIPT, VISIT_FIELDS, VISIT_OUTCOMES, visitOutcome, visitSummary } from '../../../../_lib/sales/visit.js';
import { enrichOne, runDiscoveryTick, runSalesJob, JOBS } from '../../../../_lib/sales/jobs.js';
import { roleCategoryOf } from '../../../../_lib/sales/enrich.js';
import { TOUCH_CHANNELS, TOUCH_SENTIMENTS, isTouchChannel, isTouchSentiment, FOLLOWUP_INTENTS } from '../../../../_lib/sales/followup.js';
import { generateBrief } from '../../../../_lib/sales/brief.js';
import { providerStatus, parseCsv, csvRowToRecord } from '../../../../_lib/sales/discovery.js';
import { dashboardCounts, funnel, conversionBy } from '../../../../_lib/sales/metrics.js';
import {
  approvalQueue, sendReadiness, previewOutreach, composeEmail, renderOutreachEmail, landingUrlFor, publicBaseUrl, REPLY_DETECTION,
  DEFAULT_SEQUENCE_ID, markReplied,
} from '../../../../_lib/sales/outreach.js';
import { ICP_CATEGORIES } from '../../../../_lib/sales/anejo.js';
import { CRITERIA } from '../../../../_lib/sales/scoring.js';
import { loadReadiness, setReadiness, buyerChecklist, readinessSummary, READINESS_STATUSES, BUYER_REQUIREMENTS, doeaEligibility } from '../../../../_lib/sales/requirements.js';
import { callQueue, logCall, callStats, CALL_OUTCOMES } from '../../../../_lib/sales/calls.js';

/** Open prospects per ICP category — what the readiness summary weighs each gap by. */
async function openCategoryCounts(env) {
  const rows = await salesRows(env, "SELECT business_category AS c, COUNT(*) AS n FROM sales_organizations WHERE status NOT IN ('suppressed','converted','disqualified') AND do_not_contact = 0 GROUP BY business_category");
  return Object.fromEntries(rows.map((r) => [r.c || 'other', Number(r.n) || 0]));
}

const categories = () => Object.entries(ICP_CATEGORIES).map(([key, c]) => ({ key, label: c.label }));

async function sequenceWithSteps(env) {
  const seq = await salesRow(env, 'SELECT * FROM sales_sequences WHERE id = ?', DEFAULT_SEQUENCE_ID);
  const steps = await salesRows(env, 'SELECT * FROM sales_sequence_steps WHERE sequence_id = ? ORDER BY step_number', DEFAULT_SEQUENCE_ID);
  return seq ? { ...seq, steps } : null;
}

function envReadiness(env) {
  return {
    email_provider: !!env.RESEND_API_KEY,
    ai: !!env.ANTHROPIC_API_KEY,
    scheduler: !!env.CRON_KEY,
    webhook_events: !!env.RESEND_WEBHOOK_SECRET,
    kitchen_origin: !!(env.KITCHEN_ORIGIN_LAT && env.KITCHEN_ORIGIN_LNG),
  };
}

// The §34 first-run acceptance screen: everything Dayan must see before anything goes live.
async function launchReview(env, cfg) {
  const base = publicBaseUrl(env);
  const top = (await listOrganizations(env, { limit: 60 }))
    .filter((o) => !['suppressed', 'converted', 'disqualified'].includes(o.status) && o.current_score != null)
    .slice(0, 20);
  const ids = top.map((o) => o.id);
  const scoreRows = ids.length
    ? await salesRows(env, `SELECT organization_id, criteria_json, disqualified_by, created_at FROM sales_scores WHERE organization_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`, ...ids)
    : [];
  const latest = {};
  for (const r of scoreRows) if (!latest[r.organization_id]) latest[r.organization_id] = r;
  const prospects = top.map((o) => ({
    ...o,
    criteria: latest[o.id] ? parseJson(latest[o.id].criteria_json, []) : [],
    disqualified_by: latest[o.id] ? parseJson(latest[o.id].disqualified_by, []) : [],
  }));

  // The exact first email: a real pending draft if one exists, otherwise a sample composed for the
  // top prospect exactly as a draft would be (NOT saved, NOT sendable).
  let sample = null;
  const draft = await salesRow(env, "SELECT id FROM sales_outreach WHERE status = 'pending_approval' AND step_number = 1 ORDER BY created_at LIMIT 1");
  if (draft) {
    const p = await previewOutreach(env, draft.id, { cfg });
    if (p.ok) sample = { source: 'pending draft', subject: p.subject, text: p.text, html: p.html, to: p.to, flags: p.flags };
  } else if (prospects[0]) {
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', prospects[0].id);
    const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE organization_id = ? AND marketing_email_allowed = 1 AND suppressed = 0 ORDER BY is_primary DESC LIMIT 1', org.id);
    const opp = await salesRow(env, "SELECT landing_token FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost')", org.id);
    const sigRows = await salesRows(env, "SELECT captured_json, source_url FROM sales_prospect_sources WHERE organization_id = ? AND source_type = 'website_page'", org.id);
    const signals = [];
    for (const r of sigRows) for (const sg of (parseJson(r.captured_json, {}) || {}).signals || []) signals.push({ ...sg, url: sg.url || r.source_url });
    const c = composeEmail({ templateType: 'intro', org, contact, signals, cfg, landingUrl: opp ? landingUrlFor(env, opp.landing_token) :`${base}/for/<personal-link>` });
    const r = renderOutreachEmail({
      subject: c.subject, body: c.body, unsubUrl: `${base}/api/sales/unsubscribe?t=<personal-token>`, postal: cfg.postal_address,
      orgName: org.name, areaLabel: cfg.service_area.label,
    });
    sample = { source: `sample for ${org.name} (not saved)`, subject: r.subject, text: r.text, html: r.html, to: contact ? contact.email : '(no sendable contact yet)', claims: c.claims };
  }
  const landing = await salesRow(env, "SELECT landing_token FROM sales_opportunities WHERE landing_token IS NOT NULL AND stage NOT IN ('lost') ORDER BY created_at DESC LIMIT 1");
  const flags = cfg.flags;
  return {
    icp: { categories: Object.entries(ICP_CATEGORIES).map(([k, v]) => ({ key: k, label: v.label, fit: cfg.icp.category_fit[k] })), weights: cfg.icp.weights, tiers: cfg.icp.tiers, criteria: CRITERIA, volume_bands: cfg.icp.volume_bands },
    service_area: cfg.service_area,
    discovery_sources: providerStatus(env, cfg.flags),
    prospects,
    offer: cfg.offer,
    proof: cfg.proof,
    first_email: sample,
    sequence: await sequenceWithSteps(env),
    landing_preview: landing ? `/for/${landing.landing_token}?preview=1` : null,
    daily_send_cap: flags['sales.max_emails_per_day'],
    daily_new_prospect_cap: flags['sales.max_new_prospects_per_day'],
    unsubscribe_behavior: [
      'Every email carries a one-click unsubscribe link and a List-Unsubscribe header; the link never contains the address.',
      'An unsubscribe suppresses that address across every organization and stops every sequence aimed at it, immediately.',
      'Customers who opted out of Añejo marketing, and addresses that bounced or complained, are never emailed.',
      'The footer identifies the email as a business solicitation and carries your postal address.',
    ],
    proof_wording: cfg.proof.mode === 'none' ? 'No proof line is used.' : cfg.proof.mode === 'named' ? (cfg.proof.named_permission_recorded ? cfg.proof.named_text : 'Named proof selected but permission NOT recorded — nothing is used.') : (cfg.proof.anonymous_text || 'Anonymous proof selected but no text written — nothing is used.'),
    flags,
    locked_flags: LOCKED_FLAGS, lock_reasons: LOCK_REASONS,
    send_readiness: sendReadiness(env, cfg, { ignoreWindow: true }),
    reply_detection: REPLY_DETECTION,
    manual: [
      'Approving every prospect email (each one, with its preview).',
      'Marking replies received and classifying them.',
      'Writing and confirming proposal terms, and converting to a contract account.',
      'Turning on each automation flag, and setting the sender, postal address and offer.',
      'Replying to prospects — replies go to your Reply-To mailbox.',
    ],
    automatic_after_approval: [
      flags['sales.discovery_enabled'] ? 'Discovery: runs daily within the caps.' : 'Discovery (daily, within caps) — currently OFF.',
      flags['sales.enrichment_enabled'] ? 'Website research + scoring: runs hourly in small batches.' : 'Website research + scoring (hourly, small batches) — currently OFF.',
      flags['sales.followup_enabled'] ? 'Follow-up DRAFTING when a step comes due (drafts still need your approval).' : 'Follow-up drafting — currently OFF.',
      flags['sales.email_enabled'] ? 'Sending emails you approved, in business hours, up to the daily cap.' : 'Sending approved emails — currently OFF.',
      'Suppressing bounces, complaints and unsubscribes, and stopping sequences on every stop condition.',
    ],
  };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'dashboard';
  const cfg = await loadSalesConfig(env);

  if (view === 'list') {
    const f = Object.fromEntries(['tier', 'status', 'category', 'county', 'city', 'stage', 'contactable', 'sequence', 'q', 'limit', 'offset'].map((k) => [k, url.searchParams.get(k) || undefined]));
    return json({ ok: true, organizations: await listOrganizations(env, f), categories: categories(), stages: OPP_STAGES, statuses: ORG_STATUSES });
  }
  if (view === 'detail') {
    const d = await organizationDetail(env, url.searchParams.get('id') || '');
    if (!d) return bad('Organization not found.', 404);
    const readiness = await loadReadiness(env);
    const category = (d.organization && d.organization.business_category) || 'other';
    return json({
      ok: true, ...d,
      buyer_checklist: buyerChecklist(category, readiness),
      landing_url: d.opportunity && d.opportunity.landing_token ? `/for/${d.opportunity.landing_token}?preview=1` : null,
      categories: categories(), stages: OPP_STAGES, role_categories: ROLE_CATEGORIES, email_statuses: EMAIL_STATUSES,
      send_readiness: sendReadiness(env, cfg), reply_detection: REPLY_DETECTION,
      visit: { script: VISIT_SCRIPT, fields: VISIT_FIELDS, outcomes: VISIT_OUTCOMES },
      touch: { channels: TOUCH_CHANNELS, sentiments: TOUCH_SENTIMENTS },
      followup_intents: FOLLOWUP_INTENTS.map((i) => ({ key: i.key, label: i.label })),
    });
  }
  if (view === 'queue') {
    const queue = await approvalQueue(env, { includeSnoozed: url.searchParams.get('snoozed') === '1' });
    // "Why this prospect qualifies" on every card: the criteria that earned points, with their reasons.
    const ids = [...new Set(queue.map((x) => x.organization_id))];
    const why = {};
    if (ids.length) {
      const sc = await salesRows(env, `SELECT organization_id, criteria_json FROM sales_scores WHERE organization_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`, ...ids);
      for (const r of sc) {
        if (why[r.organization_id]) continue;
        why[r.organization_id] = parseJson(r.criteria_json, []).filter((c) => c.points > 0)
          .map((c) => `${c.label} (${c.points}/${c.max}): ${(c.reasons || []).join(' ')}`).slice(0, 5);
      }
    }
    // What this buyer will ask for next, shown BEFORE the owner approves the first email to them.
    const readiness = await loadReadiness(env);
    const buyer = (x) => { const c = buyerChecklist(x.business_category || 'other', readiness); return { label: c.label, verdict: c.verdict, verdict_text: c.verdict_text, blocking: c.blocking.map((i) => i.label) }; };
    return json({ ok: true, queue: queue.map((x) => ({ ...x, why: why[x.organization_id] || [], buyer: buyer(x) })), send_readiness: sendReadiness(env, cfg), flags: cfg.flags });
  }
  if (view === 'settings') {
    return json({
      ok: true, flags: cfg.flags, locked_flags: LOCKED_FLAGS, lock_reasons: LOCK_REASONS, caps: CAPS, icp: cfg.icp, offer: cfg.offer, proof: cfg.proof,
      sender: cfg.sender, send_window: cfg.send_window, service_area: cfg.service_area,
      postal_address: cfg.postal_address, postal_is_real: cfg.postal_is_real, categories: categories(), criteria: CRITERIA,
      sequence: await sequenceWithSteps(env), providers: providerStatus(env, cfg.flags), env: envReadiness(env),
      send_readiness: sendReadiness(env, cfg, { ignoreWindow: true }), reply_detection: REPLY_DETECTION,
    });
  }
  if (view === 'review') return json({ ok: true, ...(await launchReview(env, cfg)) });
  if (view === 'calls') {
    // The part of the pipeline email cannot reach: licensed facilities with a phone and no inbox.
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 25));
    const all = url.searchParams.get('all') === '1';
    return json({
      ok: true, queue: await callQueue(env, { limit, includeEmailable: all }),
      outcomes: CALL_OUTCOMES, stats: await callStats(env),
    });
  }
  if (view === 'readiness') {
    const readiness = await loadReadiness(env);
    const counts = await openCategoryCounts(env);
    return json({
      ok: true, items: Object.values(readiness), statuses: READINESS_STATUSES, summary: readinessSummary(readiness, counts),
      doea: doeaEligibility({}),
      categories: Object.entries(BUYER_REQUIREMENTS).map(([key]) => ({ ...buyerChecklist(key, readiness), open_prospects: counts[key] || 0 }))
        .filter((c) => c.open_prospects > 0 || ['adult_day', 'addiction_treatment', 'behavioral_health', 'residential_care'].includes(c.category)),
    });
  }
  if (view === 'metrics') {
    return json({ ok: true, funnel: await funnel(env), by_source: await conversionBy(env, 'source'), by_tier: await conversionBy(env, 'tier'), by_template: await conversionBy(env, 'template') });
  }
  return json({
    ok: true, counts: await dashboardCounts(env), funnel: await funnel(env), flags: cfg.flags,
    readiness: readinessSummary(await loadReadiness(env), await openCategoryCounts(env)),
    send_readiness: sendReadiness(env, cfg), providers: providerStatus(env, cfg.flags), reply_detection: REPLY_DETECTION, env: envReadiness(env),
    recent: (await salesRows(env, 'SELECT a.*, o.name AS organization_name FROM sales_activity a LEFT JOIN sales_organizations o ON o.id = a.organization_id ORDER BY a.created_at DESC LIMIT 25'))
      .map((a) => ({ ...a, detail: parseJson(a.detail_json, null), detail_json: undefined })),
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = String((b && b.op) || '');
  const cfg = await loadSalesConfig(env);
  if (!cfg.flags['sales.enabled']) return bad('The Sales workspace is switched off.', 409);
  const out = (r, okStatus = 200) => (r && r.ok ? json(r, okStatus) : bad((r && r.error) || 'Could not do that.', (r && r.code === 'not_found') ? 404 : 400));

  switch (op) {
    case 'create_org': {
      const r = await upsertOrganization(env, { ...b, source: 'manual' }, { ctx });
      if (!r.ok) return out(r);
      const s = await scoreAndStore(env, r.organization_id, { cfg, ctx });
      return json({ ...r, score: s.score, tier: s.tier });
    }
    case 'import_csv': {
      const parsed = parseCsv(String(b.csv || ''), { maxRows: 500 });
      if (!parsed.rows.length) return bad('No rows found. The first line must be a header (name, website, city, …).');
      const started = Date.now();
      const res = { rows: parsed.rows.length, created: 0, merged: 0, contacts: 0, errors: [], stopped_at: null, truncated: !!parsed.truncated };
      for (let i = 0; i < parsed.rows.length; i++) {
        if (Date.now() - started > 25000) { res.stopped_at = i; break; }
        const rec = csvRowToRecord(parsed.rows[i]);
        const u = await upsertOrganization(env, rec.org, { ctx, captured: { row: i + 2 }, source_url: rec.contact.source_url });
        if (!u.ok) { res.errors.push(`Row ${i + 2}: ${u.error}`); continue; }
        if (u.created) res.created++; else res.merged++;
        if (rec.contact.email || rec.contact.full_name) {
          const c = await addContact(env, u.organization_id, rec.contact, { ctx, source: 'csv', source_url: rec.contact.source_url });
          if (c.ok && c.created) res.contacts++;
          else if (!c.ok) res.errors.push(`Row ${i + 2}: ${c.error}`);
        }
        await scoreAndStore(env, u.organization_id, { cfg, ctx });
      }
      if (res.stopped_at != null) res.note = `Stopped at row ${res.stopped_at + 2} to stay inside the time limit. Import the same file again — rows already imported are recognised and skipped.`;
      return json({ ok: true, ...res });
    }
    case 'update_org': {
      const r = await updateOrganization(env, String(b.id || ''), b, { ctx });
      if (!r.ok) return out(r);
      await scoreAndStore(env, r.organization_id, { cfg, ctx });
      return json(r);
    }
    case 'add_contact': {
      const r = await addContact(env, String(b.organization_id || ''), b, { ctx, source: 'manual', source_url: b.source_url });
      if (r.ok) await scoreAndStore(env, String(b.organization_id), { cfg, ctx });
      return out(r);
    }
    case 'update_contact': {
      const c = await getContact(env, String(b.id || ''));
      const r = await updateContact(env, String(b.id || ''), b, { ctx });
      if (r.ok && c) await scoreAndStore(env, c.organization_id, { cfg, ctx });
      return out(r);
    }
    case 'unsubscribe_contact': {
      const c = await getContact(env, String(b.contact_id || ''));
      if (!c) return bad('Contact not found.', 404);
      return out(await recordSalesUnsubscribe(env, { email: c.email, contact_id: c.id, organization_id: c.organization_id, source: 'owner', reason: String(b.reason || 'owner marked do-not-contact'), ctx }));
    }
    case 'rescore': return out(await scoreAndStore(env, String(b.id || ''), { cfg, ctx }));
    case 'rescore_all': {
      const ids = await salesRows(env, "SELECT id FROM sales_organizations WHERE status NOT IN ('converted','suppressed') ORDER BY updated_at DESC LIMIT 200");
      const started = Date.now(); let n = 0;
      for (const r of ids) { if (Date.now() - started > 25000) break; await scoreAndStore(env, r.id, { cfg, ctx }); n++; }
      return json({ ok: true, rescored: n, of: ids.length });
    }
    case 'research': return out(await enrichOne(env, String(b.id || ''), { cfg, ctx }));
    case 'brief': return out(await generateBrief(env, String(b.id || ''), { cfg, ctx }));
    case 'create_opportunity': return out(await createOpportunity(env, String(b.organization_id || ''), { primary_contact_id: b.primary_contact_id || null, ctx }));
    case 'update_opportunity': return out(await updateOpportunity(env, String(b.id || ''), b, { ctx }));
    case 'set_stage': return out(await setStage(env, String(b.id || ''), String(b.stage || ''), { loss_reason: b.loss_reason, note: b.note, ctx }));
    // A DOOR VISIT, WRITTEN INTO THE RECORD. Every field is optional — a visit where the only thing
    // learned was a name is still worth logging — but each one that IS filled lands where the rest
    // of the system already looks for it, instead of in a note nobody scores:
    //   headcount    → the organization's capacity → Volume potential (15 points)
    //   name + email → a real contact              → Decision-maker quality (10 points)
    //   outcome      → the opportunity's stage
    // and the whole visit becomes one line in the activity feed, so the follow-up email can be
    // written from what was actually said at the door rather than from memory three days later.
    case 'log_visit': {
      const orgId = String(b.organization_id || '');
      const org = await salesRow(env, 'SELECT id FROM sales_organizations WHERE id = ?', orgId);
      if (!org) return bad('Organization not found.', 404);
      const done = { contact_id: null, capacity_set: false, stage: null, rescored: false };

      if (b.spoke_to_email || b.spoke_to_name) {
        const c = await addContact(env, orgId, {
          full_name: b.spoke_to_name || null, title: b.spoke_to_title || null,
          email: b.spoke_to_email || null, phone: b.spoke_to_phone || null,
          // The title he wrote down is classified by the SAME classifier the website scraper uses, so
          // a person met at the door counts as a decision-maker on exactly the terms a scraped one
          // does. An unrecognised title falls to 'other' — that is a lower score, never an invented
          // seniority, and he can correct the role on the contact row.
          role_category: roleCategoryOf(b.spoke_to_title),
          // Met in person and written down at the desk — that is the owner vouching for it.
          email_status: b.spoke_to_email ? 'owner_verified' : undefined,
        }, { ctx, source: 'manual' });
        if (c.ok) done.contact_id = c.contact_id; else if (c.error) done.contact_error = c.error;
      }

      const heads = Number(b.headcount);
      if (Number.isFinite(heads) && heads > 0) {
        const u = await updateOrganization(env, orgId, { employee_or_capacity_hint: String(Math.round(heads)) }, { ctx });
        done.capacity_set = !!(u && u.ok);
      }

      const oc = visitOutcome(String(b.outcome || ''));
      const opp = await salesRow(env, "SELECT id, stage FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", orgId);
      if (opp && oc && oc.stage && opp.stage !== oc.stage) {
        const st = await setStage(env, opp.id, oc.stage, { note: 'In-person visit', ctx });
        if (st && st.ok) done.stage = oc.stage;
      }
      if (opp && b.best_time) await updateOpportunity(env, opp.id, { next_action: `Follow up after visit — ${String(b.best_time).slice(0, 80)}` }, { ctx });

      await logActivity(env, {
        organization_id: orgId, opportunity_id: opp ? opp.id : null, contact_id: done.contact_id,
        kind: 'visit', ctx, event: 'sales.visit_logged',
        detail: {
          summary: visitSummary(b),
          ...Object.fromEntries(VISIT_FIELDS.map((f) => [f.key, b[f.key] || null]).filter(([, v]) => v)),
          outcome: b.outcome || null, note: b.note || null,
        },
      });

      // The score moves the moment the capacity or the contact lands, which is the whole point.
      if (done.capacity_set || done.contact_id) { await scoreAndStore(env, orgId, { cfg, ctx }); done.rescored = true; }
      return json({ ok: true, ...done, summary: visitSummary(b) });
    }

    // ANYTHING THE PROSPECT SAID, FROM ANY CHANNEL. A reply in his inbox, a phone call, a voicemail,
    // a word at the door — all of it is the same class of fact to the follow-up drafter, and none of
    // it reaches the record on its own. This is the one door for all of it, and like a visit it
    // WRITES INTO THE MODEL rather than sitting beside it: a headcount becomes capacity, a reply
    // stops the automated sequence, a stage moves, and the score is recomputed.
    case 'log_touch': {
      const orgId = String(b.organization_id || '');
      const org = await salesRow(env, 'SELECT id FROM sales_organizations WHERE id = ?', orgId);
      if (!org) return bad('Organization not found.', 404);
      const summary = String(b.summary || '').trim();
      if (!summary) return bad('Write what they said — that sentence is the whole point of the record.');
      const channel = isTouchChannel(b.channel) ? b.channel : 'other';
      const sentiment = isTouchSentiment(b.sentiment) ? b.sentiment : 'neutral';
      const done = { capacity_set: false, stage: null, sequence_stopped: false, rescored: false };

      const heads = Number(b.headcount);
      if (Number.isFinite(heads) && heads > 0) {
        const u = await updateOrganization(env, orgId, { employee_or_capacity_hint: String(Math.round(heads)) }, { ctx });
        done.capacity_set = !!(u && u.ok);
      }

      const opp = await salesRow(env, "SELECT id, stage FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", orgId);

      // A human answered. Nothing automated may keep talking over them.
      if (opp && ['email_reply', 'phone_call', 'text', 'in_person'].includes(channel)) {
        const r = await markReplied(env, { opportunity_id: opp.id, sentiment, note: summary.slice(0, 500), ctx });
        done.sequence_stopped = !!(r && r.ok);
      }
      if (opp && OPP_STAGES.includes(b.stage) && b.stage !== opp.stage) {
        const st = await setStage(env, opp.id, b.stage, { note: 'From a logged conversation', ctx });
        if (st && st.ok) done.stage = b.stage;
      }
      if (opp && b.next_action) await updateOpportunity(env, opp.id, { next_action: String(b.next_action).slice(0, 160) }, { ctx });

      await logActivity(env, {
        organization_id: orgId, opportunity_id: opp ? opp.id : null, contact_id: b.contact_id || null,
        kind: 'touch', ctx, event: 'sales.touch_logged',
        detail: {
          channel, sentiment, summary,
          asked: b.asked ? String(b.asked).slice(0, 500) : null,
          headcount: Number.isFinite(heads) && heads > 0 ? Math.round(heads) : null,
          lunch_time: b.lunch_time ? String(b.lunch_time).slice(0, 60) : null,
        },
      });
      if (done.capacity_set) { await scoreAndStore(env, orgId, { cfg, ctx }); done.rescored = true; }
      return json({ ok: true, ...done });
    }

    // WORK THE LIST. Thirty-five of thirty-seven prospects sat unworkable because an opportunity is
    // what mints the landing token and anchors the outreach record, and one had to be created by
    // hand, one prospect at a time. That is not a decision worth making thirty-five times: creating
    // an opportunity commits nothing, sends nothing and tells no one — it only makes a prospect
    // ADDRESSABLE. Researching is bounded much harder because each one is a live website fetch and a
    // model call against a real budget.
    //
    // Takes explicit ids, never a filter, so the owner acts on exactly the rows he is looking at
    // rather than on a query that may have drifted since the page rendered.
    case 'bulk_advance': {
      const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(Boolean).slice(0, 200) : [];
      if (!ids.length) return bad('Select at least one prospect.');
      const wanted = Array.isArray(b.actions) ? b.actions : ['create_opportunity'];
      const doOpp = wanted.includes('create_opportunity');
      const doResearch = wanted.includes('research');
      const RESEARCH_CAP = 12;

      const res = { considered: ids.length, opportunities_created: 0, opportunities_existing: 0, researched: 0, skipped: [], errors: [] };
      let researchBudget = doResearch ? RESEARCH_CAP : 0;

      for (const orgId of ids) {
        const org = await salesRow(env, 'SELECT id, name, do_not_contact, status, last_enriched_at FROM sales_organizations WHERE id = ?', orgId);
        if (!org) { res.errors.push({ id: orgId, error: 'not found' }); continue; }
        if (org.do_not_contact || org.status === 'suppressed') { res.skipped.push({ name: org.name, why: 'marked do-not-contact' }); continue; }

        if (doResearch && !org.last_enriched_at && researchBudget > 0) {
          researchBudget -= 1;
          const e = await enrichOne(env, orgId, { cfg, ctx });
          if (e && e.ok) res.researched += 1; else res.errors.push({ id: orgId, name: org.name, error: (e && e.error) || 'research failed' });
        }
        if (doOpp) {
          const o = await createOpportunity(env, orgId, { ctx });
          if (!o.ok) res.errors.push({ id: orgId, name: org.name, error: o.error });
          else if (o.created) res.opportunities_created += 1;
          else res.opportunities_existing += 1;
        }
      }
      if (doResearch && researchBudget === 0 && res.researched >= RESEARCH_CAP) {
        res.note = `Researched ${RESEARCH_CAP} this pass — that is the cap per press, because each one reads a live website and costs model budget. Press it again for the next ${RESEARCH_CAP}.`;
      }
      return json({ ok: true, ...res });
    }

    case 'log_call': {
      const r = await logCall(env, b, { ctx });
      return r.ok ? json(r) : bad(r.error);
    }
    case 'set_readiness': {
      const r = await setReadiness(env, String(b.key || ''), { status: b.status, note: b.note }, ctx);
      return r.ok ? json(r) : bad(r.error);
    }
    case 'do_not_contact': return out(await suppressOrganization(env, String(b.organization_id || ''), { reason: b.reason, ctx }));
    case 'discover_now': {
      const maxCalls = Math.max(1, Math.min(5, Number(b.max_calls) || 2));
      const r = await runDiscoveryTick(env, { cfg, ctx, maxCalls });
      if (r.not_configured) return bad(r.skipped, 409);
      return json({ ok: true, ...r });
    }
    case 'run_job': {
      const job = String(b.job || '');
      if (!JOBS.includes(job)) return bad('Unknown job.');
      return json(await runSalesJob(env, job, { cfg, triggeredBy: 'owner' }));
    }
    default: return bad('Unknown action.');
  }
};
