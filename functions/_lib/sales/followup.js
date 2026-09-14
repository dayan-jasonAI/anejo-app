// Sales OS — THE FOLLOW-UP DRAFTER. Files under functions/_lib are NOT routed.
//
// WHY THIS EXISTS. The sequence drafter (outreach.js) writes the same four templated emails to every
// prospect, because at step 1 every prospect looks the same. The moment a real conversation starts
// they stop looking the same: one of them told you at the door that they are trialling somebody else
// on Thursday, one replied asking for a price, one opened the landing page twice and said nothing.
// A template cannot answer any of those, and the owner should not have to leave the Hub, open a chat
// window and paste the result back in to write one letter.
//
// So this drafts a follow-up FROM WHAT IS ALREADY RECORDED — the door visit and its ten intake
// fields, every logged touch (a reply, a call, a voicemail, a walk-in), the outreach history with
// what was opened and clicked, the landing views, the score's own reasons, and the stage. Nothing it
// writes comes from anywhere else.
//
// WHAT IT DOES NOT DO. It does not send. The draft lands in the same approval queue as every other
// email — editable subject, editable body, exact-render preview, approve-by-hash — because the law
// that no prospect email leaves without the owner reading the exact thing that will arrive is not
// suspended just because a model wrote the first version.
//
// IT IS NEVER THE ONLY PATH. If there is no API key, no budget left, or the model returns something
// unusable, `deterministicFollowup()` writes a real letter from the same context. A follow-up the
// owner can send is always produced; the difference is only how good the prose is.
import { salesRow, salesRows, logActivity } from './store.js';
import { id, now, toJson, parseJson } from '../hub.js';
import { budgetGate, recordSpend } from '../ai_budget.js';
import { checkDraft, landingUrlFor, signature, normSubject, normBody } from './outreach.js';
import { VISIT_FIELDS } from './visit.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

/** Inbound of any shape. The owner types what happened; the drafter reads it. */
export const TOUCH_CHANNELS = Object.freeze([
  { key: 'email_reply', label: 'They replied by email' },
  { key: 'phone_call', label: 'Phone call' },
  { key: 'voicemail', label: 'Voicemail they left' },
  { key: 'in_person', label: 'They came to me / I stopped by' },
  { key: 'text', label: 'Text message' },
  { key: 'referral', label: 'Someone passed word along' },
  { key: 'other', label: 'Something else' },
]);

export const TOUCH_SENTIMENTS = Object.freeze([
  { key: 'interested', label: 'Interested — wants to go further' },
  { key: 'question', label: 'Asked a question' },
  { key: 'objection', label: 'Pushed back on something' },
  { key: 'timing', label: 'Not now, but not never' },
  { key: 'declined', label: 'Said no' },
  { key: 'neutral', label: 'Just information' },
]);

export const isTouchChannel = (k) => TOUCH_CHANNELS.some((c) => c.key === k);
export const isTouchSentiment = (k) => TOUCH_SENTIMENTS.some((c) => c.key === k);

/**
 * WHAT KIND OF LETTER THIS MOMENT CALLS FOR. Deterministic and ordered most-specific first, because
 * the owner should be able to predict what the button will write before he presses it. `guidance` is
 * handed to the model as the brief for this letter and is also what the fallback follows.
 */
export const FOLLOWUP_INTENTS = Object.freeze([
  {
    key: 'after_reply',
    label: 'Answer what they said',
    guidance: 'They have responded. Answer the actual thing they raised, first sentence, plainly. Do not re-pitch what they already agreed to. Ask for exactly one next step.',
  },
  {
    key: 'post_visit',
    label: 'After the visit',
    guidance: 'Follow an in-person visit. Refer to what was actually said at the door and to the person met, by name. Ask only for what is still missing from the visit notes. One ask.',
  },
  {
    key: 'post_tasting',
    label: 'After the tasting',
    guidance: 'A tasting has happened. Thank them, ask plainly what they thought, and propose the concrete next step — a first service day. Do not re-explain the service.',
  },
  {
    key: 'viewed_no_reply',
    label: 'They opened it and went quiet',
    guidance: 'They opened the page but did not reply. Do not say you can see that they opened it — it reads as surveillance. Send one short, useful thing and make replying easy.',
  },
  {
    key: 'no_response',
    label: 'No response yet',
    guidance: 'Nothing has come back. Short. Add one piece of value that was not in the first email. Give them an easy way to say "not now" as well as "yes".',
  },
  {
    key: 'check_in',
    label: 'Check in',
    guidance: 'No particular trigger. Keep it very short and human, restate the one thing that makes the service different, and leave the door open without pressing.',
  },
]);

