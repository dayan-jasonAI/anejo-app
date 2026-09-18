// Local recorded outcomes, not causal attribution or payment-provider reconciliation.
// Campaign is the existing tracked_links -> UTM -> order/lead key. Never join by email,
// infer a post/brief association, or treat order estimates as captured revenue.
export const OUTCOME_WINDOW_DAYS = 60;
export const OUTCOME_MIN_SAMPLE = 5;
export async function loadMarketingOutcomes(env, { now = Date.now() } = {}) {
  const base = { windowDays: OUTCOME_WINDOW_DAYS, asOf: now, since: now - OUTCOME_WINDOW_DAYS * 86400000,
    cohort: 'record_created_at', revenue: null, roas: null, quoteBookings: null,
    limitation: 'Campaign-level recorded statuses only; no post/brief join, captured revenue, spend, or quote-to-booking attribution.' };
  if (!env?.DB) return { ...base, status: 'unknown', reason: 'database_unavailable', campaigns: [] };
  try {
    const result = await env.DB.prepare(`WITH outcomes AS (
      SELECT utm_campaign AS campaign, 1 AS paid_orders, 0 AS quote_requests FROM orders
       WHERE created_at>=? AND created_at<=? AND status IN ('paid','prep','ready','fulfilled')
      UNION ALL
      SELECT utm_campaign AS campaign, 0 AS paid_orders, 1 AS quote_requests FROM leads
       WHERE created_at>=? AND created_at<=? AND kind='catering'
    ) SELECT campaign, SUM(paid_orders) AS paid_orders, SUM(quote_requests) AS quote_requests,
        EXISTS(SELECT 1 FROM tracked_links l WHERE l.utm_campaign=outcomes.campaign AND l.utm_campaign!='') AS tracked
      FROM outcomes GROUP BY campaign ORDER BY paid_orders DESC, quote_requests DESC, campaign`)
      .bind(base.since, now, base.since, now).all();
    if (!Array.isArray(result?.results)) throw new Error('missing_results');
    const campaigns = result.results.filter(r => r.tracked === 1).map(r => ({ campaign: String(r.campaign),
      paidOrders: Number(r.paid_orders), quoteRequests: Number(r.quote_requests),
      comparison: Number(r.paid_orders) + Number(r.quote_requests) < OUTCOME_MIN_SAMPLE ? 'unknown_insufficient_sample' : 'descriptive_only' }));
    const totals = result.results.reduce((a,r) => ({ paidOrders: a.paidOrders + Number(r.paid_orders), quoteRequests: a.quoteRequests + Number(r.quote_requests) }), { paidOrders: 0, quoteRequests: 0 });
    const matched = campaigns.reduce((a,r) => ({ paidOrders: a.paidOrders + r.paidOrders, quoteRequests: a.quoteRequests + r.quoteRequests }), { paidOrders: 0, quoteRequests: 0 });
    return { ...base, status: 'observed', totals, matched, campaigns, comparison: 'unknown_no_causal_baseline' };
  } catch { return { ...base, status: 'unknown', reason: 'outcomes_unavailable', campaigns: [] }; }
}
export function renderMarketingOutcomes(data) {
  if (!data || data.status !== 'observed') return 'Sales outcomes: unknown — local attribution records unavailable. Revenue, ROAS and quote bookings unknown.';
  const lines = [`Sales outcomes: last ${data.windowDays} days by record creation, paid-or-later order statuses (not payment receipts). Matched tracked campaigns: ${data.matched.paidOrders}/${data.totals.paidOrders} orders; ${data.matched.quoteRequests}/${data.totals.quoteRequests} catering quote requests. Requests are not bookings.`];
  for (const c of data.campaigns.slice(0, 4)) lines.push(`Campaign ${JSON.stringify(c.campaign.slice(0,80))}: ${c.paidOrders} orders, ${c.quoteRequests} quote requests; ${c.comparison === 'unknown_insufficient_sample' ? 'comparison unknown: insufficient sample (<5 recorded outcomes)' : 'descriptive counts only'}.`);
  lines.push('Revenue, ROAS, quote bookings and post/brief sales attribution unknown. No causal winner or conversion-rate claim is supported.');
  return lines.join('\n');
}
