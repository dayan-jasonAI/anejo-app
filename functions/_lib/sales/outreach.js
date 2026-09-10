// Sales OS — outreach: compose, check, preview, approve, send, follow up, stop.
// Files under functions/_lib are NOT routed.
//
// THE LAW (Dayan, 2026-09-10): "no email should go out without a human preview, this is law."
// In this file that is three mechanical guarantees, not a convention:
//   1. A draft becomes sendable ONLY through approveOutreach(), and approval requires the
//      render_hash of the exact email the owner's screen rendered. If the subject, body, footer,
//      recipient or sender changed since that preview, the hashes differ and approval is refused.
//   2. The body that is sent is body_snapshot — the approved text — rendered by the same pure
//      function the preview used. Nothing re-generates copy between approval and delivery.
//   3. There is no auto-send path. sales.auto_send_enabled is locked false in config.js, and the
//      send loop only ever selects status='approved' rows that carry approved_by + approved_at.
//
// Deliverability and compliance, on every send, IMMEDIATELY before delivery: the opt-out lists,
// the suppression list, the contact's own flags, the organization's do-not-contact, the daily cap,
// the business-hours window, the one-touch-per-contact-per-day rule, and a real postal address.
import { id, now, toJson, parseJson, etDateOf, etDayBounds } from '../hub.js';
import { randToken, isEmail } from '../util.js';
import { sendEmail, escHtml } from '../email.js';
import { configHash } from './config.js';
import { SENDABLE_EMAIL_STATUSES } from './scoring.js';
import { logActivity, isEmailBlocked, stopSequences, advanceStage, recordSalesUnsubscribe, salesRow, salesRows, CLOSED_STAGES } from './store.js';

export const DEFAULT_SEQUENCE_ID = 'sseq_default_v1';
export const TEMPLATE_TYPES = ['intro', 'value_proof', 'menu_pricing', 'close_loop'];
export const OUTREACH_STATUSES = ['pending_approval', 'approved', 'sending', 'sent', 'failed', 'rejected', 'canceled', 'skipped'];

// Inbound reply detection is NOT wired in this build: the stack has no inbound mail ingestion for
// the sending domain. Replies go to the owner's own mailbox (Reply-To), and he marks them in the
// Hub. Saying so on screen beats a sequence that keeps emailing someone who already answered.
export const REPLY_DETECTION = {
  configured: false,
  note: 'Automatic reply detection is not configured. Replies land in the Reply-To mailbox; mark them with "Reply received" to stop the sequence.',
};

const TIME_BUDGET_MS = 20000;

// ---------------------------------------------------------------- composition (pure)

const PROGRAM_PHRASES = [
  [/partial hospitali[sz]ation/i, 'partial hospitalization program'],
  [/intensive outpatient/i, 'intensive outpatient program'],
  [/adult day (?:care|center|centre|services|program)/i, 'adult day program'],
  [/day treatment/i, 'day treatment program'],
  [/day program/i, 'day program'],
  [/residential (?:treatment|program|care)/i, 'residential program'],
];

/** The single verified fact the intro leans on, with its evidence. Null if there is none. */
export function pickFact(signals = []) {
  const bykind = (k) => signals.find((s) => s.kind === k);
  for (const k of ['day_program', 'residential']) {
    const sig = bykind(k);
    if (!sig) continue;
    const hit = PROGRAM_PHRASES.find(([re]) => re.test(sig.snippet || ''));
    if (hit) return { text: `your ${hit[1]}`, kind: k, url: sig.url, snippet: sig.snippet };
  }
  const meals = bykind('meals_provided');
  if (meals) return { text: 'that meals are part of your clients’ day', kind: 'meals_provided', url: meals.url, snippet: meals.snippet };
  const wk = bykind('weekday_schedule');
  if (wk) return { text: 'that your program runs on a weekday schedule', kind: 'weekday_schedule', url: wk.url, snippet: wk.snippet };
  return null;
}

function greetingName(contact) {
  if (!contact || !contact.first_name) return null;
  // An inferred name (low confidence) is not used to address someone — getting it wrong is worse
  // than "Hello".
  return ['verified', 'high', 'medium'].includes(contact.confidence) ? contact.first_name : null;
}

export function proofLine(proof) {
  if (!proof) return null;
  if (proof.mode === 'named' && proof.named_permission_recorded && proof.named_text) return proof.named_text.trim();
  if (proof.mode === 'anonymous' && proof.anonymous_text) return proof.anonymous_text.trim();
  return null;
}

function signature(sender) {
  return [
    sender.signature_name || sender.from_name,
    sender.signature_title || null,
    'Añejo Catering Co.',
    sender.signature_phone || null,
  ].filter(Boolean).join('\n');
}

/**
 * Compose one step's email from VERIFIED inputs only. Deterministic: same inputs, same email.
 * Returns { subject, body, claims }. `claims` lists every business fact the copy relies on and
 * where it came from, so the approval card can show them.
 */
