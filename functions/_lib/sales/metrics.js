// Sales OS — the funnel, measured in outcomes. Files under functions/_lib are NOT routed.
//
// PRIMARY KPI: recurring institutional accounts activated. Every other number exists to find the
// bottleneck in front of that one (spec §22): no opens → deliverability/subject; opens but no
// replies → message/offer; replies but no meetings → CTA/value; meetings but no proposals →
// qualification; proposals but no close → product/pricing. "Emails sent" is reported, never optimised.
import { etDateOf, etDayBounds } from '../hub.js';
import { salesRow, salesRows } from './store.js';

const n = (r, k = 'n') => (r ? Number(r[k]) || 0 : 0);

const REACHED_MEETING = ['meeting_requested', 'meeting_booked', 'tasting', 'proposal', 'negotiating', 'won'];
const REACHED_PROPOSAL = ['proposal', 'negotiating', 'won'];

async function reached(env, stages) {
  const ph = stages.map(() => '?').join(',');
  const r = await salesRow(env,
    `SELECT COUNT(DISTINCT id) AS n FROM (
       SELECT id FROM sales_opportunities WHERE stage IN (${ph})
       UNION
       SELECT opportunity_id AS id FROM sales_activity WHERE kind = 'stage_change' AND json_extract(detail_json, '$.to') IN (${ph})
     )`, ...stages, ...stages);
  return n(r);
}

/** The dashboard tiles (spec §9). */
export async function dashboardCounts(env, { atMs = Date.now() } = {}) {
  const { start, end } = etDayBounds(etDateOf(atMs));
  const week = atMs - 7 * 86400000;
  const [discovered, aTier, research, pending, queued, sentToday, replies, meetings, proposals, won, pipe] = await Promise.all([
    salesRow(env, 'SELECT COUNT(*) AS n FROM sales_organizations WHERE created_at >= ?', week),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_organizations WHERE current_tier = 'A' AND status NOT IN ('converted','suppressed')"),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_organizations WHERE status IN ('discovered','researching') AND website IS NOT NULL AND last_enriched_at IS NULL AND do_not_contact = 0"),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_outreach WHERE status = 'pending_approval' AND (snoozed_until IS NULL OR snoozed_until <= ?)", atMs),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_outreach WHERE status = 'approved'"),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_outreach WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?", start, end),
    salesRow(env, 'SELECT COUNT(DISTINCT opportunity_id) AS n FROM sales_outreach WHERE replied_at IS NOT NULL'),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_opportunities WHERE stage IN ('meeting_requested','meeting_booked','tasting')"),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_opportunities WHERE stage IN ('proposal','negotiating')"),
    salesRow(env, "SELECT COUNT(*) AS n FROM sales_opportunities WHERE stage = 'won'"),
    salesRow(env, "SELECT COALESCE(SUM(estimated_monthly_revenue_cents),0) AS n FROM sales_opportunities WHERE stage NOT IN ('won','lost')"),
  ]);
  return {
    newly_discovered_7d: n(discovered), a_tier: n(aTier), awaiting_research: n(research), awaiting_approval: n(pending),
    queued_outreach: n(queued), sent_today: n(sentToday), replies: n(replies), meetings_tastings: n(meetings),
    proposals: n(proposals), won_accounts: n(won), pipeline_monthly_cents: n(pipe),
  };
}

