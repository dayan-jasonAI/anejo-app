// Sales OS — CAMPAIGNS (enroll a set, once) and REPLIES (what they said, and what it means).
// Files under functions/_lib are NOT routed.
//
// CAMPAIGNS. The Hub could already enroll a prospect and draft step 1; it could not enroll twelve.
// So outreach moved at the speed of the owner remembering to press a button twelve times, and the
// follow-up schedule that already exists sat mostly unused. A campaign is a name over a set of
// enrollments: same gates, same caps, same per-email approval, one action.
//
// WHAT A CAMPAIGN STILL CANNOT DO: send. Every draft it produces lands in the approval queue with
// its preview, because the rule that no prospect email leaves without a human reading it is the
// rule this whole system is built around. "Autonomous" here means the machine does the drafting,
// the scheduling, the stopping and the record-keeping — not that it talks to buyers unsupervised.
//
// REPLIES. Reply detection is manual (no inbox connection exists in the Worker), which meant a
// buyer could answer and the sequence would keep talking. Now a reply is logged as the buyer's own
// words, classified deterministically, and that record does three things at once: stops the
// sequence, moves the stage, and drafts the answer.
import { id, now, toJson, parseJson } from '../hub.js';
import { salesRow, salesRows, logActivity, createOpportunity, setStage, stopSequences } from './store.js';
import { startSequence } from './outreach.js';

// ---------------------------------------------------------------- campaigns

export async function startCampaign(env, { name, goal, category, organization_ids = [], acknowledge_gaps = false, cfg, ctx } = {}) {
  const title = String(name || '').trim().slice(0, 120);
  if (!title) return { ok: false, error: 'A campaign needs a name you will recognise in three months.' };
  const ids = [...new Set((organization_ids || []).map((x) => String(x || '')).filter(Boolean))].slice(0, 50);
  if (!ids.length) return { ok: false, error: 'Select at least one prospect.' };

  // The readiness gate, applied ONCE for the whole set rather than per email: if this category will
  // ask for documents Añejo does not have, the owner sees that before twelve conversations start.
  let gaps = [];
  let readinessNote = null;
  try {
    const { loadReadiness, buyerChecklist } = await import('./requirements.js');
    const readiness = await loadReadiness(env);
    const cats = new Set();
    for (const oid of ids) {
      const o = await salesRow(env, 'SELECT business_category FROM sales_organizations WHERE id = ?', oid);
      if (o) cats.add(o.business_category || 'other');
    }
    for (const c of cats) for (const g of (buyerChecklist(c, readiness).blocking_outreach || [])) if (!gaps.includes(g.label)) gaps.push(g.label);
    readinessNote = gaps.length ? `Launched with these gaps open: ${gaps.join('; ')}` : 'No readiness gaps open at launch.';
  } catch { /* readiness is advisory here; the per-email gate still runs at approval */ }
  if (gaps.length && !acknowledge_gaps) {
    return { ok: false, code: 'readiness', readiness_gaps: gaps,
      error: `These buyers will ask for ${gaps.length} thing${gaps.length === 1 ? '' : 's'} Añejo cannot hand over yet — ${gaps.join('; ')}. Fix it in Sales → Readiness, or launch with the gaps acknowledged.` };
  }

  const cid = id('scmp');
  const t = now();
  await env.DB.prepare(
    'INSERT INTO sales_campaigns (id, name, category, goal, status, readiness_note, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(cid, title, category || null, goal ? String(goal).slice(0, 400) : null, 'active', readinessNote,
    (ctx && ctx.distinct_id) || null, t, t).run();

  const results = [];
  for (const oid of ids) {
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', oid);
    if (!org) { results.push({ organization_id: oid, ok: false, why: 'not found' }); continue; }
    if (org.do_not_contact || org.status === 'suppressed') { results.push({ organization_id: oid, ok: false, why: 'do not contact' }); continue; }
    let opp = await salesRow(env, "SELECT * FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", oid);
    if (!opp) {
      const made = await createOpportunity(env, oid, { ctx });
      if (!made.ok) { results.push({ organization_id: oid, ok: false, why: made.error }); continue; }
      opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', made.opportunity_id);
    }
    const r = await startSequence(env, { opportunity_id: opp.id, cfg, ctx });
    if (r.ok && r.enrollment_id) {
      await env.DB.prepare('UPDATE sales_enrollments SET campaign_id = ? WHERE id = ?').bind(cid, r.enrollment_id).run();
    }
    results.push({ organization_id: oid, name: org.name, ok: !!r.ok, why: r.ok ? null : (r.error || r.why || 'could not enroll'), outreach_id: r.outreach_id || null });
  }
  const enrolled = results.filter((r) => r.ok).length;
  await logActivity(env, { kind: 'campaign_started', ctx, detail: { campaign_id: cid, name: title, requested: ids.length, enrolled, gaps } });
  return { ok: true, campaign_id: cid, name: title, enrolled, refused: results.length - enrolled, readiness_gaps: gaps, results };
}

