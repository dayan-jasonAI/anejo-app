// GET /api/order-availability — public, read-only snapshot the /order page uses to render
// on-demand state: whether the ordering window is open right now (ET) and how many of each
// bowl are still available today against the daily production cap. Checkout re-checks both,
// so this is display-only and safe to cache for a few seconds at most.
import { json } from '../_lib/util.js';
import { loadOrderingSettings, onDemandConfig, windowState, remainingByBowl, BOWL_IDS } from '../_lib/ondemand.js';
import { loadOperating, deliveryDays, describe, tempOverride } from '../_lib/operating.js';

export const onRequestGet = async ({ env }) => {
  // Owner overrides from D1 (scheduled-only, window, cap) with env as the fallback.
  const settings = await loadOrderingSettings(env);
  const { limit } = onDemandConfig(env, settings);
  const w = windowState(env, new Date(), settings);
  let remaining;
  try {
    remaining = await remainingByBowl(env, w.dateStr, limit);
  } catch {
    remaining = {};
    for (const id of BOWL_IDS) remaining[id] = limit;
  }
  // Operating rules the storefront needs to render the scheduled flow honestly: which weekdays it
  // may offer, the order-by deadline, the window labels, and any dates the owner closed. These
  // were hardcoded in order.html (a literal "no Sunday" check and window times in an <option>),
  // so the page could advertise a day the kitchen does not run.
  const ops = await loadOperating(env);
  const temp = tempOverride(ops);
  const d = describe(ops);

  return json(
    { onDemand: { open: w.open, openHour: w.openHour, closeHour: w.closeHour, closeMinute: w.closeMinute, limit, remaining, date: w.dateStr },
      scheduled: {
        days: deliveryDays(ops),
        orderByHour: Number(ops.order_by_hour) || 18,
        closedDates: String(ops.closed_dates || '').split(',').map((x) => x.trim()).filter(Boolean),
        windows: {
          lunch: { start: ops.lunch_start, end: ops.lunch_end },
          dinner: { start: ops.dinner_start, end: ops.dinner_end },
        },
        areaLabel: ops.area_label || '',
        summary: { orderBy: d.order_by, lunch: d.lunch, dinner: d.dinner },
      },
      // Only ever surfaced when active, and it expires on its own.
      temporary: temp.active ? { until: temp.until, note: temp.note } : null },
    200,
    { 'Cache-Control': 'no-store' }
  );
};