export function composeEmail({ templateType, org, contact, signals, cfg, landingUrl }) {
  const offer = cfg.offer || {};
  const sender = cfg.sender || {};
  const name = greetingName(contact);
  const hi = name ? `Hi ${name},` : 'Hello,';
  const fact = pickFact(signals);
  const proof = proofLine(cfg.proof);
  const useTasting = !!offer.tasting_enabled && org.current_tier === 'A';
  const cta = useTasting ? offer.tasting_cta : offer.cta_text;
  const who = sender.signature_name || sender.from_name || 'the owner';
  const claims = [];
  if (fact) claims.push({ about: 'prospect', text: fact.text, source: fact.url, evidence: fact.snippet });
  claims.push({ about: 'anejo', text: offer.value_prop, source: 'Sales settings → Offer (value proposition)' });
  if (proof) claims.push({ about: 'anejo', text: proof, source: `Sales settings → Proof (${cfg.proof.mode})` });
  if (useTasting) claims.push({ about: 'anejo', text: 'Tasting offered', source: 'Sales settings → Offer (tasting enabled)' });

  const link = landingUrl ? `More about how it works: ${landingUrl}` : null;
  let subject; let paras;
  switch (templateType) {
    case 'value_proof':
      subject = `Following up — meals for ${org.name}`;
      paras = [hi,
        'Following up on my note from last week.',
        proof || 'Each site gets a private link to send the day’s headcount each morning, so the order always matches who is actually there.',
        cta, link];
      break;
    case 'menu_pricing':
      subject = `A sample weekly menu for ${org.name}?`;
      paras = [hi,
        'If you tell me roughly how many people you serve each day, I will send a sample weekly menu and pricing for that headcount.',
        offer.tasting_enabled ? offer.tasting_cta : null,
        link];
      claims.push({ about: 'anejo', text: 'Sample menu and pricing on request', source: 'Sales settings → Offer (pricing on request)' });
      break;
    case 'close_loop':
      subject = `Should I close the loop${name ? ', ' + name : ''}?`;
      paras = [hi,
        'I have not heard back, so I will assume the timing is not right and will not follow up again.',
        `If scheduled meals for ${org.name} come up later, just reply to this email${landingUrl ? ` or visit ${landingUrl}` : ''}.`];
      break;
    case 'intro':
    default:
      subject = `Scheduled meals for ${org.name}`;
      // With no verified fact, the opener claims NOTHING — not about them, and not about who else we
      // serve. "We work with programs in <city>" was the first fallback, and it asserts customers
      // Añejo may not have (caught in the first UI walkthrough, 2026-09-10).
      paras = [hi,
        fact ? `I came across ${org.name} and saw ${fact.text}.` : `I am writing to a few programs in ${org.city || 'South Florida'} about scheduled meal service.`,
        `I am ${who} with Añejo Catering Co. in Palm Beach County. ${offer.value_prop}`,
        proof, cta, link];
      if (!fact) claims.push({ about: 'prospect', text: 'No verified fact about this organization — the opener makes no claim about them. Research their site to personalise it.', source: 'none' });
      break;
  }
  const body = [...paras.filter(Boolean), signature(sender)].join('\n\n');
  return { subject, body, claims };
}

// ---------------------------------------------------------------- governance (pure)