/** Every campaign with what it has actually produced — drafts, sends, replies, meetings. */
export async function campaignList(env) {
  const rows = await salesRows(env, 'SELECT * FROM sales_campaigns ORDER BY created_at DESC LIMIT 50');
  const out = [];
  for (const c of rows) {
    const n = await salesRow(env,
      `SELECT
         (SELECT COUNT(*) FROM sales_enrollments e WHERE e.campaign_id = ?) AS enrolled,
         (SELECT COUNT(*) FROM sales_outreach o JOIN sales_enrollments e ON e.id = o.enrollment_id WHERE e.campaign_id = ?) AS drafted,
         (SELECT COUNT(*) FROM sales_outreach o JOIN sales_enrollments e ON e.id = o.enrollment_id WHERE e.campaign_id = ? AND o.status = 'sent') AS sent,
         (SELECT COUNT(*) FROM sales_outreach o JOIN sales_enrollments e ON e.id = o.enrollment_id WHERE e.campaign_id = ? AND o.replied_at IS NOT NULL) AS replied`,
      c.id, c.id, c.id, c.id);
    out.push({ ...c, stats: { enrolled: Number(n.enrolled) || 0, drafted: Number(n.drafted) || 0, sent: Number(n.sent) || 0, replied: Number(n.replied) || 0 } });
  }
  return out;
}

