// Sales OS — the AI Account Brief: a sourced, honest read-out of one prospect for the owner.
// Files under functions/_lib are NOT routed.
//
// The model receives STRUCTURED FACTS with their source URLs — never a bare organization name to
// free-associate about — and its answer is post-validated in code before anyone sees it:
//   · a source URL it did not receive is dropped (it cannot cite a page it never read)
//   · a person it names who is not in the extracted contacts is replaced with "not identified"
//   · any price or dollar figure is removed (prices come from the owner, never the brief)
//   · health/outcome claims are flagged
//   · thin evidence is SAID, in the brief's own "uncertain" list
// The brief is advisory. It is never an input to the score (scoring.js does not import this file)
// and it never writes an email on its own.
import { id, now, toJson } from '../hub.js';
import { budgetGate, recordSpend } from '../ai_budget.js';
import { buildFacts, logActivity, salesRow } from './store.js';
import { cleanText } from './normalize.js';

const MODEL = 'claude-haiku-4-5';
const API = 'https://api.anthropic.com/v1/messages';

export const BRIEF_FIELDS = ['organization', 'location', 'what_it_does', 'why_fit', 'likely_meal_need', 'likely_decision_maker',
  'operational_clues', 'recommended_angle', 'recommended_cta', 'likely_objections', 'uncertain_facts', 'sources_used'];
const LIST_FIELDS = new Set(['operational_clues', 'likely_objections', 'uncertain_facts', 'sources_used']);

const PRICE_RE = /\$\s?\d|\b\d+(?:\.\d{2})?\s*(?:dollars|usd|per (?:meal|plate|person|head))\b/i;
const HEALTH_RE = /\b(cure[sd]?|heal(?:s|ing)?|therapeutic|clinically|medically|prevents?|improves? (?:recovery|outcomes|health)|boosts? (?:immunity|recovery)|guarantee[ds]?)\b/i;

function factsPayload(facts, score, offer) {
  const org = facts.organization;
  const sources = new Set();
  const signals = (facts.signals || []).slice(0, 24).map((s) => { if (s.url) sources.add(s.url); return { kind: s.kind, snippet: s.snippet, url: s.url }; });
  if (org.website) sources.add(org.website);
  return {
    organization: {
      name: org.name, category: org.business_category, city: org.city, county: org.county, state: org.state,
      website: org.website, capacity_hint: org.employee_or_capacity_hint || null,
    },
    public_signals: signals,
    contacts: (facts.contacts || []).filter((c) => !c.suppressed).slice(0, 10).map((c) => ({
      name: c.full_name || null, title: c.title || null, role: c.role_category || null,
      email_found: !!c.email, email_status: c.email_status, confidence: c.confidence,
    })),
    score: score ? { score: score.score, tier: score.tier, reasons: (score.criteria || []).map((c) => `${c.label}: ${c.points}/${c.max} — ${(c.reasons || []).join(' ')}`) } : null,
    our_offer: { product: offer.product_name, value_prop: offer.value_prop, cta: offer.cta_text, tasting_enabled: !!offer.tasting_enabled },
    allowed_source_urls: [...sources],
  };
}

function systemPrompt() {
  return 'You write internal account briefs for the owner of Añejo Catering Co., a Palm Beach County kitchen that sells a recurring '
    + 'scheduled meal service to clinics and program facilities. You receive STRUCTURED FACTS about ONE organization, gathered from its '
    + 'own public website, with the URL each fact came from.\n\n'
    + 'RULES — breaking any of them makes the brief useless:\n'
    + '- Use ONLY the facts provided. Do not add knowledge about this organization from memory. If a field cannot be supported, say "Not '
    + 'supported by the public evidence we have."\n'
    + '- Never invent or estimate prices, budgets, headcounts, bed counts, schedules, vendors, or people. Never write a dollar amount.\n'
    + '- Name a decision-maker ONLY if that exact person appears in "contacts". Otherwise write "Not identified from public sources".\n'
    + '- No medical, nutritional or outcome claims about food.\n'
    + '- "sources_used" may contain ONLY URLs from allowed_source_urls.\n'
    + '- If the evidence is thin, say so plainly in uncertain_facts.\n\n'
    + 'Return ONLY a JSON object with exactly these keys: organization, location, what_it_does, why_fit, likely_meal_need, '
    + 'likely_decision_maker, operational_clues (array of strings), recommended_angle, recommended_cta, likely_objections (array), '
    + 'uncertain_facts (array), sources_used (array of URLs). Keep every string under 300 characters.';
}

