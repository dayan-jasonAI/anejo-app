// POST /api/subscriptions/manage — a signed-in CLIENT manages their own subscription.
//   { op:'pause' }   → pause billing + stop deliveries (Square pause; status='paused').
//   { op:'resume' }  → resume (Square resume; status='active'; rebuild upcoming orders).
//   { op:'skip' }    → skip the NEXT delivery week: drop that week's orders + skip its charge
//                      (Square one-cycle pause). Deliveries resume automatically the week after.
// Square calls are best-effort; the local state always reflects the member's intent so the
// portal + kitchen update immediately. Mirrors subscriptions/cancel.js auth.
import { json, bad, now, id } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { materializeSubscriptionPrep } from '../../_lib/suborders.js';
import { PLAN_TIERS, isPlanTier, tierWindows, planVariationId } from '../../_lib/plans.js';
import { clampPerBowlCents } from '../../_lib/sizing.js';
import { AVOCADO_ADDON_CENTS } from '../../_lib/bowlspec.js';

// Rescale a bowl_rotation {NAME:count} to a new total bowl count, preserving variety + hitting
// the exact new total (rounding fixed against the largest buckets).
function rescaleRotation(rotObj, newTotal) {
  const entries = Object.entries(rotObj || {}).map(([k, n]) => [k, Math.max(0, Math.floor(Number(n) || 0))]).filter((e) => e[1] > 0);
  const oldTotal = entries.reduce((s, e) => s + e[1], 0);
  if (!oldTotal || !newTotal) return rotObj;
  const scaled = entries.map(([k, n]) => [k, Math.max(0, Math.round(n * newTotal / oldTotal))]);
  let sum = scaled.reduce((s, e) => s + e[1], 0);
  scaled.sort((a, b) => b[1] - a[1]);
  for (let i = 0; sum < newTotal && scaled.length; i++) { scaled[i % scaled.length][1]++; sum++; }
  for (let i = 0; sum > newTotal && scaled.length && i < 5000; i++) { const e = scaled[i % scaled.length]; if (e[1] > 0) { e[1]--; sum--; } }
  const out = {}; scaled.forEach(([k, n]) => { out[k] = n; }); return out;
}

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const dowOf = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const dayNum = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
const addDays = (d, n) => new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10);

async function squareCall(env, sub, action, body) {
  if (!sub.provider_subscription_id || !squareConfigured(env)) return { ok: true, skipped: true };
  try {
    const r = await square(env, `/v2/subscriptions/${sub.provider_subscription_id}/${action}`, { method: 'POST', body: body || {} });
    if (!r.ok) {
      const err = (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail) || `Square ${r.status}`;
      console.log(`subscription ${action} — Square error:`, err, '· sub', sub.id);
    }
    return { ok: !!r.ok };
  } catch (e) { console.log(`subscription ${action} — Square exception:`, e && e.message, '· sub', sub.id); return { ok: false }; }
}

