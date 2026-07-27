// Abandoned-checkout sweep.
//
// checkout.js writes the orders row BEFORE the customer pays — it has to, because the row is what
// holds same-day production capacity while they are on Square's hosted page. When someone opens
// checkout and walks away, that row stays `pending` forever, sitting in the order list looking
// exactly like a real order awaiting action. That is not cosmetic: an owner scanning the list
// cannot tell "customer paid and we missed it" from "customer never paid", and the safe assumption
// (someone may be owed food) is the expensive one.
//
// So after a grace window we relabel those rows `abandoned`. THREE SAFETY RULES, all load-bearing:
//
//   1. `status='pending'` ONLY. A paid/prep/ready/fulfilled/canceled order is never touched.
//   2. `square_order_id IS NOT NULL` and not a `sub_` synthetic. A NULL id is a manual counter sale
//      the owner entered by hand (orders.js) and may legitimately sit pending; a `sub_` id is a
//      subscription delivery whose money lives on the weekly invoice, not on a checkout.
//   3. The grace window is long. Square webhooks are usually seconds, but a retry after an outage
//      can be far later, and marking a genuinely-paid order abandoned is the failure that matters.
//
// This is a LABEL, not a decision. It never touches money and never cancels anything in Square.
// The webhook accepts `abandoned` alongside `pending`/`canceled`, so a late payment still flips the
// order to paid and raises the critical alert — the sweep can be wrong and the money path still
// self-heals. That property is why this is safe to run automatically.

const HOUR = 3600000;

// Two hours. Well past any normal webhook delivery, short enough that the list is honest the same
// day. Override with ABANDON_AFTER_HOURS without a deploy if real traffic argues for a different
// number.
export const DEFAULT_GRACE_HOURS = 2;

export function graceMs(env) {
  const raw = Number(env && env.ABANDON_AFTER_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GRACE_HOURS;
  return hours * HOUR;
}

/**
 * Relabel stale unpaid checkouts. Returns the number of rows changed (0 on any failure — this is
 * housekeeping and must never break the page that called it).
 */
export async function sweepAbandoned(env, nowMs = Date.now()) {
  if (!env || !env.DB) return 0;
  const cutoff = nowMs - graceMs(env);
  try {
    const r = await env.DB.prepare(
      `UPDATE orders SET status = 'abandoned', updated_at = ?
        WHERE status = 'pending'
          AND square_order_id IS NOT NULL
          AND square_order_id NOT LIKE 'sub_%'
          AND created_at < ?`
    ).bind(nowMs, cutoff).run();
    return (r && r.meta && r.meta.changes) || 0;
  } catch {
    return 0;
  }
}