export const intentByKey = (k) => FOLLOWUP_INTENTS.find((i) => i.key === k) || null;

const DAY = 86400000;

/**
 * Pick the intent from the record. Time-aware: a prospect that went quiet three hours ago does not
 * need chasing, one that went quiet a week ago does.
 */
export function chooseIntent(cx, atMs = Date.now()) {
  const lastSent = cx.outreach.find((o) => o.sent_at);
  const sinceSent = lastSent && lastSent.sent_at ? atMs - lastSent.sent_at : null;

  // Anything they said themselves outranks anything we inferred from telemetry.
  if (cx.last_inbound) {
    const replied = cx.last_inbound;
    const answeredSince = cx.outreach.some((o) => o.sent_at && o.sent_at > replied.at);
    if (!answeredSince) return intentByKey('after_reply');
  }
  if (cx.visit && !cx.outreach.some((o) => o.sent_at && o.sent_at > cx.visit.at)) return intentByKey('post_visit');
  if (cx.opportunity && ['tasting_done', 'meeting_held'].includes(cx.opportunity.stage)) return intentByKey('post_tasting');
  if (lastSent && lastSent.clicked_at && !lastSent.replied_at && sinceSent >= 2 * DAY) return intentByKey('viewed_no_reply');
  if (lastSent && !lastSent.replied_at && sinceSent >= 4 * DAY) return intentByKey('no_response');
  return intentByKey('check_in');
}

/** The sendable contact this letter should go to: the primary if it can receive mail, else the newest that can. */
function pickContact(contacts, wantedId) {
  const ok = (c) => c && c.email && !c.suppressed && c.marketing_email_allowed;
  if (wantedId) { const w = contacts.find((c) => c.id === wantedId); if (ok(w)) return w; }
  return contacts.find((c) => c.is_primary && ok(c)) || contacts.find(ok) || null;
}

/**
 * Everything the drafter is allowed to know, gathered once. Read-only. Every field here came from
 * the owner, the prospect, or the scorer — never from a model.
 */
export async function followupContext(env, orgId, { contactId = null } = {}) {
  const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return null;
  const contacts = await salesRows(env, 'SELECT * FROM sales_contacts WHERE organization_id = ? ORDER BY is_primary DESC, created_at DESC', orgId);
  const opportunity = await salesRow(env, "SELECT * FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", orgId);
  const outreach = await salesRows(env,
    'SELECT id, step_number, subject, body_snapshot, status, sent_at, opened_at, clicked_at, replied_at FROM sales_outreach WHERE organization_id = ? ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 12', orgId);
  const acts = await salesRows(env,
    'SELECT kind, detail_json, created_at FROM sales_activity WHERE organization_id = ? ORDER BY created_at DESC LIMIT 60', orgId);
  const scoreRow = await salesRow(env, 'SELECT * FROM sales_scores WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1', orgId);

  // The visit is the richest thing on most records — ten fields the owner collected in person.
  let visit = null;
  const vRow = acts.find((a) => a.kind === 'visit');
  if (vRow) {
    const d = parseJson(vRow.detail_json, {}) || {};
    visit = { at: vRow.created_at, summary: d.summary || null, outcome: d.outcome || null, note: d.note || null };
    for (const f of VISIT_FIELDS) if (d[f.key]) visit[f.key] = d[f.key];
  }

  const touches = acts.filter((a) => a.kind === 'touch').map((a) => {
    const d = parseJson(a.detail_json, {}) || {};
    return { at: a.created_at, channel: d.channel || null, sentiment: d.sentiment || null, summary: d.summary || null, asked: d.asked || null };
  });
  // A logged touch and the system's own reply marker are the same event class to a drafter.
  const replyAct = acts.find((a) => a.kind === 'reply');
  const lastInboundAt = Math.max(touches.length ? touches[0].at : 0, replyAct ? replyAct.created_at : 0);
  const last_inbound = lastInboundAt ? (touches.find((t) => t.at === lastInboundAt) || { at: lastInboundAt, channel: 'email_reply', summary: (parseJson(replyAct && replyAct.detail_json, {}) || {}).note || null }) : null;

  return {
    org,
    contacts,
    contact: pickContact(contacts, contactId),
    opportunity,
    outreach,
    visit,
    touches,
    last_inbound,
    landing_views: acts.filter((a) => a.kind === 'landing_view').length,
    score: scoreRow ? { score: scoreRow.score, tier: scoreRow.tier, criteria: parseJson(scoreRow.criteria_json, []) || [] } : null,
  };
}

