// Sales OS — THE CALL LIST. Files under functions/_lib are NOT routed.
//
// WHY. On 2026-09-21 the pipeline held 159 licensed facilities and 46 email addresses. The state
// registry publishes a phone number, not an inbox, and adult day care centers answer their phones.
// Email-only outreach therefore left roughly half the pipeline unworkable — not unqualified,
// unworkable, which is a different and more expensive problem.
//
// A call list is not a filter over the prospects table. It is an ORDERED QUEUE with a memory:
//   · a prospect with a phone and no sendable email belongs here, because email cannot reach it
//   · a prospect already called today does not come back today
//   · what the call produced goes into the model — capacity, a named decision-maker, the stage —
//     exactly as the door visit already does, so calling teaches the scorer instead of the notepad
//
// Outcomes are deliberately few and concrete. "Follow up" is not an outcome; a date is.
import { now, parseJson } from '../hub.js';
import { salesRow, salesRows, logActivity, updateOrganization, scoreAndStore, suppressOrganization } from './store.js';
import { ICP_CATEGORIES } from './anejo.js';

export const CALL_OUTCOMES = [
  { key: 'reached_decision_maker', label: 'Reached the decision-maker', advances: true },
  { key: 'reached_gatekeeper', label: 'Spoke to the front desk', advances: false },
  { key: 'left_voicemail', label: 'Left a voicemail', advances: false },
  { key: 'no_answer', label: 'No answer', advances: false },
  { key: 'call_back', label: 'Asked me to call back', advances: false },
  { key: 'send_info', label: 'Asked for information by email', advances: true },
  { key: 'not_interested', label: 'Not interested', advances: false },
  { key: 'do_not_call', label: 'Asked not to be contacted', advances: false },
  { key: 'wrong_number', label: 'Wrong or dead number', advances: false },
];
export const isOutcome = (k) => CALL_OUTCOMES.some((o) => o.key === String(k));

// How long a number rests after each outcome. A voicemail on Tuesday is not called again on
// Wednesday; a "call back Monday" is not called before Monday.
const REST_DAYS = {
  reached_decision_maker: 30, reached_gatekeeper: 3, left_voicemail: 4, no_answer: 2,
  call_back: 0, send_info: 14, not_interested: 180, do_not_call: 3650, wrong_number: 3650,
};
const DAY = 86400000;

/**
 * What to say when they pick up. Built from what the registry and the website already told us, so
 * the owner is never reading a generic script at a facility whose capacity he is holding.
 */
export function callCard(org, { signals = [] } = {}) {
  const cat = (ICP_CATEGORIES[org.business_category] || {}).label || 'facility';
  const capacity = String(org.employee_or_capacity_hint || '').match(/\d+/);
  const lines = [];
  lines.push(`${org.name} · ${cat}${org.city ? ' · ' + org.city : ''}`);
  if (capacity) lines.push(`Licensed for ${capacity[0]}. Ask how many attend on an average day.`);
  if (org.provider_status) lines.push(`License status on the state registry: ${org.provider_status}.`);
  const meals = signals.filter((s) => s.kind === 'meals_provided').length;
  if (meals) lines.push('They serve meals on site by rule, so the question is who supplies them today, not whether they need them.');
  return {
    headline: `${org.name}${org.city ? ', ' + org.city : ''}`,
    facts: lines,
    open: 'This is Dayan with Añejo Catering here in Boca Raton. We deliver breakfast and lunch to adult day programs. Who handles your meal service?',
    ask: 'Would it help if I sent the 4-week menu and pricing for your head count?',
    // The four answers that are worth writing down, because each one moves the score.
    capture: ['How many attend on an average day?', 'Who decides on meals?', 'What do they do for meals today?', 'Best email for the menu?'],
    never: ['Do not quote a price per meal without the head count.', 'Do not say the menu is dietitian-approved until it is signed.'],
  };
}

/**
 * The queue, best first. Ranked by tier and score, but a prospect that email cannot reach outranks
 * one that it can — the point of this list is the part of the pipeline email leaves behind.
 */