export async function setCampaignStatus(env, campaignId, status, { ctx } = {}) {
  if (!['active', 'paused', 'done'].includes(String(status))) return { ok: false, error: 'Status must be active, paused or done.' };
  const c = await salesRow(env, 'SELECT id FROM sales_campaigns WHERE id = ?', String(campaignId || ''));
  if (!c) return { ok: false, error: 'Campaign not found.' };
  await env.DB.prepare('UPDATE sales_campaigns SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), c.id).run();
  // Pausing a campaign stops its sequences: the point of pausing is that nothing more goes out.
  if (status !== 'active') {
    const enr = await salesRows(env, "SELECT opportunity_id FROM sales_enrollments WHERE campaign_id = ? AND status = 'active'", c.id);
    for (const e of enr) await stopSequences(env, { opportunity_id: e.opportunity_id, reason: 'campaign_' + status, ctx });
  }
  await logActivity(env, { kind: 'campaign_status', ctx, detail: { campaign_id: c.id, status } });
  return { ok: true, campaign_id: c.id, status };
}

// ---------------------------------------------------------------- replies

// Deterministic on purpose. A classifier that needs a model is a classifier that fails when the
// budget is spent or the key rotates, and this one decides whether a sequence keeps talking to a
// person who already said no. The phrases are what buyers actually write, kept visible so a wrong
// call can be seen and corrected rather than argued with.
const RULES = [
  { key: 'unsubscribe', confidence: 'high', any: [/\bunsubscribe\b/i, /\bremove me\b/i, /\btake me off\b/i, /\bstop (emailing|contacting)\b/i, /\bdo not (contact|email)\b/i] },
  { key: 'not_interested', confidence: 'high', any: [/\bnot interested\b/i, /\bno thank(s| you)\b/i, /\bwe('| a)re all set\b/i, /\balready have a (caterer|vendor|provider)\b/i, /\bwe cook (in[- ]house|our own)\b/i, /\bpass\b.{0,12}\bfor now\b/i] },
  { key: 'not_now', confidence: 'medium', any: [/\bnot (right now|at this time)\b/i, /\bnext (year|quarter|month)\b/i, /\bcircle back\b/i, /\bcheck back\b/i, /\bbudget\b.{0,20}\b(next|later)\b/i, /\bkeep (us|me) in mind\b/i] },
  { key: 'interested', confidence: 'high', any: [/\b(yes|sure|absolutely)\b.{0,40}\b(interested|send|call|meet)/i, /\bplease send\b/i, /\bsend (me |us )?(the |your )?(menu|pricing|proposal|information|info)\b/i, /\bwhen can (you|we)\b/i, /\bset(ting)? up a (call|meeting|time)\b/i, /\blet'?s (talk|meet|schedule)\b/i, /\bwe(' | a)?re interested\b/i, /\bi(' | a)?m interested\b/i] },
  { key: 'question', confidence: 'medium', any: [/\?\s*$/m, /\bhow much\b/i, /\bwhat (is|are|does)\b/i, /\bcan you\b/i, /\bdo you (offer|deliver|serve|have)\b/i] },
];

export function classifyReply(text) {
  const t = String(text || '');
  if (!t.trim()) return { classification: 'other', confidence: 'low', signals: [] };
  for (const rule of RULES) {
    const hits = rule.any.filter((re) => re.test(t)).map((re) => String(re));
    if (hits.length) return { classification: rule.key, confidence: rule.confidence, signals: hits.slice(0, 3) };
  }
  return { classification: 'other', confidence: 'low', signals: [] };
}

const STAGE_FOR = { interested: 'engaged', question: 'engaged', not_now: 'nurture', not_interested: 'lost', unsubscribe: 'lost' };
const INTENT_FOR = { interested: 'answer_question', question: 'answer_question', not_now: 'nurture', not_interested: null, unsubscribe: null, other: 'answer_question' };

/**
 * Log what a prospect said, and act on it: stop the sequence, move the stage, suppress on an
 * unsubscribe, and draft the answer for the owner to approve. Never sends.
 */
export async function logReply(env, { organization_id, outreach_id = null, contact_id = null, channel = 'email', body, draft = true, cfg, ctx } = {}) {
  const orgId = String(organization_id || '');
  const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  const text = String(body || '').trim();
  if (!text) return { ok: false, error: 'Paste what they actually said — that sentence is the whole point of the record.' };

  const cls = classifyReply(text);
  const opp = await salesRow(env, "SELECT * FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", orgId);
  const rid = id('srep');
  const t = now();
  await env.DB.prepare(
    `INSERT INTO sales_replies (id, organization_id, opportunity_id, outreach_id, contact_id, channel, body,
       classification, confidence, signals, handled, logged_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`
  ).bind(rid, orgId, opp ? opp.id : null, outreach_id, contact_id, channel, text.slice(0, 4000),
    cls.classification, cls.confidence, toJson(cls.signals), (ctx && ctx.distinct_id) || null, t).run();

  const done = { classification: cls.classification, confidence: cls.confidence, stopped: false, stage: null, suppressed: false, drafted_outreach_id: null };

  // A human answered. Nothing automated keeps talking over them, whatever they said.
  if (opp) {
    const st = await stopSequences(env, { opportunity_id: opp.id, reason: 'reply', ctx });
    done.stopped = !!(st && (st.stopped || st.ok));
    if (outreach_id) await env.DB.prepare('UPDATE sales_outreach SET replied_at = ? WHERE id = ? AND replied_at IS NULL').bind(t, outreach_id).run();
    const want = STAGE_FOR[cls.classification];
    if (want && opp.stage !== want) {
      const r = await setStage(env, opp.id, want, { note: `Reply classified as ${cls.classification}`, loss_reason: want === 'lost' ? cls.classification : undefined, ctx });
      if (r && r.ok) done.stage = want;
    }
  }
  if (cls.classification === 'unsubscribe') {
    const { suppressOrganization } = await import('./store.js');
    await suppressOrganization(env, orgId, { reason: 'Asked to be removed, in their reply', ctx });
    done.suppressed = true;
  }

  // Draft the answer from their own words. Refused for a no: the right follow-up to "not
  // interested" is silence, and a draft sitting in the queue is an invitation to send it.
  const intent = INTENT_FOR[cls.classification];
  if (draft && intent && cls.classification !== 'not_interested' && cls.classification !== 'unsubscribe') {
    try {
      const { draftFollowup } = await import('./followup.js');
      const d = await draftFollowup(env, {
        organization_id: orgId, contact_id: contact_id || undefined, intent,
        instruction: `They replied: "${text.slice(0, 600)}". Answer what they actually asked, in two short paragraphs.`,
        cfg, ctx,
      });
      if (d && d.ok && d.outreach_id) {
        done.drafted_outreach_id = d.outreach_id;
        await env.DB.prepare('UPDATE sales_replies SET drafted_outreach_id = ?, handled = 1 WHERE id = ?').bind(d.outreach_id, rid).run();
      }
    } catch { /* a drafting failure must not lose the reply itself */ }
  }

  await logActivity(env, {
    organization_id: orgId, opportunity_id: opp ? opp.id : null, kind: 'reply', ctx, event: 'sales.reply_logged',
    detail: { reply_id: rid, classification: cls.classification, confidence: cls.confidence, channel, excerpt: text.slice(0, 300) },
    props: { classification: cls.classification, channel },
  });
  return { ok: true, reply_id: rid, ...done };
}

/** Replies that still need the owner: newest first. */
export async function replyInbox(env, { limit = 25 } = {}) {
  const rows = await salesRows(env,
    `SELECT r.*, o.name AS organization_name, o.city
       FROM sales_replies r JOIN sales_organizations o ON o.id = r.organization_id
      ORDER BY r.created_at DESC LIMIT ?`, Math.max(1, Math.min(100, limit)));
  return rows.map((r) => ({ ...r, signals: parseJson(r.signals, []) }));
}
