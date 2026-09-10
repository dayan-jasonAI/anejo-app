// /api/hub/owner/sales/settings — flags and owner-editable Sales settings (OWNER ONLY).
//
//   POST { op:'set_flag', key, value }                       → one feature flag (locked flags refuse)
//   POST { op:'save', key:'sales.icp'|'sales.offer'|'sales.proof'|'sales.sender'|'sales.send_window'|'sales.service_area', value, confirm? }
//   POST { op:'step_delay', step_id, delay_hours }           → owner-editable sequence timing
//
// The OFFER is special: saving it with confirm:true is the owner saying "these are the words and
// facts that may go to a clinic". Any later save without confirm un-confirms it, and outbound email
// refuses to send while it is unconfirmed (outreach.js sendReadiness).
import { json, bad, isEmail } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { loadSalesConfig, setFlag, saveJsonSetting, JSON_SETTINGS } from '../../../../_lib/sales/config.js';
import { logActivity } from '../../../../_lib/sales/store.js';
import { ICP_CATEGORIES } from '../../../../_lib/sales/anejo.js';
import { getDoc, createProposal, BRAND_DOC_ID } from '../../../../_lib/brief.js';

// Sprint E: the positioning the marketing team needs, filed as a Brand Brief PROPOSAL — the same
// owner-approval path Creative Studio uses (Reviews → brief-proposals). The brief is the owner's
// document and grounds the Team Lead, the planner, governance and Aña; nothing here edits it.
export const POSITIONING_TITLE = 'Add institutional accounts (Añejo Managed Meal Service) to the brief';
export const POSITIONING_SECTION = [
  '## Institutional accounts — Añejo Managed Meal Service (proposed 2026-09)',
  '',
  '1. Añejo is not bowl-only. Traditional Cuban catering and menu products — La Cajita, croquetas, ensalada fría, Cuban plates and trays — are first-class, alongside the Fit bowls.',
  '2. Recurring institutional meal service ("Añejo Managed Meal Service") is a strategic product: scheduled, freshly prepared meals for clinics and program facilities, with a private daily headcount link for each site and one invoice for the account.',
  '3. The live menu controls every price and every availability statement. Delivery days, cutoffs, capacity and service area come from live settings — never from memory, and never invented.',
  '4. Institutional content sends people to the business page (anejocateringco.com/business), not to consumer checkout.',
  '5. Never name a customer (DGP included) or its numbers without recorded permission. No medical, nutrition-treatment or outcome claims about institutional meals.',
  '',
  'ES — Añejo no es solo bowls: el catering tradicional cubano (La Cajita, croquetas, ensalada fría, bandejas) es de primera clase. El servicio de comidas recurrente para clínicas y programas ("Añejo Managed Meal Service") es un producto estratégico. Precios y disponibilidad salen del menú en vivo; nunca se nombra a un cliente sin permiso registrado; sin afirmaciones médicas.',
].join('\n');