// Best-effort Square plan swap for a tier change. Creates a sized variation at the new weekly
// price when it differs from the catalog tier (Square has no per-subscription price override),
// then SwapPlan. Returns true on success. Local state is updated regardless of this result.
async function swapSquarePlan(env, sub, tierKey, weeklyCents, tierCfg) {
  try {
    const stdVar = planVariationId(env, tierKey);
    if (!stdVar) return false;
    let variationId = stdVar;
    if (weeklyCents !== tierCfg.weeklyCents) {
      let vr = await square(env, `/v2/catalog/object/${stdVar}`);
      const parent = vr.ok && vr.data && vr.data.object && vr.data.object.subscription_plan_variation_data && vr.data.object.subscription_plan_variation_data.subscription_plan_id;
      if (parent) {
        vr = await square(env, '/v2/catalog/object', { method: 'POST', body: { idempotency_key: id('var'), object: { type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#sized', subscription_plan_variation_data: { name: `${tierCfg.label} · sized ${(weeklyCents / 100).toFixed(2)}/wk`, subscription_plan_id: parent, phases: [{ cadence: 'WEEKLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: weeklyCents, currency: 'USD' } } }] } } } });
        if (vr.ok && vr.data && vr.data.catalog_object) variationId = vr.data.catalog_object.id;
      }
    }
    const sr = await square(env, `/v2/subscriptions/${sub.provider_subscription_id}/swap-plan`, { method: 'POST', body: { new_plan_variation_id: variationId } });
    return !!sr.ok;
  } catch (e) { console.log('swap-plan error:', e && e.message, '· sub', sub.id); return false; }
}

export const onRequestPost = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client' || !sess.email) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);
  let b; try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const op = b && b.op;
  if (!['pause', 'resume', 'skip', 'set_windows', 'change_plan'].includes(op)) return bad('Unknown action.');

  const email = String(sess.email).trim().toLowerCase();
  const client = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? ORDER BY updated_at DESC LIMIT 1').bind(email).first();
  if (!client) return json({ error: 'No account found for your sign-in.' }, 404);
  const sub = await env.DB.prepare(
    "SELECT id, provider_subscription_id, status, avocado, plan_id, tier, windows FROM subscriptions WHERE client_id=? AND status NOT IN ('canceled') ORDER BY updated_at DESC LIMIT 1"
  ).bind(client.id).first();
  if (!sub) return json({ error: 'You don’t have an active subscription.' }, 404);
  const t = now();
  const today = etToday(t);

  if (op === 'pause') {
    const sq = await squareCall(env, sub, 'pause', {});
    await env.DB.prepare("UPDATE subscriptions SET status='paused', paused_at=?, updated_at=? WHERE id=?").bind(t, t, sub.id).run();
    // Stop prepping: drop this/next undelivered scheduled orders while paused.
    await env.DB.prepare("DELETE FROM orders WHERE subscription_id=? AND status='paid' AND fulfillment_mode='scheduled' AND delivery_date >= ?").bind(sub.id, today).run();
    return json({ ok: true, status: 'paused', square_ok: sq.ok });
  }

  if (op === 'resume') {
    const sq = await squareCall(env, sub, 'resume', {});
    await env.DB.prepare("UPDATE subscriptions SET status='active', paused_at=NULL, skip_through=NULL, updated_at=? WHERE id=?").bind(t, sub.id).run();
    try { await materializeSubscriptionPrep(env, { subscriptionId: sub.id, horizonDays: 7 }); } catch { /* cron will catch up */ }
    return json({ ok: true, status: 'active', square_ok: sq.ok });
  }

  // Drop this sub's upcoming undelivered scheduled orders, then rebuild from the new settings.
  const rebuild = async () => {
    await env.DB.prepare("DELETE FROM orders WHERE subscription_id=? AND status='paid' AND fulfillment_mode='scheduled' AND delivery_date >= ?").bind(sub.id, today).run();
    try { await materializeSubscriptionPrep(env, { subscriptionId: sub.id, horizonDays: 7 }); } catch { /* cron catches up */ }
  };

  if (op === 'set_windows') {
    const tierCfg = PLAN_TIERS[sub.tier] || null;
    let windows;
    if (tierCfg && tierCfg.chooseWindow) {
      const w = String((b && b.windows) || '').trim().toLowerCase();
      if (w !== 'lunch' && w !== 'dinner') return bad('Pick lunch or dinner.');
      windows = w;
    } else {
      windows = 'lunch,dinner'; // 2-bowl tiers always get both — nothing to change
    }
    await env.DB.prepare('UPDATE subscriptions SET windows=?, updated_at=? WHERE id=?').bind(windows, t, sub.id).run();
    await rebuild();
    return json({ ok: true, windows });
  }

  if (op === 'change_plan') {
    const newTier = String((b && b.tier) || '').trim();
    if (!isPlanTier(newTier)) return bad('Unknown plan tier.');
    const tierCfg = PLAN_TIERS[newTier];
    let plan = null;
    try { if (sub.plan_id) plan = await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(sub.plan_id).first(); } catch { /* none */ }
    const avocado = sub.avocado === 1 || sub.avocado === true;
    const perBowl = (plan && plan.per_bowl_price_cents != null) ? clampPerBowlCents(plan.per_bowl_price_cents) : null;
    let weeklyCents = perBowl != null ? perBowl * tierCfg.bowls : tierCfg.weeklyCents;
    if (avocado) weeklyCents += AVOCADO_ADDON_CENTS * tierCfg.bowls;
    const windows = tierWindows(newTier, (sub.windows || '').split(',')[0]);
    let newRotation = null;
    if (plan && plan.bowl_rotation) { try { newRotation = JSON.stringify(rescaleRotation(JSON.parse(plan.bowl_rotation), tierCfg.bowls)); } catch { /* keep */ } }

    await env.DB.prepare('UPDATE subscriptions SET tier=?, windows=?, weekly_amount_cents=?, updated_at=? WHERE id=?').bind(newTier, windows, weeklyCents, t, sub.id).run();
    if (plan) { try { await env.DB.prepare('UPDATE plans SET meal_plan_tier=?, weekly_bowl_count=?, bowl_rotation=COALESCE(?,bowl_rotation), updated_at=? WHERE id=?').bind(newTier, tierCfg.bowls, newRotation, t, plan.id).run(); } catch { /* tolerate */ } }
    await rebuild();
    // Best-effort billing swap (engages once Square is configured); local change is already live.
    let square_ok = null;
    if (sub.provider_subscription_id && squareConfigured(env)) square_ok = await swapSquarePlan(env, sub, newTier, weeklyCents, tierCfg);
    return json({ ok: true, tier: newTier, windows, weekly_amount_cents: weeklyCents, square_ok });
  }

  // op === 'skip' — skip the next delivery week (its bowls + its charge).
  let skipMonday = today;
  do { skipMonday = addDays(skipMonday, 1); } while (dowOf(skipMonday) !== 1); // first Monday AFTER today
  const skipSaturday = addDays(skipMonday, 5);
  await env.DB.prepare('UPDATE subscriptions SET skip_through=?, updated_at=? WHERE id=?').bind(skipSaturday, t, sub.id).run();
  // Remove that week's already-materialized (undelivered) orders so the kitchen won't prep them.
  await env.DB.prepare(
    "DELETE FROM orders WHERE subscription_id=? AND status='paid' AND fulfillment_mode='scheduled' AND delivery_date BETWEEN ? AND ?"
  ).bind(sub.id, skipMonday, skipSaturday).run();
  // Skip the charge for that cycle (best-effort; Square auto-resumes after one cycle).
  const sq = await squareCall(env, sub, 'pause', { pause_cycle_duration: 1 });
  return json({ ok: true, status: 'active', skipped_week: skipMonday, resumes: addDays(skipSaturday, 2), square_ok: sq.ok });
};
