// /api/hub/owner/sales — the Sales OS workspace (OWNER ONLY).
//
//   GET  ?view=dashboard (default) | list | detail&id= | queue | settings | review | metrics
//   POST { op, ... } — organizations, contacts, opportunities, research, briefs, discovery, jobs
//
// Owner-only on purpose, not the marketing desk: approving a cold email to a clinic director and
// converting a prospect into a billed contract account are the owner's acts. The outreach queue
// lives in ./outreach.js, settings in ./settings.js, proposals and conversion in ./deal.js.
import { json, bad, appBaseUrl } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { parseJson } from '../../../../_lib/hub.js';
import { loadSalesConfig, LOCKED_FLAGS, CAPS } from '../../../../_lib/sales/config.js';
import {
  upsertOrganization, updateOrganization, addContact, updateContact, scoreAndStore, createOpportunity, setStage,
  updateOpportunity, suppressOrganization, recordSalesUnsubscribe, listOrganizations, organizationDetail,
  getContact, salesRow, salesRows, ORG_STATUSES, OPP_STAGES, ROLE_CATEGORIES, EMAIL_STATUSES,
} from '../../../../_lib/sales/store.js';
import { enrichOne, runDiscoveryTick, runSalesJob, JOBS } from '../../../../_lib/sales/jobs.js';
import { generateBrief } from '../../../../_lib/sales/brief.js';
import { providerStatus, parseCsv, csvRowToRecord } from '../../../../_lib/sales/discovery.js';
import { dashboardCounts, funnel, conversionBy } from '../../../../_lib/sales/metrics.js';
import {
  approvalQueue, sendReadiness, previewOutreach, composeEmail, renderOutreachEmail, landingUrlFor, REPLY_DETECTION,
  DEFAULT_SEQUENCE_ID,
} from '../../../../_lib/sales/outreach.js';
import { ICP_CATEGORIES } from '../../../../_lib/sales/anejo.js';
import { CRITERIA } from '../../../../_lib/sales/scoring.js';

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
async function launchReview(env, cfg, base) {
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
    const p = await previewOutreach(env, draft.id, { cfg, base });
    if (p.ok) sample = { source: 'pending draft', subject: p.subject, text: p.text, html: p.html, to: p.to, flags: p.flags };
  } else if (prospects[0]) {
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', prospects[0].id);
    const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE organization_id = ? AND marketing_email_allowed = 1 AND suppressed = 0 ORDER BY is_primary DESC LIMIT 1', org.id);
    const opp = await salesRow(env, "SELECT landing_token FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost')", org.id);
    const sigRows = await salesRows(env, "SELECT captured_json, source_url FROM sales_prospect_sources WHERE organization_id = ? AND source_type = 'website_page'", org.id);
    const signals = [];
    for (const r of sigRows) for (const sg of (parseJson(r.captured_json, {}) || {}).signals || []) signals.push({ ...sg, url: sg.url || r.source_url });
    const c = composeEmail({ templateType: 'intro', org, contact, signals, cfg, landingUrl: opp ? landingUrlFor(env, opp.landing_token, base) : `${base}/for/<personal-link>` });
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
    discovery_sources: providerStatus(env),
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
    locked_flags: LOCKED_FLAGS,
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
  const base = appBaseUrl(env, request);

  if (view === 'list') {
    const f = Object.fromEntries(['tier', 'status', 'category', 'county', 'city', 'stage', 'contactable', 'sequence', 'q', 'limit', 'offset'].map((k) => [k, url.searchParams.get(k) || undefined]));
    return json({ ok: true, organizations: await listOrganizations(env, f), categories: categories(), stages: OPP_STAGES, statuses: ORG_STATUSES });
  }
  if (view === 'detail') {
    const d = await organizationDetail(env, url.searchParams.get('id') || '');
    if (!d) return bad('Organization not found.', 404);
    return json({
      ok: true, ...d,
      landing_url: d.opportunity && d.opportunity.landing_token ? `/for/${d.opportunity.landing_token}?preview=1` : null,
      categories: categories(), stages: OPP_STAGES, role_categories: ROLE_CATEGORIES, email_statuses: EMAIL_STATUSES,
      send_readiness: sendReadiness(env, cfg), reply_detection: REPLY_DETECTION,
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
    return json({ ok: true, queue: queue.map((x) => ({ ...x, why: why[x.organization_id] || [] })), send_readiness: sendReadiness(env, cfg), flags: cfg.flags });
  }
  if (view === 'settings') {
    return json({
      ok: true, flags: cfg.flags, locked_flags: LOCKED_FLAGS, caps: CAPS, icp: cfg.icp, offer: cfg.offer, proof: cfg.proof,
      sender: cfg.sender, send_window: cfg.send_window, service_area: cfg.service_area,
      postal_address: cfg.postal_address, postal_is_real: cfg.postal_is_real, categories: categories(), criteria: CRITERIA,
      sequence: await sequenceWithSteps(env), providers: providerStatus(env), env: envReadiness(env),
      send_readiness: sendReadiness(env, cfg, { ignoreWindow: true }), reply_detection: REPLY_DETECTION,
    });
  }
  if (view === 'review') return json({ ok: true, ...(await launchReview(env, cfg, base)) });
  if (view === 'metrics') {
    return json({ ok: true, funnel: await funnel(env), by_source: await conversionBy(env, 'source'), by_tier: await conversionBy(env, 'tier'), by_template: await conversionBy(env, 'template') });
  }
  return json({
    ok: true, counts: await dashboardCounts(env), funnel: await funnel(env), flags: cfg.flags,
    send_readiness: sendReadiness(env, cfg), providers: providerStatus(env), reply_detection: REPLY_DETECTION, env: envReadiness(env),
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
      return json(await runSalesJob(env, job, { cfg, base: appBaseUrl(env, request), triggeredBy: 'owner' }));
    }
    default: return bad('Unknown action.');
  }
};