/** The facts the model is allowed to use, and nothing else. Shapes the prompt AND the fallback. */
export function factsFor(cx, cfg) {
  const missing = [];
  if (!cx.org.employee_or_capacity_hint) missing.push('how many people they serve on a typical day');
  if (cx.visit && !cx.visit.best_time) missing.push('the best time to reach them');
  if (!cx.contacts.some((c) => c.full_name)) missing.push('the name of whoever decides');
  return {
    organization: cx.org.name,
    city: cx.org.city || null,
    category: (cx.org.business_category || '').replace(/_/g, ' ') || null,
    people_served_per_day: cx.org.employee_or_capacity_hint || null,
    writing_to: cx.contact ? { name: cx.contact.full_name || null, title: cx.contact.title || null } : null,
    stage: cx.opportunity ? cx.opportunity.stage : null,
    visit: cx.visit,
    recent_inbound: cx.touches.slice(0, 4),
    previous_emails: cx.outreach.filter((o) => o.sent_at).slice(0, 3).map((o) => ({ subject: o.subject, sent: !!o.sent_at, replied: !!o.replied_at })),
    still_unknown: missing,
    offer: {
      product: cfg.offer && cfg.offer.product_name,
      how_it_works: cfg.offer && cfg.offer.value_prop,
      area: cfg.offer && cfg.offer.area_label,
      pricing_may_be_stated: !!(cfg.offer && cfg.offer.pricing_display_policy === 'show_from'),
      tasting_offered: !!(cfg.offer && cfg.offer.tasting_enabled),
    },
  };
}

function systemPrompt(intent, sig) {
  return `You write ONE short follow-up email for the owner of a Cuban Mediterranean catering company in Palm Beach, Florida, to an institution he is trying to earn as a client.

THIS LETTER'S JOB: ${intent.guidance}

HARD RULES. Breaking any one of these makes the email unusable:
- Use ONLY the facts in the JSON you are given. Invent nothing — no headcounts, no delivery times, no dietary capabilities, no history that is not there.
- Never state or imply a price, a per-head figure or a discount unless offer.pricing_may_be_stated is true.
- Never name, describe or allude to another customer. He has no recorded permission to reference anyone.
- Never offer a tasting unless offer.tasting_offered is true.
- Never claim you can see whether they opened anything.
- Do not promise a delivery window or a response time.

VOICE: a working owner writing to a person he has met or wants to meet. Warm, direct, professional, unhurried. Plain sentences. No marketing adjectives, no "I wanted to reach out", no "circling back", no exclamation marks. Never use em dashes or en dashes; use commas and full stops.

SHAPE: under 160 words before the signature. One ask, not three. If several things are unknown, gather them inside that single ask rather than listing questions.

Return ONLY JSON: {"subject": "...", "body": "..."}
The subject is under 70 characters, says something concrete, and reads sensibly if it is forwarded to a colleague who has never heard of him.
The body is plain text with blank lines between paragraphs and ENDS with exactly this signature block, unchanged:

${sig}`;
}

/**
 * The letter that gets written when there is no model. Not a placeholder: a real, sendable email
 * assembled from the same context, so "the AI is unavailable" never means "no follow-up today".
 */
