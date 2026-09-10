// Sales OS — proposals and the bridge into the proven operation: Convert to Contract Account.
// Files under functions/_lib are NOT routed.
//
// This is the ONE place a sales conversation becomes money-bearing state, so it follows the same
// fail-safe rules as the catering quote path:
//   · INTEGER CENTS ONLY. A float price is refused, not rounded — a float means dollars went into a
//     cents field, and rounding it would hide that.
//   · NO PHANTOM $0. A per-meal price must be a positive integer. An empty field is refused, not
//     read as zero.
//   · TOTALS MUST AGREE. The monthly estimate is recomputed from the line terms; a proposal whose
//     stated estimate differs by a single cent is refused, not reconciled.
//   · OWNER-CONFIRMED ONLY. Conversion accepts a proposal the owner confirmed, and only while its
//     terms are exactly what he confirmed. Nothing here reads an AI output.
//   · NEVER OVERWRITES AN EXISTING ACCOUNT. Conversion always creates a NEW contract account through
//     the existing registerAccount()/activateAccount() path and touches only that new account. A
//     name or billing email that already exists (DGP, for one) stops it cold with a "link instead".
//   · IDEMPOTENT. A second click returns the account the first click created.
import { id, now, toJson, parseJson } from '../hub.js';
import { isEmail } from '../util.js';
import { capture } from '../track.js';
import { registerAccount, activateAccount, addSiteStaff, parseDeliveryDays } from '../contract.js';
import { logActivity, stopSequences, advanceStage, salesRow, salesRows, CLOSED_STAGES } from './store.js';

// Mirrors the billing models registerAccount() understands. registerAccount silently falls back to
// 'biweekly' on an unknown value; conversion REFUSES instead, because billing the account on a
// cadence the owner did not choose is exactly the kind of quiet substitution this file exists to stop.
export const BILLING_MODELS = ['weekly_autopay', 'biweekly', 'monthly', 'same_day'];
export const MEAL_WINDOWS = ['lunch', 'dinner'];

/** (price × meals + delivery fee) × days/week × 52 / 12, rounded to the cent. Delivery is billed once per day per account. */
export function monthlyEstimateCents({ price_per_meal_cents, meals_per_day, days_per_week, delivery_fee_cents }) {
  return Math.round(((price_per_meal_cents * meals_per_day) + delivery_fee_cents) * days_per_week * 52 / 12);
}

const isCents = (v) => typeof v === 'number' ? Number.isInteger(v) : (typeof v === 'string' && /^\d+$/.test(v.trim()));
const toInt = (v) => Number(typeof v === 'string' ? v.trim() : v);

/**
 * Validate proposal terms. Returns { ok, errors[], terms } — terms is the normalised object that is
 * stored and, later, converted. `requireEstimateMatch` enforces the totals rule.
 */