/** Built from facts alone — what the owner sees when the model is unavailable. Never pretends to be more. */
export function deterministicBrief(facts, score, offer) {
  const org = facts.organization;
  const kinds = new Set((facts.signals || []).map((s) => s.kind));
  const dm = (facts.contacts || []).find((c) => c.full_name && c.role_category && !['admissions', 'general_office', 'other'].includes(c.role_category));
  const uncertain = [];
  if (!kinds.has('capacity') && !org.employee_or_capacity_hint) uncertain.push('Capacity / daily headcount is not stated publicly.');
  if (!kinds.has('meals') && !kinds.has('meals_provided')) uncertain.push('No public mention of meals or food service.');
  if (!kinds.has('day_program') && !kinds.has('residential')) uncertain.push('No public evidence of an on-site day or residential program.');
  if (!dm) uncertain.push('No decision-maker identified from public sources.');
  if (!(facts.signals || []).length) uncertain.push('We have not read their website yet (or it had nothing relevant).');
  return {
    organization: org.name,
    location: [org.city, org.county ? `${org.county} County` : null, org.state].filter(Boolean).join(', ') || 'Unknown',
    what_it_does: org.business_category ? org.business_category.replace(/_/g, ' ') : 'Not supported by the public evidence we have.',
    why_fit: score ? `Scored ${score.score}/100 (tier ${score.tier}). ${(score.criteria || []).filter((c) => c.points > 0).map((c) => c.label).join(', ') || 'No criteria earned points yet.'}` : 'Not scored yet.',
    likely_meal_need: kinds.has('day_program') || kinds.has('residential') ? 'Clients are on site for a program, so a daytime meal is plausible — confirm with them.' : 'Not supported by the public evidence we have.',
    likely_decision_maker: dm ? `${dm.full_name}${dm.title ? ', ' + dm.title : ''}` : 'Not identified from public sources',
    operational_clues: (facts.signals || []).slice(0, 5).map((s) => `${s.kind.replace(/_/g, ' ')}: “${s.snippet}”`),
    recommended_angle: 'Lead with the verified fact about their program and the daily headcount link; keep it short.',
    recommended_cta: offer.cta_text,
    likely_objections: ['They may already have a meal vendor or an in-house kitchen.', 'Budget and per-meal price.', 'Minimum headcount or delivery days.'],
    uncertain_facts: uncertain,
    sources_used: [...new Set((facts.signals || []).map((s) => s.url).filter(Boolean))].slice(0, 8),
  };
}

/** Post-validation. Returns { brief, flags }. Exported for tests. */
export function validateBrief(raw, payload) {
  const flags = [];
  const allowed = new Set(payload.allowed_source_urls || []);
  const contactNames = (payload.contacts || []).map((c) => String(c.name || '').toLowerCase()).filter(Boolean);
  const out = {};
  for (const k of BRIEF_FIELDS) {
    let v = raw ? raw[k] : undefined;
    if (LIST_FIELDS.has(k)) {
      v = (Array.isArray(v) ? v : v ? [v] : []).map((x) => cleanText(x, 300)).filter(Boolean).slice(0, 8);
    } else {
      v = cleanText(v == null ? '' : v, 300) || 'Not supported by the public evidence we have.';
    }
    out[k] = v;
  }
  // Sources it never received.
  const kept = out.sources_used.filter((u) => allowed.has(u));
  if (kept.length !== out.sources_used.length) flags.push({ type: 'source_removed', detail: `${out.sources_used.length - kept.length} cited URL(s) were not in the evidence and were removed.` });
  out.sources_used = kept;
  // A person not in the extracted contacts.
  const dm = out.likely_decision_maker;
  if (dm && !/not identified|not supported/i.test(dm)) {
    const lower = dm.toLowerCase();
    if (!contactNames.some((n) => lower.includes(n))) {
      flags.push({ type: 'person_removed', detail: 'The model named a decision-maker who is not in the extracted contacts; replaced.' });
      out.likely_decision_maker = 'Not identified from public sources';
    }
  }
  // Prices and health claims.
  for (const k of BRIEF_FIELDS) {
    const vals = LIST_FIELDS.has(k) ? out[k] : [out[k]];
    const clean = vals.map((v) => {
      if (PRICE_RE.test(v)) { flags.push({ type: 'price_removed', detail: `A price was removed from "${k}".` }); return LIST_FIELDS.has(k) ? null : 'Pricing is set by the owner, not by this brief.'; }
      if (HEALTH_RE.test(v)) flags.push({ type: 'health_claim', detail: `"${k}" makes a health/outcome claim — do not reuse it in outreach.` });
      return v;
    }).filter((v) => v != null);
    out[k] = LIST_FIELDS.has(k) ? clean : clean[0];
  }
  if (!out.uncertain_facts.length && (payload.public_signals || []).length < 2) {
    out.uncertain_facts = ['Public evidence is thin — fewer than two relevant facts were found on their site.'];
    flags.push({ type: 'thin_evidence', detail: 'Added the thin-evidence note the model left out.' });
  }
  return { brief: out, flags };
}