export function deterministicFollowup(cx, intent, cfg, landingUrl) {
  const sig = signature(cfg.sender || {}, landingUrl);
  const who = (cx.contact && cx.contact.full_name && String(cx.contact.full_name).split(/\s+/)[0]) || null;
  const org = cx.org.name;
  const p = [];
  p.push(who ? `Hi ${who},` : 'Hello,');

  if (intent.key === 'post_visit' && cx.visit) {
    p.push(`Thank you for the time when I stopped by${cx.visit.spoke_to_name ? '' : ''}. I said I would follow up, so here it is.`);
    if (cx.visit.current_solution) p.push(`You mentioned how lunch is handled now, and that is exactly the part we build around. Your staff send us the day's headcount from a link each morning, and we cook to that number, so you are paying for the meals you actually asked for rather than a standing order that does not match who showed up.`);
    else p.push(`Your staff send us the day's headcount from a link each morning, and we cook to that number, so you are paying for the meals you actually asked for rather than a standing order that does not match who showed up.`);
  } else if (intent.key === 'after_reply') {
    p.push('Thank you for coming back to me.');
    p.push('Rather than guess at what would suit you, tell me a little about how lunch runs on a normal day and I will put something concrete in front of you.');
  } else if (intent.key === 'post_tasting') {
    p.push('Thank you for having me in. I would rather hear it straight: what did your team think of the food?');
    p.push('If it landed well, the natural next step is a single service day for the program, priced to your count.');
  } else {
    p.push(`I wrote a little while ago about lunch for ${org} and wanted to leave one more note.`);
    p.push('The part worth knowing is that your count is never fixed. Your staff send the day\'s headcount from a link each morning and we cook to that number, so nothing is ordered a week ahead and nothing is paid for that was not asked for.');
  }

  if (landingUrl) p.push(`Photos and how it works: ${landingUrl}`);

  const unknown = factsFor(cx, cfg).still_unknown;
  if (unknown.length) p.push(`If you can tell me ${unknown.slice(0, 2).join(' and ')}, I can put a real number in front of you rather than a guess.`);
  else p.push('If it would help to talk it through, tell me a time that suits and I will call.');

  if (intent.key === 'no_response' || intent.key === 'check_in') p.push('And if the timing is wrong, just say so and I will leave it there.');

  p.push('');
  p.push(sig);
  return { subject: subjectFor(intent, org), body: p.join('\n\n').replace(/\n{3,}/g, '\n\n') };
}

function subjectFor(intent, org) {
  switch (intent.key) {
    case 'post_visit': return `Following up from my visit, ${org}`;
    case 'after_reply': return `Re: lunch for ${org}`;
    case 'post_tasting': return `Thank you for the tasting, ${org}`;
    case 'viewed_no_reply': return `One more thing about lunch for ${org}`;
    case 'no_response': return `Lunch for ${org}, one short note`;
    default: return `Lunch for ${org}`;
  }
}

/** Keep the model honest about the signature: it must be the real one, whatever the model returned. */
function enforceSignature(body, sig) {
  const b = normBody(body);
  if (b.endsWith(sig)) return b;
  // Strip anything that looks like a trailing sign-off the model invented, then append the real one.
  const cut = b.split('\n').filter((l) => !/^(dayan|owner|añejo catering|anejo catering|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[\w.+-]+@[\w.-]+|anejocateringco\.com)\s*$/i.test(l.trim()));
  return `${cut.join('\n').trim()}\n\n${sig}`;
}

/**
 * Draft one follow-up into the approval queue. Never sends. Returns the outreach id so the Hub can
 * take the owner straight to the editable card.
 */
