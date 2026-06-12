// GET /api/order-availability — public, read-only snapshot the /order page uses to render
// on-demand state: whether the ordering window is open right now (ET) and how many of each
// bowl are still available today against the daily production cap. Checkout re-checks both,
// so this is display-only and safe to cache for a few seconds at most.
import { json } from '../_lib/util.js';
import { onDemandConfig, windowState, remainingByBowl, BOWL_IDS } from '../_lib/ondemand.js';

export const onRequestGet = async ({ env }) => {
  const { limit } = onDemandConfig(env);
  const w = windowState(env);
  let remaining;
  try {
    remaining = await remainingByBowl(env, w.dateStr, limit);
  } catch {
    remaining = {};
    for (const id of BOWL_IDS) remaining[id] = limit;
  }
  return json(
    { onDemand: { open: w.open, openHour: w.openHour, closeHour: w.closeHour, limit, remaining, date: w.dateStr } },
    200,
    { 'Cache-Control': 'no-store' }
  );
};