function parseJsonLoose(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/**
 * Generate and store a brief. Falls back to the deterministic brief (kind 'deterministic') with no
 * key, no budget, or an unusable answer — and says which.
 */
export async function generateBrief(env, orgId, { cfg, ctx, fetchImpl = fetch } = {}) {
  const facts = await buildFacts(env, orgId);
  if (!facts) return { ok: false, error: 'Organization not found.' };
  const scoreRow = await salesRow(env, 'SELECT * FROM sales_scores WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1', orgId);
  const score = scoreRow ? { score: scoreRow.score, tier: scoreRow.tier, criteria: JSON.parse(scoreRow.criteria_json || '[]') } : null;
  const payload = factsPayload(facts, score, cfg.offer);

  let brief = null;
  let flags = [];
  let kind = 'deterministic';
  let why = null;
  if (!env.ANTHROPIC_API_KEY) why = 'no ANTHROPIC_API_KEY';
  else if (!(await budgetGate(env)).ok) why = 'weekly AI budget reached';
  else {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
    try {
      const r = await fetchImpl(API, {
        method: 'POST',
        signal: ctl ? ctl.signal : undefined,
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1400, system: systemPrompt(),
          messages: [{ role: 'user', content: 'FACTS (JSON):\n' + JSON.stringify(payload) }],
        }),
      });
      const data = await r.json().catch(() => null);
      if (data && data.usage) await recordSpend(env, { feature: 'sales_brief', model: MODEL, usage: data.usage });
      const text = data && Array.isArray(data.content) ? data.content.filter((c) => c.type === 'text').map((c) => c.text).join('') : '';
      const parsed = r.ok ? parseJsonLoose(text) : null;
      if (parsed) {
        const v = validateBrief(parsed, payload);
        brief = v.brief; flags = v.flags; kind = 'ai';
      } else why = r.ok ? 'model answer was not valid JSON' : `model call failed (HTTP ${r.status})`;
    } catch (e) {
      why = /abort/i.test(String(e && e.name)) ? 'model call timed out' : 'model call failed';
    } finally { if (timer) clearTimeout(timer); }
  }
  if (!brief) {
    brief = deterministicBrief(facts, score, cfg.offer);
    flags = [{ type: 'deterministic', detail: `AI brief unavailable (${why}); this brief is assembled from the facts alone.` }];
  }
  const bid = id('sbrf');
  await env.DB.prepare(
    'INSERT INTO sales_briefs (id, organization_id, kind, brief_json, sources_json, flags_json, model, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(bid, orgId, kind, toJson(brief), toJson(payload.allowed_source_urls), toJson(flags), kind === 'ai' ? MODEL : null,
    (ctx && ctx.distinct_id) || 'system', now()).run();
  await logActivity(env, { organization_id: orgId, kind: 'brief', ctx, detail: { kind, flags: flags.map((f) => f.type) } });
  return { ok: true, brief_id: bid, kind, brief, flags };
}