/** The whole funnel, top to bottom (spec §21), plus the diagnosis. */
export async function funnel(env) {
  const q = (sql, ...a) => salesRow(env, sql, ...a);
  const [orgs, ab, contacts, approved, sent, delivered, opened, views, replied, positive, lost, won, openPipe, wonMonthly] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM sales_organizations'),
    q("SELECT COUNT(*) AS n FROM sales_organizations WHERE current_tier IN ('A','B')"),
    q('SELECT COUNT(DISTINCT organization_id) AS n FROM sales_contacts WHERE marketing_email_allowed = 1 AND suppressed = 0'),
    q('SELECT COUNT(*) AS n FROM sales_outreach WHERE approved_at IS NOT NULL'),
    q("SELECT COUNT(*) AS n FROM sales_outreach WHERE status = 'sent'"),
    q('SELECT COUNT(*) AS n FROM sales_outreach WHERE delivered_at IS NOT NULL'),
    q('SELECT COUNT(*) AS n FROM sales_outreach WHERE opened_at IS NOT NULL'),
    q("SELECT COUNT(DISTINCT opportunity_id) AS n FROM sales_activity WHERE kind = 'landing_view'"),
    q('SELECT COUNT(DISTINCT opportunity_id) AS n FROM sales_outreach WHERE replied_at IS NOT NULL'),
    q("SELECT COUNT(*) AS n FROM sales_opportunities WHERE reply_sentiment = 'positive'"),
    q("SELECT COUNT(*) AS n FROM sales_opportunities WHERE stage = 'lost'"),
    q("SELECT COUNT(*) AS n FROM sales_opportunities WHERE stage = 'won'"),
    q("SELECT COALESCE(SUM(estimated_monthly_revenue_cents),0) AS n FROM sales_opportunities WHERE stage NOT IN ('won','lost')"),
    q("SELECT COALESCE(SUM(estimated_monthly_revenue_cents),0) AS n FROM sales_opportunities WHERE stage = 'won'"),
  ]);
  let realized = 0;
  try {
    const r = await q(`SELECT COALESCE(SUM(i.total_cents),0) AS n FROM contract_invoices i
      WHERE i.account_id IN (SELECT converted_contract_account_id FROM sales_opportunities WHERE converted_contract_account_id IS NOT NULL)
        AND COALESCE(i.status,'') <> 'void'`);
    realized = n(r);
  } catch { realized = 0; }
  const f = {
    organizations_discovered: n(orgs), qualified_ab: n(ab), organizations_with_valid_contact: n(contacts),
    approved_outreach: n(approved), emails_sent: n(sent), delivered: n(delivered), opened: n(opened),
    landing_visits: n(views), replies: n(replied), positive_replies: n(positive),
    meetings_tastings: await reached(env, REACHED_MEETING), proposals: await reached(env, REACHED_PROPOSAL),
    won: n(won), lost: n(lost), pipeline_monthly_cents: n(openPipe), won_monthly_cents: n(wonMonthly),
    realized_revenue_cents: realized,
  };
  return { ...f, diagnosis: diagnose(f) };
}

/** Where the funnel is stuck — the first empty stage after a non-empty one. */
export function diagnose(f) {
  if (!f.emails_sent) return { stage: 'not_started', text: 'Nothing has been sent yet — the funnel has no data. Approve the first emails.' };
  if (f.emails_sent >= 10 && !f.delivered && !f.opened && !f.landing_visits && !f.replies) return { stage: 'deliverability', text: 'Sent but no delivery, open or visit signal: check deliverability, the sender domain, the contacts, and the subject line. (Also confirm the Resend webhook sends delivered/opened events.)' };
  if (f.emails_sent >= 10 && !f.replies && !f.landing_visits) return { stage: 'message', text: 'Emails arrive but nobody visits or replies: the message or offer is not landing. Change the angle before sending more.' };
  if (f.replies && !f.meetings_tastings) return { stage: 'cta', text: 'Replies but no meetings or tastings: the call to action or the value is not strong enough to take the next step.' };
  if (f.meetings_tastings && !f.proposals) return { stage: 'qualification', text: 'Meetings but no proposals: the prospects being met are not qualified — tighten the ICP.' };
  if (f.proposals && !f.won) return { stage: 'close', text: 'Proposals but no close: product, pricing, or terms are the obstacle.' };
  if (f.won) return { stage: 'proven', text: 'At least one account converted — the loop works. Now improve the weakest rate.' };
  return { stage: 'early', text: 'Too little data to diagnose — keep going to 20 sends.' };
}

/** Conversion by a dimension: source | tier | template. Rows: { key, contacted, replied, meetings, won }. */
export async function conversionBy(env, dim) {
  const col = dim === 'source' ? 'p.source' : dim === 'tier' ? 'p.tier_at_creation' : null;
  if (dim === 'template') {
    return salesRows(env,
      `SELECT st.template_type AS key, COUNT(DISTINCT x.opportunity_id) AS contacted,
              COUNT(DISTINCT CASE WHEN x.replied_at IS NOT NULL THEN x.opportunity_id END) AS replied
         FROM sales_outreach x JOIN sales_sequence_steps st ON st.id = x.step_id
        WHERE x.status = 'sent' GROUP BY st.template_type`);
  }
  if (!col) return [];
  return salesRows(env,
    `SELECT COALESCE(${col}, 'unknown') AS key,
            COUNT(DISTINCT CASE WHEN x.status = 'sent' THEN p.id END) AS contacted,
            COUNT(DISTINCT CASE WHEN x.replied_at IS NOT NULL THEN p.id END) AS replied,
            COUNT(DISTINCT CASE WHEN p.stage IN ('meeting_requested','meeting_booked','tasting','proposal','negotiating','won') THEN p.id END) AS meetings,
            COUNT(DISTINCT CASE WHEN p.stage = 'won' THEN p.id END) AS won
       FROM sales_opportunities p LEFT JOIN sales_outreach x ON x.opportunity_id = p.id
      GROUP BY COALESCE(${col}, 'unknown')`);
}