export async function callQueue(env, { limit = 25, includeEmailable = false, atMs = Date.now() } = {}) {
  const rows = await salesRows(env,
    `SELECT o.id, o.name, o.phone, o.city, o.county, o.business_category, o.current_tier, o.current_score,
            o.employee_or_capacity_hint, o.provider_status, o.website, o.status,
            (SELECT COUNT(*) FROM sales_contacts c WHERE c.organization_id = o.id AND c.email IS NOT NULL AND c.suppressed = 0
               AND c.marketing_email_allowed = 1) AS emailable,
            (SELECT MAX(created_at) FROM sales_activity a WHERE a.organization_id = o.id AND a.kind = 'call') AS last_call_at,
            (SELECT detail_json FROM sales_activity a WHERE a.organization_id = o.id AND a.kind = 'call'
              ORDER BY a.created_at DESC LIMIT 1) AS last_call_json,
            (SELECT stage FROM sales_opportunities p WHERE p.organization_id = o.id AND p.stage NOT IN ('won','lost')
              ORDER BY p.created_at DESC LIMIT 1) AS stage
       FROM sales_organizations o
      WHERE o.do_not_contact = 0 AND o.status NOT IN ('suppressed','converted','disqualified')
        AND o.phone IS NOT NULL AND o.current_tier IN ('A','B','C')
      ORDER BY CASE o.current_tier WHEN 'A' THEN 0 WHEN 'B' THEN 1 ELSE 2 END, o.current_score DESC
      LIMIT 200`);
  const out = [];
  for (const r of rows) {
    if (!includeEmailable && r.emailable > 0) continue;       // email can reach it; the queue is for the rest
    const last = parseJson(r.last_call_json, null);
    if (r.last_call_at) {
      const rest = REST_DAYS[(last && last.outcome) || 'no_answer'] ?? 2;
      const dueAt = (last && last.call_back_at) ? Number(last.call_back_at) : Number(r.last_call_at) + rest * DAY;
      if (dueAt > atMs) continue;                              // resting, or not due until the date they gave
    }
    out.push({
      organization_id: r.id, name: r.name, phone: r.phone, city: r.city, county: r.county,
      category: r.business_category, tier: r.current_tier, score: r.current_score,
      capacity: r.employee_or_capacity_hint, license_status: r.provider_status,
      website: r.website, stage: r.stage, emailable: r.emailable > 0,
      last_call_at: r.last_call_at || null, last_outcome: last ? last.outcome : null,
      card: callCard(r),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Log a call. Writes into the MODEL, not just the feed: a head count becomes capacity (and a
 * rescore), a named person with an email becomes a contact, an outcome moves the stage, and
 * "do not call" suppresses the organization outright.
 */
export async function logCall(env, input = {}, { ctx } = {}) {
  const orgId = String(input.organization_id || '');
  const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  if (!isOutcome(input.outcome)) return { ok: false, error: `Outcome must be one of: ${CALL_OUTCOMES.map((o) => o.key).join(', ')}.` };
  const outcome = String(input.outcome);
  const done = { capacity_set: false, contact_added: false, rescored: false, suppressed: false, stage: null };

  const heads = Number(input.headcount);
  if (Number.isFinite(heads) && heads > 0) {
    const u = await updateOrganization(env, orgId, { employee_or_capacity_hint: `${Math.round(heads)} attend daily (said on a call)` }, { ctx });
    done.capacity_set = !!(u && u.ok);
  }

  // A name and an email given on a call are owner-verified: a better source than a scraped page.
  if (input.contact_name || input.contact_email) {
    const { addContact } = await import('./store.js');
    const { roleCategoryOf } = await import('./enrich.js');
    const c = await addContact(env, orgId, {
      full_name: input.contact_name || null, title: input.contact_title || null,
      role_category: roleCategoryOf(input.contact_title || ''),
      email: input.contact_email || undefined, phone: input.contact_phone || org.phone || null,
      email_status: input.contact_email ? 'owner_verified' : undefined, confidence: 'high',
    }, { ctx, source: 'manual', source_url: null });
    done.contact_added = !!(c && c.ok);
  }

  if (outcome === 'do_not_call') {
    await suppressOrganization(env, orgId, { reason: 'Asked not to be contacted, on a call', ctx });
    done.suppressed = true;
  }

  // An outcome that advances the deal moves the stage; the rest leave it alone.
  const opp = await salesRow(env, "SELECT id, stage FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", orgId);
  if (opp && (outcome === 'reached_decision_maker' || outcome === 'send_info')) {
    const { setStage } = await import('./store.js');
    const want = outcome === 'send_info' ? 'engaged' : 'contacted';
    if (opp.stage !== want && opp.stage !== 'engaged') {
      const st = await setStage(env, opp.id, want, { note: 'From a logged call', ctx });
      if (st && st.ok) done.stage = want;
    }
  }

  const callBackAt = input.call_back_at ? Number(input.call_back_at) : null;
  await logActivity(env, {
    organization_id: orgId, opportunity_id: opp ? opp.id : null, kind: 'call', ctx,
    event: 'sales.call_logged',
    detail: {
      outcome, notes: input.notes ? String(input.notes).slice(0, 800) : null,
      headcount: Number.isFinite(heads) && heads > 0 ? Math.round(heads) : null,
      contact_name: input.contact_name || null, contact_email: input.contact_email || null,
      call_back_at: callBackAt, at: now(),
    },
    props: { outcome, has_headcount: !!(Number.isFinite(heads) && heads > 0) },
  });

  if (done.capacity_set || done.contact_added) {
    const { loadSalesConfig } = await import('./config.js');
    const cfg = await loadSalesConfig(env);
    await scoreAndStore(env, orgId, { cfg, ctx });
    done.rescored = true;
  }
  return { ok: true, outcome, ...done };
}

/** Yesterday and today at a glance: did the calling happen, and what came of it. */
export async function callStats(env, { atMs = Date.now() } = {}) {
  const since = atMs - 7 * DAY;
  const rows = await salesRows(env,
    "SELECT detail_json, created_at FROM sales_activity WHERE kind = 'call' AND created_at >= ?", since);
  const byOutcome = {};
  let today = 0;
  const startOfToday = new Date(atMs).setHours(0, 0, 0, 0);
  for (const r of rows) {
    const d = parseJson(r.detail_json, {}) || {};
    byOutcome[d.outcome || 'unknown'] = (byOutcome[d.outcome || 'unknown'] || 0) + 1;
    if (r.created_at >= startOfToday) today++;
  }
  return { last_7_days: rows.length, today, by_outcome: byOutcome };
}