export function validateProposal(input = {}, { orgName } = {}) {
  const errors = [];
  const terms = {};
  const cents = (key, label, { min = 0 } = {}) => {
    const v = input[key];
    if (v === null || v === undefined || v === '') { errors.push(`${label} is required (use 0 if there is none).`); return null; }
    if (!isCents(v)) { errors.push(`${label} must be whole cents — got ${JSON.stringify(v)}.`); return null; }
    const n = toInt(v);
    if (n < min) { errors.push(`${label} must be at least ${min} cents.`); return null; }
    return n;
  };
  const int = (key, label, lo, hi) => {
    const v = input[key];
    if (v === null || v === undefined || v === '' || !Number.isInteger(Number(v))) { errors.push(`${label} must be a whole number.`); return null; }
    const n = Number(v);
    if (n < lo || n > hi) { errors.push(`${label} must be between ${lo} and ${hi}.`); return null; }
    return n;
  };

  terms.account_name = String(input.account_name || orgName || '').trim().slice(0, 120);
  if (!terms.account_name) errors.push('Account name is required.');
  terms.meal_window = MEAL_WINDOWS.includes(input.meal_window) ? input.meal_window : 'lunch';
  // "No phantom $0": a price per meal must be a positive number of cents.
  terms.price_per_meal_cents = cents('price_per_meal_cents', 'Price per meal', { min: 1 });
  terms.meals_per_day = int('meals_per_day', 'Meals per day', 1, 2000);
  terms.days_per_week = int('days_per_week', 'Days per week', 1, 7);
  terms.delivery_fee_cents = cents('delivery_fee_cents', 'Delivery fee');
  terms.rush_fee_cents = cents('rush_fee_cents', 'Rush fee');
  const days = parseDeliveryDays(input.delivery_days || '');
  terms.delivery_days = days.join(',');
  if (!days.length) errors.push('Pick the delivery days.');
  else if (terms.days_per_week != null && days.length !== terms.days_per_week) errors.push(`Delivery days (${days.length}) and days per week (${terms.days_per_week}) disagree.`);
  terms.cutoff_time = String(input.cutoff_time || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(terms.cutoff_time)) errors.push('Headcount cutoff must be a time like 09:00.');
  terms.billing_model = String(input.billing_model || '');
  if (!BILLING_MODELS.includes(terms.billing_model)) errors.push(`Billing model must be one of: ${BILLING_MODELS.join(', ')}.`);
  terms.billing_email = String(input.billing_email || '').trim().toLowerCase();
  if (!isEmail(terms.billing_email)) errors.push('A valid billing email is required.');
  terms.billing_contact = String(input.billing_contact || '').trim().slice(0, 80) || null;
  terms.start_date = input.start_date ? String(input.start_date).trim() : null;
  if (terms.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(terms.start_date)) errors.push('Start date must be YYYY-MM-DD.');
  terms.special_terms = String(input.special_terms || '').trim().slice(0, 2000) || null;
  terms.headcount_workflow = String(input.headcount_workflow || '').trim().slice(0, 500) || null;

  const sites = Array.isArray(input.sites) ? input.sites : [];
  if (!sites.length) errors.push('Add at least one delivery location.');
  if (sites.length > 20) errors.push('At most 20 locations per proposal.');
  terms.sites = sites.slice(0, 20).map((st, i) => {
    const o = {
      name: String((st && st.name) || '').trim().slice(0, 80),
      street: String((st && st.street) || '').trim().slice(0, 160),
      unit: String((st && st.unit) || '').trim().slice(0, 60) || null,
      city: String((st && st.city) || '').trim().slice(0, 80),
      state: (String((st && st.state) || 'FL').trim() || 'FL').slice(0, 20),
      zip: String((st && st.zip) || '').trim().slice(0, 12),
      window_label: String((st && st.window_label) || '').trim().slice(0, 40) || null,
      contact_name: String((st && st.contact_name) || '').trim().slice(0, 80) || null,
      contact_phone: String((st && st.contact_phone) || '').trim().slice(0, 30) || null,
    };
    if (!o.name || !o.street || !o.city) errors.push(`Location ${i + 1} needs a name, street and city.`);
    return o;
  });
  const contacts = Array.isArray(input.contacts) ? input.contacts : [];
  terms.contacts = contacts.slice(0, 40).map((c) => ({
    site_index: Number(c && c.site_index), name: String((c && c.name) || '').trim().slice(0, 80), phone: String((c && c.phone) || '').trim().slice(0, 30),
  })).filter((c) => c.name || c.phone);
  for (const c of terms.contacts) {
    if (!Number.isInteger(c.site_index) || c.site_index < 0 || c.site_index >= terms.sites.length) errors.push(`Contact "${c.name}" points at a location that does not exist.`);
  }

  if (terms.price_per_meal_cents != null && terms.meals_per_day != null && terms.days_per_week != null && terms.delivery_fee_cents != null) {
    const computed = monthlyEstimateCents(terms);
    const stated = input.estimated_monthly_cents;
    if (stated !== undefined && stated !== null && stated !== '') {
      if (!isCents(stated)) errors.push('The monthly estimate must be whole cents.');
      else if (toInt(stated) !== computed) {
        errors.push(`The monthly estimate ($${(toInt(stated) / 100).toFixed(2)}) does not match these terms ($${(computed / 100).toFixed(2)}). Fix the terms or the estimate — they must agree.`);
      }
    }
    terms.estimated_monthly_cents = computed;
  }
  return { ok: errors.length === 0, errors, terms };
}