export async function draftFollowup(env, { organization_id, contact_id = null, intent: wantedIntent = null, instruction = null, cfg, ctx, fetchImpl = fetch, atMs = Date.now() } = {}) {
  const cx = await followupContext(env, String(organization_id || ''), { contactId: contact_id });
  if (!cx) return { ok: false, error: 'Organization not found.' };
  if (!cx.opportunity) return { ok: false, error: 'This prospect has no open opportunity yet. Create one first — the landing link and the outreach record hang off it.' };
  if (!cx.contact) return { ok: false, error: 'No contact here can receive email. Add one with an address, or check whether the address you have is suppressed.' };
  if (cx.org.do_not_contact || cx.org.status === 'suppressed') return { ok: false, error: 'This organization is marked do-not-contact.' };

  const intent = intentByKey(wantedIntent) || chooseIntent(cx, atMs);
  const landingUrl = landingUrlFor(env, cx.opportunity.landing_token);
  const sig = signature(cfg.sender || {}, landingUrl);
  const facts = factsFor(cx, cfg);

  let draft = null;
  let kind = 'deterministic';
  let why = null;
  if (!env.ANTHROPIC_API_KEY) why = 'no ANTHROPIC_API_KEY';
  else if (!(await budgetGate(env)).ok) why = 'weekly AI budget reached';
  else {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
    try {
      const user = `FACTS (JSON):\n${JSON.stringify(facts)}${instruction ? `\n\nTHE OWNER ALSO ASKS: ${String(instruction).slice(0, 600)}` : ''}${landingUrl ? `\n\nYou may include this link once: ${landingUrl}` : ''}`;
      const r = await fetchImpl(API, {
        method: 'POST',
        signal: ctl ? ctl.signal : undefined,
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, system: systemPrompt(intent, sig), messages: [{ role: 'user', content: user }] }),
      });
      const data = await r.json().catch(() => null);
      if (data && data.usage) await recordSpend(env, { feature: 'sales_followup', model: MODEL, usage: data.usage });
      const text = data && Array.isArray(data.content) ? data.content.filter((c) => c.type === 'text').map((c) => c.text).join('') : '';
      let parsed = null;
      try { parsed = JSON.parse(String(text).replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { parsed = null; }
      if (r.ok && parsed && parsed.subject && parsed.body) {
        draft = { subject: normSubject(parsed.subject), body: enforceSignature(parsed.body, sig) };
        kind = 'ai';
      } else why = r.ok ? 'the model answer was not usable' : `model call failed (HTTP ${r.status})`;
    } catch (e) {
      why = /abort/i.test(String(e && e.name)) ? 'model call timed out' : 'model call failed';
    } finally { if (timer) clearTimeout(timer); }
  }
  if (!draft) draft = deterministicFollowup(cx, intent, cfg, landingUrl);

  const flags = checkDraft(draft, cfg);
  if (kind === 'deterministic' && why) flags.push({ type: 'deterministic', detail: `Written from your records without AI (${why}). Read it closely before approving.` });

  const oid = id('sout');
  const t = now();
  const stepNumber = (cx.outreach.filter((o) => o.sent_at).length || 0) + 1;
  await env.DB.prepare(
    `INSERT INTO sales_outreach (id, opportunity_id, organization_id, contact_id, step_number, channel, recipient_email,
       subject, body_snapshot, cta_url, status, ai_assisted, edited, claims_json, flags_json, unsub_token, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,'email',?,?,?,?,'pending_approval',?,0,?,?,?,?,?,?)`
  ).bind(oid, cx.opportunity.id, cx.org.id, cx.contact.id, stepNumber, cx.contact.email, draft.subject, draft.body, landingUrl,
    kind === 'ai' ? 1 : 0, toJson([{ text: `Follow-up written from this prospect's own record (${intent.key}).`, source: 'sales_activity' }]),
    toJson(flags), randomToken(), (ctx && ctx.distinct_id) || 'owner', t, t).run();

  await logActivity(env, {
    organization_id: cx.org.id, opportunity_id: cx.opportunity.id, contact_id: cx.contact.id, outreach_id: oid,
    kind: 'draft', ctx, detail: { follow_up: true, intent: intent.key, kind, flags: flags.length },
    event: 'sales.outreach_drafted', props: { intent: intent.key, kind },
  });
  return { ok: true, outreach_id: oid, intent: intent.key, intent_label: intent.label, kind, flags, subject: draft.subject };
}

function randomToken() {
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues ? globalThis.crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