function validate(key, v) {
  if (key === 'sales.offer') {
    if (!['on_request', 'show_from'].includes(v.pricing_display_policy || 'on_request')) return 'Pricing display must be "on request" or "from a price".';
    if (v.price_from_cents != null && v.price_from_cents !== '' && !Number.isInteger(Number(v.price_from_cents))) return 'The "from" price must be whole cents.';
    if (v.pricing_display_policy === 'show_from' && !(Number(v.price_from_cents) > 0)) return 'Set the "from" price (in cents) to show pricing.';
    if (v.sample_menu_item_ids && (!Array.isArray(v.sample_menu_item_ids) || v.sample_menu_item_ids.length > 12)) return 'Pick at most 12 sample menu items.';
    for (const k of ['headline', 'value_prop', 'cta_text']) if (!String(v[k] || '').trim()) return `The offer needs a ${k.replace('_', ' ')}.`;
  }
  if (key === 'sales.sender') {
    if (v.from_email && !isEmail(v.from_email)) return 'The from-address is not a valid email.';
    if (v.reply_to && !isEmail(v.reply_to)) return 'The reply-to address is not a valid email.';
  }
  if (key === 'sales.send_window') {
    const days = Array.isArray(v.days) ? v.days.map(Number) : [];
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Pick the send days.';
    const s = Number(v.start_hour); const e = Number(v.end_hour);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 6 || e > 20 || s >= e) return 'The send window must be between 6:00 and 20:00, start before end.';
  }
  if (key === 'sales.icp') {
    const w = v.weights || {};
    for (const [k, n] of Object.entries(w)) if (!(Number(n) >= 0 && Number(n) <= 50)) return `Weight ${k} must be 0–50.`;
    const t = v.tiers || {};
    if (t.A != null && !(Number(t.A) > Number(t.B) && Number(t.B) > Number(t.C))) return 'Tier thresholds must run A > B > C.';
    for (const k of Object.keys(v.category_fit || {})) if (!ICP_CATEGORIES[k]) return `Unknown category ${k}.`;
  }
  if (key === 'sales.proof' && v.mode === 'named' && !v.named_permission_recorded) return 'Named proof needs the customer’s permission recorded first.';
  return null;
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const by = ctx.distinct_id || ctx.email;

  if (b.op === 'set_flag') {
    const r = await setFlag(env, String(b.key || ''), b.value, by);
    if (!r.ok) return json(r, r.locked ? 409 : 400);
    await logActivity(env, { kind: 'setting', ctx, detail: { key: r.key, value: r.value } });
    return json({ ...r, flags: (await loadSalesConfig(env)).flags });
  }
  if (b.op === 'save') {
    const key = String(b.key || '');
    if (!Object.prototype.hasOwnProperty.call(JSON_SETTINGS, key)) return bad('Unknown setting.');
    const value = b.value && typeof b.value === 'object' && !Array.isArray(b.value) ? { ...b.value } : null;
    if (!value) return bad('Settings must be an object.');
    if (key === 'sales.offer') {
      value.confirmed = b.confirm === true;
      if (value.price_from_cents === '' || value.price_from_cents == null) value.price_from_cents = null;
      else value.price_from_cents = Number(value.price_from_cents);
    }
    const err = validate(key, value);
    if (err) return bad(err);
    const r = await saveJsonSetting(env, key, value, by);
    if (!r.ok) return bad(r.error);
    await logActivity(env, { kind: 'setting', ctx, detail: { key, confirmed: key === 'sales.offer' ? value.confirmed : undefined } });
    const cfg = await loadSalesConfig(env);
    return json({ ok: true, key, value: cfg[key.replace('sales.', '')] });
  }
  if (b.op === 'propose_positioning') {
    const pending = await env.DB.prepare("SELECT id FROM brief_proposals WHERE title = ? AND status = 'pending' LIMIT 1").bind(POSITIONING_TITLE).first().catch(() => null);
    if (pending) return json({ ok: true, proposal_id: pending.id, already: true, next: 'It is already waiting in Reviews.' });
    const doc = await getDoc(env, BRAND_DOC_ID);
    const current = String((doc && doc.body) || '').trim();
    // An approval REPLACES the brief with the proposed body, so a proposal built on an empty brief
    // would replace everything with one section. Refuse instead.
    if (!current) return bad('The Brand & Standards Brief has not been created in the Hub yet, so there is nothing to add this to.', 409);
    if (current.includes('Añejo Managed Meal Service')) return json({ ok: true, already_in_brief: true, next: 'The brief already covers the Managed Meal Service.' });
    const p = await createProposal(env, {
      docId: BRAND_DOC_ID, staff: { id: ctx.distinct_id }, role: ctx.role, title: POSITIONING_TITLE,
      rationale: 'Sales OS (2026-09): the marketing team — Team Lead, planner, governance, Aña — reads the brief as its source of truth and does not yet know institutional recurring meal service is a strategic product, or that traditional Cuban catering is first-class. Approving adds one section; nothing else changes.',
      proposed_body: `${current}\n\n${POSITIONING_SECTION}\n`,
    });
    if (!p) return bad('Could not file the proposal.', 500);
    await logActivity(env, { kind: 'setting', ctx, detail: { proposed_brief_change: p.id } });
    return json({ ok: true, proposal_id: p.id, next: 'Filed in Reviews — approve it there to teach the marketing team.' });
  }
  if (b.op === 'step_delay') {
    const hours = Number(b.delay_hours);
    if (!Number.isInteger(hours) || hours < 24 || hours > 720) return bad('A follow-up delay is 24 to 720 hours (1–30 days).');
    const r = await env.DB.prepare('UPDATE sales_sequence_steps SET delay_hours=?, updated_at=? WHERE id=? AND step_number > 1').bind(hours, Date.now(), String(b.step_id || '')).run();
    if (!r.meta || r.meta.changes !== 1) return bad('Step not found (the first step always goes on approval).', 404);
    await logActivity(env, { kind: 'setting', ctx, detail: { step_id: b.step_id, delay_hours: hours } });
    return json({ ok: true, step_id: b.step_id, delay_hours: hours });
  }
  return bad('Unknown action.');
};