function rowToTerms(p) {
  return {
    account_name: p.account_name, meal_window: p.meal_window, price_per_meal_cents: p.price_per_meal_cents,
    meals_per_day: p.meals_per_day, days_per_week: p.days_per_week, delivery_days: p.delivery_days,
    delivery_fee_cents: p.delivery_fee_cents, rush_fee_cents: p.rush_fee_cents, cutoff_time: p.cutoff_time,
    billing_model: p.billing_model, billing_email: p.billing_email, billing_contact: p.billing_contact,
    start_date: p.start_date, special_terms: p.special_terms, headcount_workflow: p.headcount_workflow,
    sites: parseJson(p.sites_json, []), contacts: parseJson(p.contacts_json, []), estimated_monthly_cents: p.estimated_monthly_cents,
  };
}

/**
 * Save the proposal for an opportunity (creates, or updates the open draft). Editing a CONFIRMED
 * proposal un-confirms it — terms the owner has not re-confirmed can never be converted.
 * Drafts may be incomplete; `validation` tells the page what is still missing.
 */
export async function saveProposal(env, { opportunity_id, fields = {}, ctx } = {}) {
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', opportunity_id);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  if (CLOSED_STAGES.includes(opp.stage)) return { ok: false, error: `This opportunity is ${opp.stage}.` };
  const org = await salesRow(env, 'SELECT name FROM sales_organizations WHERE id = ?', opp.organization_id);
  const v = validateProposal(fields, { orgName: org && org.name });
  if (v.errors.some((e) => /does not match these terms/.test(e))) return { ok: false, error: v.errors.find((e) => /does not match/.test(e)), errors: v.errors };
  const t = v.terms;
  const current = await salesRow(env, "SELECT * FROM sales_proposals WHERE opportunity_id = ? AND status IN ('draft','confirmed') ORDER BY created_at DESC LIMIT 1", opportunity_id);
  const now_ = now();
  const cols = [t.account_name, t.meal_window, t.price_per_meal_cents, t.meals_per_day, t.days_per_week, t.delivery_days || null,
    t.delivery_fee_cents, t.rush_fee_cents, t.cutoff_time || null, t.billing_model || null, t.billing_email || null, t.billing_contact,
    toJson(t.sites), toJson(t.contacts), t.start_date, t.special_terms, t.headcount_workflow, t.estimated_monthly_cents ?? null];
  let pid;
  let created = false;
  if (current) {
    pid = current.id;
    await env.DB.prepare(
      `UPDATE sales_proposals SET account_name=?, meal_window=?, price_per_meal_cents=?, meals_per_day=?, days_per_week=?, delivery_days=?,
         delivery_fee_cents=?, rush_fee_cents=?, cutoff_time=?, billing_model=?, billing_email=?, billing_contact=?, sites_json=?, contacts_json=?,
         start_date=?, special_terms=?, headcount_workflow=?, estimated_monthly_cents=?, status='draft', confirmed_by=NULL, confirmed_at=NULL,
         updated_at=? WHERE id=? AND status IN ('draft','confirmed')`
    ).bind(...cols, now_, pid).run();
  } else {
    pid = id('sprp');
    created = true;
    await env.DB.prepare(
      `INSERT INTO sales_proposals (id, opportunity_id, status, account_name, meal_window, price_per_meal_cents, meals_per_day, days_per_week,
         delivery_days, delivery_fee_cents, rush_fee_cents, cutoff_time, billing_model, billing_email, billing_contact, sites_json, contacts_json,
         start_date, special_terms, headcount_workflow, estimated_monthly_cents, created_by, created_at, updated_at)
       VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(pid, opportunity_id, ...cols, (ctx && ctx.distinct_id) || null, now_, now_).run();
  }
  if (t.estimated_monthly_cents != null) {
    await env.DB.prepare('UPDATE sales_opportunities SET estimated_meals_per_day=?, estimated_days_per_week=?, estimated_monthly_revenue_cents=?, updated_at=? WHERE id=?')
      .bind(t.meals_per_day, t.days_per_week, t.estimated_monthly_cents, now_, opportunity_id).run();
  }
  await advanceStage(env, opportunity_id, 'proposal', ctx);
  await logActivity(env, {
    organization_id: opp.organization_id, opportunity_id, kind: 'proposal', ctx,
    detail: { proposal_id: pid, created, complete: v.ok, missing: v.errors.length },
    event: created ? 'sales.proposal_created' : null, props: { proposal_id: pid },
  });
  return { ok: true, proposal_id: pid, created, complete: v.ok, errors: v.errors, estimated_monthly_cents: t.estimated_monthly_cents ?? null };
}

/** The owner confirms the terms he has read. `expect_monthly_cents` is the number on his screen. */
export async function confirmProposal(env, proposalId, { ctx, expect_monthly_cents } = {}) {
  if (!ctx || ctx.role !== 'owner') return { ok: false, error: 'Only the owner can confirm commercial terms.' };
  const p = await salesRow(env, 'SELECT * FROM sales_proposals WHERE id = ?', proposalId);
  if (!p) return { ok: false, error: 'Proposal not found.' };
  if (p.status !== 'draft' && p.status !== 'confirmed') return { ok: false, error: `This proposal is ${p.status}.` };
  const v = validateProposal({ ...rowToTerms(p), estimated_monthly_cents: p.estimated_monthly_cents });
  if (!v.ok) return { ok: false, error: 'The proposal is not complete.', errors: v.errors };
  if (Number(expect_monthly_cents) !== v.terms.estimated_monthly_cents) {
    return { ok: false, error: `The monthly total changed since you looked — it is $${(v.terms.estimated_monthly_cents / 100).toFixed(2)}. Review it and confirm again.`, code: 'stale_total' };
  }
  const t = now();
  await env.DB.prepare("UPDATE sales_proposals SET status='confirmed', confirmed_by=?, confirmed_at=?, updated_at=? WHERE id=? AND status IN ('draft','confirmed')")
    .bind(ctx.distinct_id, t, t, proposalId).run();
  const opp = await salesRow(env, 'SELECT organization_id FROM sales_opportunities WHERE id = ?', p.opportunity_id);
  await logActivity(env, { organization_id: opp && opp.organization_id, opportunity_id: p.opportunity_id, kind: 'proposal_confirmed', ctx, detail: { proposal_id: proposalId, estimated_monthly_cents: v.terms.estimated_monthly_cents } });
  return { ok: true, proposal_id: proposalId, status: 'confirmed', estimated_monthly_cents: v.terms.estimated_monthly_cents };
}

async function finishWon(env, { p, opp, accountId, snapshot, ctx }) {
  const t = now();
  await env.DB.prepare("UPDATE sales_proposals SET status='converted', converted_account_id=?, converted_terms_json=?, converted_at=?, conversion_error=NULL, updated_at=? WHERE id=?")
    .bind(accountId, toJson(snapshot), t, t, p.id).run();
  await env.DB.prepare("UPDATE sales_opportunities SET stage='won', won_at=?, stage_changed_at=?, converted_contract_account_id=?, estimated_monthly_revenue_cents=COALESCE(?, estimated_monthly_revenue_cents), updated_at=? WHERE id=?")
    .bind(t, t, accountId, p.estimated_monthly_cents ?? null, t, opp.id).run();
  await env.DB.prepare("UPDATE sales_organizations SET status='converted', updated_at=? WHERE id=?").bind(t, opp.organization_id).run();
  await stopSequences(env, { opportunity_id: opp.id, reason: 'won', ctx });
}

/**
 * Convert a CONFIRMED proposal into a real contract account + sites + authorised staff, activate it
 * on exactly the confirmed terms, verify them by reading them back, and mark the opportunity won.
 */
export async function convertToContractAccount(env, { proposal_id, ctx, expect_monthly_cents } = {}) {
  if (!ctx || ctx.role !== 'owner') return { ok: false, error: 'Only the owner can activate a contract account.' };
  const p = await salesRow(env, 'SELECT * FROM sales_proposals WHERE id = ?', proposal_id);
  if (!p) return { ok: false, error: 'Proposal not found.' };
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', p.opportunity_id);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };

  // Idempotency first: a repeated click returns what the first click made.
  if (p.status === 'converted' && p.converted_account_id) return { ok: true, already: true, account_id: p.converted_account_id };
  if (opp.converted_contract_account_id) return { ok: true, already: true, account_id: opp.converted_contract_account_id };
  if (CLOSED_STAGES.includes(opp.stage)) return { ok: false, error: `This opportunity is ${opp.stage}.` };
  const resuming = p.status === 'converting' && p.converted_account_id;
  if (p.status !== 'confirmed' && !resuming) return { ok: false, error: 'Confirm the proposal terms before converting.', code: 'not_confirmed' };

  const v = validateProposal({ ...rowToTerms(p), estimated_monthly_cents: p.estimated_monthly_cents });
  if (!v.ok) return { ok: false, error: 'The confirmed terms no longer validate.', errors: v.errors };
  const terms = v.terms;
  if (Number(expect_monthly_cents) !== terms.estimated_monthly_cents) {
    return { ok: false, error: `The monthly total on your screen does not match the confirmed terms ($${(terms.estimated_monthly_cents / 100).toFixed(2)}). Reload and try again.`, code: 'stale_total' };
  }

  // Never overwrite an existing account. A matching name or billing email means the owner must link, not create.
  if (!resuming) {
    const clash = await salesRow(env,
      'SELECT id, name, status FROM contract_accounts WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) OR (billing_email IS NOT NULL AND LOWER(TRIM(billing_email)) = ?) LIMIT 1',
      terms.account_name, terms.billing_email);
    if (clash) {
      return { ok: false, code: 'account_exists', existing_account_id: clash.id,
        error: `A contract account named "${clash.name}" (or with this billing email) already exists. Nothing was changed. Link the opportunity to it instead of creating a second one.` };
    }
    const claim = await env.DB.prepare("UPDATE sales_proposals SET status='converting', conversion_error=NULL, updated_at=? WHERE id=? AND status='confirmed'").bind(now(), p.id).run();
    if (!claim.meta || claim.meta.changes !== 1) return { ok: false, error: 'This proposal is already being converted.' };
  }

  const fail = async (msg, accountId) => {
    await env.DB.prepare("UPDATE sales_proposals SET status=?, conversion_error=?, updated_at=? WHERE id=?")
      .bind(accountId ? 'converting' : 'confirmed', String(msg).slice(0, 300), now(), p.id).run();
    return { ok: false, error: msg, account_id: accountId || null };
  };

  let accountId = p.converted_account_id || null;
  if (!accountId) {
    const reg = await registerAccount(env, {
      company: terms.account_name, billing_email: terms.billing_email, billing_contact: terms.billing_contact,
      billing_model: terms.billing_model,
      sites: terms.sites.map((st) => ({ ...st, delivery_days: terms.delivery_days, window_label: st.window_label || undefined })),
    });
    if (!reg.ok) return fail(reg.error || 'Could not create the contract account.');
    accountId = reg.account_id;
    // Recorded BEFORE anything else can fail, so a retry resumes this account instead of making a second one.
    await env.DB.prepare('UPDATE sales_proposals SET converted_account_id=?, updated_at=? WHERE id=?').bind(accountId, now(), p.id).run();
    if ((reg.sites || []).length !== terms.sites.length) {
      return fail(`Only ${(reg.sites || []).length} of ${terms.sites.length} locations were created. The account is left PENDING for you to review on the Contracts page.`, accountId);
    }
  }

  const act = await activateAccount(env, accountId, {
    price_per_lunch_cents: terms.price_per_meal_cents, delivery_fee_cents: terms.delivery_fee_cents,
    rush_fee_cents: terms.rush_fee_cents, cutoff_time: terms.cutoff_time,
  });
  if (!act.ok) return fail(act.error || 'Could not activate the account.', accountId);
  // activateAccount reads a rush fee of 0 as "use the default". Confirmed terms win, on THIS account only.
  await env.DB.prepare('UPDATE contract_sites SET rush_fee_cents=?, delivery_window=?, updated_at=? WHERE account_id=?')
    .bind(terms.rush_fee_cents, terms.meal_window, now(), accountId).run();

  // Read the terms back. The account is live only if what is stored is what he confirmed.
  const sites = await salesRows(env, 'SELECT id, name, price_per_lunch_cents, delivery_fee_cents, rush_fee_cents, cutoff_time, intake_token FROM contract_sites WHERE account_id = ? ORDER BY created_at, rowid', accountId);
  const acct = await salesRow(env, 'SELECT id, status FROM contract_accounts WHERE id = ?', accountId);
  const bad = sites.filter((st) => st.price_per_lunch_cents !== terms.price_per_meal_cents || st.delivery_fee_cents !== terms.delivery_fee_cents
    || st.rush_fee_cents !== terms.rush_fee_cents || st.cutoff_time !== terms.cutoff_time);
  if (!acct || acct.status !== 'active' || bad.length || sites.length !== terms.sites.length) {
    return fail('The stored contract terms do not match the confirmed proposal. Review the account on the Contracts page before using it.', accountId);
  }

  try {
    await env.DB.prepare(
      'INSERT INTO contract_terms_events (id, account_id, site_id, event, changed_by, changed_role, before_json, after_json, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(id('cte'), accountId, null, 'activated', ctx.email || ctx.distinct_id, ctx.role, '{}',
      toJson({ price_per_lunch_cents: terms.price_per_meal_cents, delivery_fee_cents: terms.delivery_fee_cents, rush_fee_cents: terms.rush_fee_cents, cutoff_time: terms.cutoff_time }),
      `Sales OS conversion (proposal ${p.id})`, now()).run();
  } catch { /* the terms history is a record, not a gate */ }

  const staff = [];
  for (const c of terms.contacts) {
    const site = sites[c.site_index];
    if (!site || !c.phone) { staff.push({ name: c.name, ok: false, error: 'no phone' }); continue; }
    // Added to the roster only. No invite text is sent: telling a client's employee they were
    // added is a separate act the owner takes from the Contracts page.
    const r = await addSiteStaff(env, { site_id: site.id, account_id: accountId, name: c.name, phone: c.phone, added_by: 'sales_os', active: true });
    staff.push({ name: c.name, ok: !!r.ok, error: r.ok ? null : r.error });
  }

  const snapshot = {
    account_id: accountId, proposal_id: p.id, opportunity_id: opp.id, converted_by: ctx.distinct_id, converted_at: now(),
    terms: { ...terms, contacts: undefined }, site_ids: sites.map((st) => st.id),
  };
  await finishWon(env, { p, opp, accountId, snapshot, ctx });
  await logActivity(env, {
    organization_id: opp.organization_id, opportunity_id: opp.id, kind: 'conversion', ctx,
    detail: { account_id: accountId, sites: sites.length, staff_added: staff.filter((x) => x.ok).length, estimated_monthly_cents: terms.estimated_monthly_cents },
    event: 'sales.opportunity_won', props: { account_id: accountId, sites: sites.length, estimated_monthly_cents: terms.estimated_monthly_cents },
  });
  await capture(env, { event: 'sales.contract_account_created', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { account_id: accountId, opportunity_id: opp.id, sites: sites.length } });
  await capture(env, { event: 'contract.account_created', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { account_id: accountId, sites: sites.length, source: 'sales_os' } });
  return {
    ok: true, account_id: accountId, sites: sites.map((st) => ({ id: st.id, name: st.name, link_path: '/lunch-count?t=' + st.intake_token })),
    staff, next: 'The account is active on the confirmed terms. Open Contracts to share each location’s headcount link.',
  };
}

/** Resolve a name/billing clash: mark the opportunity won against an EXISTING account without touching it. */
export async function linkExistingAccount(env, { opportunity_id, account_id, ctx } = {}) {
  if (!ctx || ctx.role !== 'owner') return { ok: false, error: 'Only the owner can link a contract account.' };
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', opportunity_id);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  if (opp.converted_contract_account_id) return { ok: true, already: true, account_id: opp.converted_contract_account_id };
  if (CLOSED_STAGES.includes(opp.stage)) return { ok: false, error: `This opportunity is ${opp.stage}.` };
  const acct = await salesRow(env, 'SELECT id FROM contract_accounts WHERE id = ?', account_id);
  if (!acct) return { ok: false, error: 'Contract account not found.' };
  const t = now();
  await env.DB.prepare("UPDATE sales_opportunities SET stage='won', won_at=?, stage_changed_at=?, converted_contract_account_id=?, updated_at=? WHERE id=?")
    .bind(t, t, account_id, t, opp.id).run();
  await env.DB.prepare("UPDATE sales_organizations SET status='converted', updated_at=? WHERE id=?").bind(t, opp.organization_id).run();
  await env.DB.prepare("UPDATE sales_proposals SET status='void', conversion_error='linked to an existing account instead', updated_at=? WHERE opportunity_id=? AND status IN ('draft','confirmed','converting')").bind(t, opp.id).run();
  await stopSequences(env, { opportunity_id: opp.id, reason: 'won', ctx });
  await logActivity(env, {
    organization_id: opp.organization_id, opportunity_id: opp.id, kind: 'conversion', ctx, detail: { account_id, linked_existing: true },
    event: 'sales.opportunity_won', props: { account_id, linked_existing: true },
  });
  return { ok: true, account_id, linked: true };
}