const HEALTH_CLAIMS = /\b(cure[sd]?|heal(?:s|ing)?|therapeutic|clinically|medically|nutritionist[- ]approved|dietitian[- ]approved|prevents?|reduces? (?:the )?risk|improves? (?:recovery|outcomes|health|mood)|boosts? (?:immunity|recovery|energy)|diabetic[- ](?:friendly|safe)|heart[- ]healthy|anti-?inflammatory|weight loss|guarantee[ds]?)\b/i;
const DIETARY_CLAIMS = /\b(allergen[- ]free|nut[- ]free|peanut[- ]free|gluten[- ]free|dairy[- ]free|kosher|halal)\b/i;
const FREE_WORDS = /\b(free|complimentary|no[- ]cost|on the house|at no charge)\b/i;
const DISCOUNT_WORDS = /\b(\d+\s?%\s*off|discount|promo(?:tion)?|special offer|limited[- ]time|sale price)\b/i;
const COUNT_CLAIMS = /\b\d+\+?\s+(?:clients|customers|facilities|clinics|organizations|accounts|meals (?:a|per) (?:day|week))\b/i;
const TESTIMONIAL = /\b(trusted by|our clients (?:say|love)|testimonial|rated #?1|best in)\b/i;
const TIME_RE = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/gi;

/**
 * Deterministic claim checks on the exact subject + body that would be sent. Owner edits run
 * through this too: a typed "$9 per meal" is flagged unless it is the owner's configured price.
 * Returns [{ type, detail }]. Approval with flags requires an explicit, recorded acknowledgement.
 */
export function checkDraft({ subject, body }, cfg) {
  const text = `${subject || ''}\n${body || ''}`;
  const offer = cfg.offer || {};
  const proof = cfg.proof || {};
  const proofText = `${proof.anonymous_text || ''} ${proof.named_text || ''}`.toLowerCase();
  const flags = [];
  for (const m of text.matchAll(/\$\s?(\d{1,5}(?:\.\d{2})?)/g)) {
    const cents = Math.round(parseFloat(m[1]) * 100);
    const allowed = offer.pricing_display_policy === 'show_from' && Number(offer.price_from_cents) === cents;
    if (!allowed) flags.push({ type: 'price', detail: `$${m[1]} is not a price you configured to show. Prices go out only as you set them.` });
  }
  if (FREE_WORDS.test(text) && !offer.tasting_enabled) flags.push({ type: 'offer', detail: 'Offers something free, but the tasting offer is off in Sales settings.' });
  if (DISCOUNT_WORDS.test(text)) flags.push({ type: 'offer', detail: 'Mentions a discount or promotion — none is configured.' });
  if (HEALTH_CLAIMS.test(text)) flags.push({ type: 'health', detail: `Health or outcome claim ("${text.match(HEALTH_CLAIMS)[0]}"). Añejo does not make medical or nutrition-treatment claims.` });
  if (DIETARY_CLAIMS.test(text)) flags.push({ type: 'dietary', detail: `Dietary guarantee ("${text.match(DIETARY_CLAIMS)[0]}") — not something the offer promises.` });
  const count = text.match(COUNT_CLAIMS);
  if (count && !proofText.includes(count[0].toLowerCase())) flags.push({ type: 'proof', detail: `Customer-count claim ("${count[0]}") that is not in your proof settings.` });
  if (TESTIMONIAL.test(text)) flags.push({ type: 'proof', detail: 'Testimonial-style claim — only use proof you have recorded.' });
  if (/\bDGP\b/i.test(text) && !(proof.mode === 'named' && proof.named_permission_recorded)) flags.push({ type: 'proof', detail: 'Names DGP without named-proof permission recorded.' });
  const allowedTimes = `${offer.headcount_cutoff_text || ''} ${offer.delivery_days_text || ''}`.toLowerCase();
  for (const m of text.matchAll(TIME_RE)) {
    if (!allowedTimes.includes(m[0].toLowerCase().replace(/\./g, ''))) flags.push({ type: 'claim', detail: `States a time ("${m[0]}") that is not in your offer settings.` });
  }
  if (/^\s*(re|fwd?)\s*:/i.test(subject || '')) flags.push({ type: 'subject', detail: 'A subject starting "Re:"/"Fwd:" implies a prior conversation — misleading for a first-touch email.' });
  if (!/\S/.test(body || '')) flags.push({ type: 'empty', detail: 'The body is empty.' });
  return flags;
}

// ---------------------------------------------------------------- rendering (pure)

function paragraphsHtml(text) {
  return String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
    .map((b) => `<p style="margin:0 0 14px">${escHtml(b).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#8B6B3E">$1</a>')}</p>`)
    .join('');
}

export function complianceFooterText({ orgName, areaLabel, unsubUrl, postal }) {
  return [
    `This is a one-time business solicitation from Añejo Catering Co. to ${orgName}, sent because your organization is listed publicly as a program in ${areaLabel || 'South Florida'}.`,
    `If you would rather not hear from us, unsubscribe here and we will not email you again: ${unsubUrl}`,
    postal,
  ].join('\n');
}

/**
 * THE renderer — used for the approval preview AND for the send. Pure: same inputs, same bytes,
 * same hash. The footer (identification, opt-out, postal address) is not part of the editable body,
 * so no edit can remove it.
 */
export function renderOutreachEmail({ subject, body, unsubUrl, postal, orgName, areaLabel, from, replyTo, to }) {
  const footer = complianceFooterText({ orgName, areaLabel, unsubUrl, postal });
  const text = `${String(body || '').trim()}\n\n--\n${footer}`;
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">`
    + paragraphsHtml(body)
    + `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e6e1d4;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6b6b6b">`
    + `${escHtml(footer.split('\n')[0])}<br><a href="${escHtml(unsubUrl)}" style="color:#8B6B3E">Unsubscribe</a> — we will not email you again.<br>${escHtml(postal)}</div></div>`;
  const hash = configHash({ subject: String(subject || ''), text, html, from: from || '', replyTo: replyTo || '', to: to || '' });
  return { subject: String(subject || ''), text, html, hash };
}

// ---------------------------------------------------------------- gates

function baseUrl(env, base) {
  return String(base || env.APP_BASE_URL || 'https://anejocateringco.com').replace(/\/$/, '');
}
export const landingUrlFor = (env, token, base) => (token ? `${baseUrl(env, base)}/for/${token}` : null);
export const unsubUrlFor = (env, token, base) => `${baseUrl(env, base)}/api/sales/unsubscribe?t=${token}`;

export function fromHeader(sender) {
  if (!sender || !isEmail(sender.from_email || '')) return null;
  const nm = String(sender.from_name || '').replace(/[<>"\r\n]/g, '').trim();
  return nm ? `${nm} <${sender.from_email.trim()}>` : sender.from_email.trim();
}

/** Inside the owner's business-hours window, in ET? */
export function inSendWindow(win, atMs = Date.now()) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(atMs))) parts[p.type] = p.value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  const hour = Number(parts.hour);
  const days = Array.isArray(win && win.days) ? win.days.map(Number) : [1, 2, 3, 4, 5];
  return days.includes(dow) && hour >= Number((win && win.start_hour) ?? 9) && hour < Number((win && win.end_hour) ?? 16);
}

/**
 * Everything that must be true before ANY prospect email can leave. Returns { ok, reasons[] } —
 * each reason is a sentence the Hub shows as-is, so "why isn't it sending?" always has an answer.
 */
export function sendReadiness(env, cfg, { atMs = Date.now(), ignoreWindow = false } = {}) {
  const reasons = [];
  if (!cfg.flags['sales.enabled']) reasons.push('Sales is switched off.');
  if (!cfg.flags['sales.email_enabled']) reasons.push('Prospect email is switched off (Sales → Settings).');
  if (!env.RESEND_API_KEY) reasons.push('Email is not configured (RESEND_API_KEY).');
  if (!fromHeader(cfg.sender)) reasons.push('Set the sender name and a from-address on the verified sending domain.');
  if (!isEmail((cfg.sender && cfg.sender.reply_to) || '')) reasons.push('Set a Reply-To mailbox a person reads — replies are the whole point.');
  if (!cfg.postal_is_real) reasons.push('Set the real postal address (Marketing → Broadcast) — cold email requires one.');
  if (!cfg.offer || !cfg.offer.confirmed) reasons.push('Review and save the institutional offer (Sales → Settings) before anything is sent.');
  if (!ignoreWindow && !inSendWindow(cfg.send_window, atMs)) reasons.push('Outside the business-hours send window.');
  return { ok: reasons.length === 0, reasons };
}

async function sentTodayCount(env, atMs) {
  const { start, end } = etDayBounds(etDateOf(atMs));
  const r = await salesRow(env, "SELECT COUNT(*) AS n FROM sales_outreach WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?", start, end);
  return r ? Number(r.n) || 0 : 0;
}

// ---------------------------------------------------------------- enrollment + drafting

async function stepOf(env, sequenceId, stepNumber) {
  return salesRow(env, 'SELECT * FROM sales_sequence_steps WHERE sequence_id = ? AND step_number = ?', sequenceId, stepNumber);
}

async function contactEligible(env, contact, org) {
  if (!contact) return { ok: false, why: 'No contact selected.' };
  if (!contact.email) return { ok: false, why: 'This contact has no email address.' };
  if (!SENDABLE_EMAIL_STATUSES.includes(contact.email_status)) return { ok: false, why: `Email status is "${contact.email_status}" — only published or owner-confirmed addresses can be emailed.` };
  if (contact.suppressed || !contact.marketing_email_allowed) return { ok: false, why: 'This contact is suppressed or not allowed for email.' };
  if (org && (org.do_not_contact || org.status === 'suppressed')) return { ok: false, why: 'The organization is marked do-not-contact.' };
  const b = await isEmailBlocked(env, contact.email);
  if (b.blocked) return { ok: false, why: `Blocked: ${b.why}.` };
  return { ok: true };
}

async function insertDraft(env, { opp, org, contact, enrollment, step, cfg, ctx, base }) {
  const signals = await salesRows(env, "SELECT captured_json, source_url FROM sales_prospect_sources WHERE organization_id = ? AND source_type = 'website_page' ORDER BY captured_at DESC LIMIT 20", org.id);
  const sigs = [];
  for (const r of signals) for (const sg of (parseJson(r.captured_json, {}) || {}).signals || []) sigs.push({ ...sg, url: sg.url || r.source_url });
  const landing = landingUrlFor(env, opp.landing_token, base);
  const draft = composeEmail({ templateType: step.template_type, org, contact, signals: sigs, cfg, landingUrl: landing });
  const flags = checkDraft(draft, cfg);
  const oid = id('sout');
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO sales_outreach (id, opportunity_id, organization_id, contact_id, sequence_id, step_id, enrollment_id, step_number, channel,
         recipient_email, subject, body_snapshot, cta_url, status, ai_assisted, edited, claims_json, flags_json, unsub_token, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,'email',?,?,?,?,'pending_approval',0,0,?,?,?,?,?,?)`
    ).bind(oid, opp.id, org.id, contact.id, enrollment.sequence_id, step.id, enrollment.id, step.step_number,
      contact.email, draft.subject, draft.body, landing, toJson(draft.claims), toJson(flags), randToken(16),
      (ctx && ctx.distinct_id) || 'system', t, t).run();
  } catch {
    const existing = await salesRow(env, 'SELECT id FROM sales_outreach WHERE enrollment_id = ? AND step_number = ?', enrollment.id, step.step_number);
    return existing ? { ok: true, outreach_id: existing.id, created: false } : { ok: false, error: 'Could not save the draft.' };
  }
  await env.DB.prepare('UPDATE sales_enrollments SET last_step_number = MAX(last_step_number, ?), next_step_at = NULL, updated_at = ? WHERE id = ?')
    .bind(step.step_number, t, enrollment.id).run();
  await logActivity(env, {
    organization_id: org.id, opportunity_id: opp.id, contact_id: contact.id, outreach_id: oid, kind: 'draft', ctx,
    detail: { step: step.step_number, template: step.template_type, flags: flags.length },
    event: 'sales.outreach_drafted', props: { step: step.step_number, template: step.template_type, flags: flags.length },
  });
  return { ok: true, outreach_id: oid, created: true, flags };
}

/**
 * Enroll a contact in a sequence and draft step 1 for approval. Idempotent: a second call returns
 * the existing draft. Nothing is sent here, ever.
 */
export async function startSequence(env, { opportunity_id, contact_id, sequence_id = DEFAULT_SEQUENCE_ID, cfg, ctx, base } = {}) {
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', opportunity_id);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  if (CLOSED_STAGES.includes(opp.stage)) return { ok: false, error: `This opportunity is ${opp.stage}.` };
  const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', opp.organization_id);
  const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE id = ? AND organization_id = ?', contact_id || opp.primary_contact_id || '', opp.organization_id);
  const elig = await contactEligible(env, contact, org);
  if (!elig.ok) return { ok: false, error: elig.why };
  const seq = await salesRow(env, "SELECT * FROM sales_sequences WHERE id = ? AND status = 'active'", sequence_id);
  if (!seq) return { ok: false, error: 'That sequence does not exist or is paused.' };
  const step = await stepOf(env, seq.id, 1);
  if (!step) return { ok: false, error: 'The sequence has no first step.' };

  let enr = await salesRow(env, 'SELECT * FROM sales_enrollments WHERE opportunity_id = ? AND sequence_id = ?', opp.id, seq.id);
  if (enr && enr.status === 'stopped') return { ok: false, error: `This sequence was stopped (${enr.stop_reason}). It will not restart on its own.` };
  if (!enr) {
    const t = now();
    try {
      await env.DB.prepare(
        "INSERT INTO sales_enrollments (id, opportunity_id, contact_id, sequence_id, status, last_step_number, created_at, updated_at) VALUES (?,?,?,?,'active',0,?,?)"
      ).bind(id('senr'), opp.id, contact.id, seq.id, t, t).run();
    } catch { /* concurrent enroll — read it back */ }
    enr = await salesRow(env, 'SELECT * FROM sales_enrollments WHERE opportunity_id = ? AND sequence_id = ?', opp.id, seq.id);
  }
  const existing = await salesRow(env, 'SELECT id FROM sales_outreach WHERE enrollment_id = ? AND step_number = 1', enr.id);
  if (existing) return { ok: true, outreach_id: existing.id, created: false, enrollment_id: enr.id };
  const d = await insertDraft(env, { opp, org, contact, enrollment: enr, step, cfg, ctx, base });
  if (d.ok) await advanceStage(env, opp.id, 'outreach_ready', ctx);
  return { ...d, enrollment_id: enr.id };
}

/** Draft the next step for every enrollment whose delay has elapsed. Drafts only — never sends. */
export async function draftDueFollowups(env, { cfg, atMs = Date.now(), limit = 20, base } = {}) {
  const out = { drafted: 0, completed: 0, stopped: 0, skipped: [] };
  if (!cfg.flags['sales.enabled'] || !cfg.flags['sales.followup_enabled']) { out.skipped.push('follow-up is switched off'); return out; }
  const due = await salesRows(env, "SELECT * FROM sales_enrollments WHERE status = 'active' AND next_step_at IS NOT NULL AND next_step_at <= ? ORDER BY next_step_at LIMIT ?", atMs, limit);
  for (const enr of due) {
    const prev = await salesRow(env, 'SELECT status, replied_at FROM sales_outreach WHERE enrollment_id = ? AND step_number = ?', enr.id, enr.last_step_number);
    if (!prev || prev.status !== 'sent') { out.skipped.push(`${enr.id}: previous step not sent`); continue; }
    const replied = await salesRow(env, 'SELECT id FROM sales_outreach WHERE opportunity_id = ? AND replied_at IS NOT NULL LIMIT 1', enr.opportunity_id);
    if (replied) { await stopSequences(env, { opportunity_id: enr.opportunity_id, reason: 'reply' }); out.stopped++; continue; }
    const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', enr.opportunity_id);
    if (!opp || CLOSED_STAGES.includes(opp.stage) || opp.stage === 'nurture') { await stopSequences(env, { opportunity_id: enr.opportunity_id, reason: opp ? opp.stage : 'manual' }); out.stopped++; continue; }
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', opp.organization_id);
    const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE id = ?', enr.contact_id);
    const elig = await contactEligible(env, contact, org);
    if (!elig.ok) { await stopSequences(env, { opportunity_id: opp.id, reason: 'do_not_contact' }); out.stopped++; continue; }
    const step = await stepOf(env, enr.sequence_id, enr.last_step_number + 1);
    if (!step) {
      await env.DB.prepare("UPDATE sales_enrollments SET status='completed', next_step_at=NULL, updated_at=? WHERE id=? AND status='active'").bind(now(), enr.id).run();
      out.completed++;
      continue;
    }
    const d = await insertDraft(env, { opp, org, contact, enrollment: enr, step, cfg, ctx: null, base });
    if (d.ok && d.created) out.drafted++;
  }
  return out;
}

// ---------------------------------------------------------------- preview + approval

const normSubject = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
const normBody = (s) => String(s == null ? '' : s).replace(/\r\n/g, '\n').trim().slice(0, 6000);

async function renderContext(env, row, cfg, base) {
  const org = await salesRow(env, 'SELECT name FROM sales_organizations WHERE id = ?', row.organization_id);
  return {
    unsubUrl: unsubUrlFor(env, row.unsub_token, base),
    postal: cfg.postal_address,
    orgName: (org && org.name) || 'your organization',
    areaLabel: (cfg.service_area && cfg.service_area.label) || 'South Florida',
    from: fromHeader(cfg.sender) || '',
    replyTo: (cfg.sender && cfg.sender.reply_to) || '',
    to: row.recipient_email || '',
  };
}

/** The exact email as it would be sent — for the approval card. Edits can be previewed unsaved. */
export async function previewOutreach(env, outreachId, { cfg, subject, body, base } = {}) {
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE id = ?', outreachId);
  if (!row) return { ok: false, error: 'Draft not found.' };
  const rc = await renderContext(env, row, cfg, base);
  // Normalised EXACTLY as approveOutreach normalises, or a textarea's trailing newline would make
  // the preview hash and the approval hash disagree about the same email.
  const subj = normSubject(subject != null ? subject : row.subject);
  const bod = normBody(body != null ? body : row.body_snapshot);
  const r = renderOutreachEmail({ subject: subj, body: bod, ...rc });
  const blocked = row.recipient_email ? await isEmailBlocked(env, row.recipient_email) : { blocked: true, why: 'no address' };
  return {
    ok: true,
    outreach_id: row.id,
    status: row.status,
    to: row.recipient_email,
    from: rc.from || '(sender not set)',
    reply_to: rc.replyTo || '(reply-to not set)',
    subject: r.subject,
    text: r.text,
    html: r.html,
    render_hash: r.hash,
    flags: checkDraft({ subject: subj, body: bod }, cfg),
    claims: parseJson(row.claims_json, []),
    suppression: blocked,
  };
}

/**
 * Approve — the only door from draft to sendable. Requires the render_hash of the preview the
 * owner saw; refuses on stale previews, suppressed recipients, and unacknowledged flags.
 */
export async function approveOutreach(env, outreachId, { cfg, subject, body, render_hash, acknowledge_flags, ctx, base } = {}) {
  if (!ctx || !ctx.distinct_id) return { ok: false, error: 'Approval needs a signed-in owner.' };
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE id = ?', outreachId);
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (row.status !== 'pending_approval') return { ok: false, error: `This email is ${row.status}; only a pending draft can be approved.` };
  const subj = normSubject(subject != null ? subject : row.subject);
  const bod = normBody(body != null ? body : row.body_snapshot);
  if (!subj) return { ok: false, error: 'The email needs a subject.' };
  if (!bod) return { ok: false, error: 'The email needs a body.' };

  const rc = await renderContext(env, row, cfg, base);
  const rendered = renderOutreachEmail({ subject: subj, body: bod, ...rc });
  if (!render_hash || render_hash !== rendered.hash) {
    return { ok: false, error: 'This is not the email you previewed — something changed (text, sender, or footer). Preview it again, then approve.', code: 'stale_preview' };
  }
  const flags = checkDraft({ subject: subj, body: bod }, cfg);
  if (flags.length && !acknowledge_flags) return { ok: false, error: 'This email has flagged claims. Fix them, or approve with the flags acknowledged.', flags, code: 'flags' };

  const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE id = ?', row.contact_id);
  const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', row.organization_id);
  const elig = await contactEligible(env, contact, org);
  if (!elig.ok) return { ok: false, error: `Cannot approve: ${elig.why}`, code: 'suppressed' };
  if (contact.email !== row.recipient_email) return { ok: false, error: 'The contact’s email changed since this was drafted. Re-draft it.', code: 'recipient_changed' };

  const edited = subj !== row.subject || bod !== row.body_snapshot ? 1 : 0;
  const t = now();
  const claim = await env.DB.prepare(
    `UPDATE sales_outreach SET status='approved', subject=?, body_snapshot=?, edited=?, flags_json=?, flags_acknowledged=?,
       approved_by=?, approved_at=?, queued_at=?, snoozed_until=NULL, updated_at=? WHERE id=? AND status='pending_approval'`
  ).bind(subj, bod, edited, toJson(flags), flags.length ? 1 : 0, ctx.distinct_id, t, t, t, outreachId).run();
  if (!claim.meta || claim.meta.changes !== 1) return { ok: false, error: 'Someone else already acted on this draft.' };
  await logActivity(env, {
    organization_id: row.organization_id, opportunity_id: row.opportunity_id, contact_id: row.contact_id, outreach_id: row.id,
    kind: 'approval', ctx, detail: { step: row.step_number, edited: !!edited, flags: flags.map((f) => f.type), acknowledged: flags.length > 0 },
    event: 'sales.outreach_approved', props: { step: row.step_number, edited: !!edited, flags: flags.length },
  });
  return { ok: true, outreach_id: row.id, status: 'approved', edited: !!edited, send_readiness: sendReadiness(env, cfg) };
}

/** Save an edit without approving. */
export async function editOutreach(env, outreachId, { subject, body, cfg, ctx } = {}) {
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE id = ?', outreachId);
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (row.status !== 'pending_approval') return { ok: false, error: 'Only a pending draft can be edited.' };
  const subj = normSubject(subject != null ? subject : row.subject);
  const bod = normBody(body != null ? body : row.body_snapshot);
  const flags = checkDraft({ subject: subj, body: bod }, cfg);
  await env.DB.prepare("UPDATE sales_outreach SET subject=?, body_snapshot=?, edited=1, flags_json=?, updated_at=? WHERE id=? AND status='pending_approval'")
    .bind(subj, bod, toJson(flags), now(), outreachId).run();
  await logActivity(env, { organization_id: row.organization_id, opportunity_id: row.opportunity_id, outreach_id: row.id, kind: 'draft_edited', ctx });
  return { ok: true, outreach_id: row.id, flags };
}

export async function rejectOutreach(env, outreachId, { reason, ctx } = {}) {
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE id = ?', outreachId);
  if (!row) return { ok: false, error: 'Draft not found.' };
  if (!['pending_approval', 'approved'].includes(row.status)) return { ok: false, error: `This email is ${row.status}.` };
  const why = String(reason || '').trim().slice(0, 300);
  if (!why) return { ok: false, error: 'Say why — a rejection reason is what the next draft learns from.' };
  const t = now();
  await env.DB.prepare("UPDATE sales_outreach SET status='rejected', rejected_reason=?, updated_at=? WHERE id=? AND status IN ('pending_approval','approved')").bind(why, t, outreachId).run();
  // A rejected step must not be followed by a follow-up to someone who was never written to.
  if (row.enrollment_id) {
    await env.DB.prepare("UPDATE sales_enrollments SET status='stopped', stop_reason='rejected', stopped_at=?, next_step_at=NULL, updated_at=? WHERE id=? AND status='active'").bind(t, t, row.enrollment_id).run();
  }
  await logActivity(env, { organization_id: row.organization_id, opportunity_id: row.opportunity_id, outreach_id: row.id, kind: 'rejection', ctx, detail: { reason: why, step: row.step_number } });
  return { ok: true, outreach_id: row.id, status: 'rejected' };
}

export async function snoozeOutreach(env, outreachId, { until, ctx } = {}) {
  const u = Number(until);
  if (!Number.isFinite(u) || u < Date.now() - 60000) return { ok: false, error: 'Pick a time in the future.' };
  const r = await env.DB.prepare("UPDATE sales_outreach SET snoozed_until=?, updated_at=? WHERE id=? AND status='pending_approval'").bind(u, now(), outreachId).run();
  if (!r.meta || r.meta.changes !== 1) return { ok: false, error: 'Only a pending draft can be snoozed.' };
  const row = await salesRow(env, 'SELECT organization_id, opportunity_id FROM sales_outreach WHERE id = ?', outreachId);
  await logActivity(env, { organization_id: row && row.organization_id, opportunity_id: row && row.opportunity_id, outreach_id: outreachId, kind: 'snooze', ctx, detail: { until: u } });
  return { ok: true, outreach_id: outreachId, snoozed_until: u };
}

// ---------------------------------------------------------------- the send loop

/**
 * Send approved emails. At most once per row (claim before send), inside every gate. Returns
 * { ok, sent, skipped, failed, blocked_by[] } — blocked_by explains a zero.
 */
export async function sendApproved(env, { cfg, atMs = Date.now(), limit = 5, base, ignoreWindow = false } = {}) {
  const res = { ok: true, sent: 0, skipped: 0, failed: 0, deferred: 0, blocked_by: [] };
  const ready = sendReadiness(env, cfg, { atMs, ignoreWindow });
  if (!ready.ok) { res.blocked_by = ready.reasons; return res; }
  const remaining = cfg.flags['sales.max_emails_per_day'] - await sentTodayCount(env, atMs);
  if (remaining <= 0) { res.blocked_by = [`Daily cap of ${cfg.flags['sales.max_emails_per_day']} reached.`]; return res; }
  const batch = await salesRows(env,
    "SELECT * FROM sales_outreach WHERE status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND body_snapshot IS NOT NULL ORDER BY approved_at LIMIT ?",
    Math.min(limit, remaining));
  const started = Date.now();
  // One clock for the whole pass: the day the cap and the same-day rule count against is the day
  // sent_at is stamped with, even when a caller runs the pass "as of" another moment.
  const clock = () => atMs + (Date.now() - started);
  const { start: dayStart, end: dayEnd } = etDayBounds(etDateOf(atMs));

  for (const row of batch) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', row.opportunity_id);
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', row.organization_id);
    const contact = await salesRow(env, 'SELECT * FROM sales_contacts WHERE id = ?', row.contact_id);
    const enr = row.enrollment_id ? await salesRow(env, 'SELECT * FROM sales_enrollments WHERE id = ?', row.enrollment_id) : null;

    const cancel = async (why) => {
      await env.DB.prepare("UPDATE sales_outreach SET status='canceled', failure_reason=?, updated_at=? WHERE id=? AND status='approved'").bind(why, now(), row.id).run();
      res.skipped++;
    };
    if (!opp || CLOSED_STAGES.includes(opp.stage) || opp.stage === 'nurture') { await cancel('opportunity closed'); continue; }
    if (enr && enr.status !== 'active') { await cancel(`sequence ${enr.status}${enr.stop_reason ? ': ' + enr.stop_reason : ''}`); continue; }
    const replied = await salesRow(env, 'SELECT id FROM sales_outreach WHERE opportunity_id = ? AND replied_at IS NOT NULL LIMIT 1', row.opportunity_id);
    if (replied) { await stopSequences(env, { opportunity_id: row.opportunity_id, reason: 'reply' }); res.skipped++; continue; }
    const elig = await contactEligible(env, contact, org);
    if (!elig.ok) {
      await env.DB.prepare("UPDATE sales_outreach SET status='skipped', failure_reason=?, updated_at=? WHERE id=? AND status='approved'").bind(elig.why.slice(0, 200), now(), row.id).run();
      res.skipped++;
      continue;
    }
    if (contact.email !== row.recipient_email) { await cancel('recipient changed after approval'); continue; }
    // One touch per contact per ET calendar day, across every sequence.
    const today = await salesRow(env, "SELECT id FROM sales_outreach WHERE contact_id = ? AND status = 'sent' AND sent_at >= ? AND sent_at < ? LIMIT 1", row.contact_id, dayStart, dayEnd);
    if (today) { res.deferred++; continue; }

    const claim = await env.DB.prepare("UPDATE sales_outreach SET status='sending', updated_at=? WHERE id=? AND status='approved'").bind(now(), row.id).run();
    if (!claim.meta || claim.meta.changes !== 1) continue;

    const rc = await renderContext(env, row, cfg, base);
    const msg = renderOutreachEmail({ subject: row.subject, body: row.body_snapshot, ...rc });
    let result = null; let err = null;
    try {
      result = await sendEmail(env, {
        to: row.recipient_email, subject: msg.subject, html: msg.html, text: msg.text,
        unsubscribeUrl: rc.unsubUrl, from: rc.from, replyTo: rc.replyTo,
      });
    } catch (e) { err = String((e && e.message) || e).slice(0, 200); }
    const t = clock();
    if (result && result.skipped) {
      await env.DB.prepare("UPDATE sales_outreach SET status='skipped', failure_reason=?, updated_at=? WHERE id=?").bind(`suppressed: ${result.suppressed || 'unknown'}`, t, row.id).run();
      await stopSequences(env, { contact_id: row.contact_id, reason: 'bounce' });
      res.skipped++;
      continue;
    }
    if (err || !result) {
      await env.DB.prepare("UPDATE sales_outreach SET status='failed', failure_reason=?, updated_at=? WHERE id=?").bind(err || 'no provider response', t, row.id).run();
      res.failed++;
      continue;
    }
    await env.DB.prepare("UPDATE sales_outreach SET status='sent', provider_id=?, sent_at=?, updated_at=? WHERE id=?").bind(String(result.id || '') || null, t, t, row.id).run();
    if (enr) {
      const next = await stepOf(env, enr.sequence_id, (row.step_number || 0) + 1);
      if (next) {
        // Never the same calendar day: a follow-up is due no sooner than the next day even at delay 0.
        const due = Math.max(t + Number(next.delay_hours || 0) * 3600000, dayEnd);
        await env.DB.prepare('UPDATE sales_enrollments SET last_sent_at=?, next_step_at=?, updated_at=? WHERE id=?').bind(t, due, t, enr.id).run();
      } else {
        await env.DB.prepare("UPDATE sales_enrollments SET last_sent_at=?, next_step_at=NULL, status='completed', updated_at=? WHERE id=? AND status='active'").bind(t, t, enr.id).run();
      }
    }
    await advanceStage(env, row.opportunity_id, 'contacted', null);
    await logActivity(env, {
      organization_id: row.organization_id, opportunity_id: row.opportunity_id, contact_id: row.contact_id, outreach_id: row.id,
      kind: 'send', actor: 'system', detail: { step: row.step_number },
      event: 'sales.outreach_sent', props: { step: row.step_number, edited: !!row.edited },
    });
    res.sent++;
  }
  return res;
}

// ---------------------------------------------------------------- replies + provider events

/** Owner marks a reply. Stops the sequence; the conversation is now his. */
export async function markReplied(env, { opportunity_id, sentiment, note, ctx } = {}) {
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', opportunity_id);
  if (!opp) return { ok: false, error: 'Opportunity not found.' };
  const t = now();
  const last = await salesRow(env, "SELECT id FROM sales_outreach WHERE opportunity_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1", opp.id);
  if (last) await env.DB.prepare('UPDATE sales_outreach SET replied_at = COALESCE(replied_at, ?), updated_at = ? WHERE id = ?').bind(t, t, last.id).run();
  const sent = ['positive', 'neutral', 'negative'].includes(sentiment) ? sentiment : null;
  await env.DB.prepare('UPDATE sales_opportunities SET reply_sentiment = COALESCE(?, reply_sentiment), updated_at = ? WHERE id = ?').bind(sent, t, opp.id).run();
  const stop = await stopSequences(env, { opportunity_id: opp.id, reason: 'reply', ctx });
  if (sent !== 'negative') await advanceStage(env, opp.id, 'engaged', ctx);
  await logActivity(env, {
    organization_id: opp.organization_id, opportunity_id: opp.id, outreach_id: last ? last.id : null, kind: 'reply', ctx,
    detail: { sentiment: sent, note: String(note || '').slice(0, 300) || null, ...stop },
    event: 'sales.reply_received', props: { sentiment: sent, source: 'owner_marked' },
  });
  return { ok: true, opportunity_id: opp.id, ...stop };
}

const PROVIDER_COLUMNS = {
  'email.delivered': ['delivered_at', 'sales.outreach_delivered'],
  'email.opened': ['opened_at', 'sales.outreach_opened'],
  'email.clicked': ['clicked_at', 'sales.outreach_clicked'],
  'email.bounced': ['bounced_at', null],
  'email.complained': ['complained_at', null],
};

/** Resend webhook → the outreach row it belongs to. Returns true if it was a sales email. */
export async function applyProviderEvent(env, { type, email_id } = {}) {
  const map = PROVIDER_COLUMNS[type];
  if (!map || !email_id) return false;
  const row = await salesRow(env, 'SELECT * FROM sales_outreach WHERE provider_id = ?', String(email_id));
  if (!row) return false;
  const [col, event] = map;
  const t = now();
  const r = await env.DB.prepare(`UPDATE sales_outreach SET ${col} = ?, updated_at = ? WHERE id = ? AND ${col} IS NULL`).bind(t, t, row.id).run();
  const first = r.meta && r.meta.changes === 1;
  if (type === 'email.bounced' || type === 'email.complained') {
    await env.DB.prepare("UPDATE sales_contacts SET email_status = CASE WHEN ? = 'email.bounced' THEN 'bounced' ELSE email_status END, suppressed = 1, marketing_email_allowed = 0, updated_at = ? WHERE id = ?")
      .bind(type, t, row.contact_id).run();
    await recordSalesUnsubscribe(env, {
      email: row.recipient_email, contact_id: row.contact_id, organization_id: row.organization_id,
      source: type === 'email.bounced' ? 'bounce' : 'complaint', reason: type,
    });
  }
  if (first && event) {
    await logActivity(env, { organization_id: row.organization_id, opportunity_id: row.opportunity_id, outreach_id: row.id, kind: col.replace(/_at$/, ''), actor: 'system', event, props: { step: row.step_number } });
  }
  return true;
}

/** The approval queue: pending drafts, oldest first, snoozed ones held back until their time. */
export async function approvalQueue(env, { atMs = Date.now(), includeSnoozed = false } = {}) {
  return salesRows(env,
    `SELECT x.*, o.name AS organization_name, o.current_score, o.current_tier, o.business_category, o.city,
            c.full_name AS contact_name, c.title AS contact_title, c.email_status, c.confidence AS contact_confidence, c.source_url AS contact_source_url
       FROM sales_outreach x
       JOIN sales_organizations o ON o.id = x.organization_id
       LEFT JOIN sales_contacts c ON c.id = x.contact_id
      WHERE x.status = 'pending_approval' ${includeSnoozed ? '' : 'AND (x.snoozed_until IS NULL OR x.snoozed_until <= ?)'}
      ORDER BY x.created_at LIMIT 100`, ...(includeSnoozed ? [] : [atMs]));
}
