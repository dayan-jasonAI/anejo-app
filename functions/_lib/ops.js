// Añejo Ops — demand forecast + production plan engine. Numbers are DETERMINISTIC and
// explainable (known subscription demand + a same-weekday moving average for on-demand);
// Claude is reserved for narrative elsewhere. Files under _lib are NOT routed. Never throws.
import { id, now, parseJson, toJson } from './hub.js';

const ONDEMAND_LOOKBACK_WEEKS = 6; // same-weekday history window for the on-demand estimate
const ONDEMAND_BUFFER_PCT = 15;    // safety buffer on the (uncertain) on-demand prep component
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayNum(d) { return Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000); }
function addDays(d, n) { return new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10); }
function dow(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }
export function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

// Tally bowls in an order's items JSON into `mix`; returns the count.
function tallyItems(itemsJson, mix) {
  const items = parseJson(itemsJson, []) || [];
  let n = 0;
  for (const it of items) {
    const q = Math.max(1, Math.floor(Number(it && it.qty) || 1));
    const name = (it && (it.name || it.id)) || 'Item';
    mix[name] = (mix[name] || 0) + q;
    n += q;
  }
  return n;
}
function mergeMix(a, b) { const m = { ...(a || {}) }; for (const k of Object.keys(b || {})) m[k] = (m[k] || 0) + b[k]; return m; }

// Known subscription demand for a date (the rolling materializer already created these orders).
async function subscriptionDemand(env, date) {
  const mix = {}; let total = 0, lunch = 0, dinner = 0;
  try {
    const { results } = await env.DB.prepare(
      "SELECT items, delivery_window FROM orders WHERE subscription_id IS NOT NULL AND delivery_date=? AND status NOT IN ('canceled')"
    ).bind(date).all();
    for (const o of results || []) {
      const n = tallyItems(o.items, mix);
      total += n;
      if (o.delivery_window === 'dinner') dinner += n; else lunch += n;
    }
  } catch { /* none */ }
  return { total, lunch, dinner, mix };
}

// Predicted on-demand demand: average of the same weekday over the last N weeks.
async function ondemandPrediction(env, date) {
  const targetDow = dow(date);
  const mixSum = {}; let totalSum = 0, lunchSum = 0, dinnerSum = 0;
  const byDate = new Map();
  try {
    const since = addDays(date, -7 * ONDEMAND_LOOKBACK_WEEKS - 1);
    const { results } = await env.DB.prepare(
      "SELECT delivery_date, delivery_window, items FROM orders WHERE subscription_id IS NULL AND delivery_date IS NOT NULL AND delivery_date < ? AND delivery_date >= ? AND status NOT IN ('canceled','pending')"
    ).bind(date, since).all();
    for (const o of results || []) {
      if (dow(o.delivery_date) !== targetDow) continue;
      if (!byDate.has(o.delivery_date)) byDate.set(o.delivery_date, []);
      byDate.get(o.delivery_date).push(o);
    }
  } catch { /* none */ }
  const samples = byDate.size;
  if (!samples) return { total: 0, lunch: 0, dinner: 0, mix: {}, samples: 0 };
  for (const [, rows] of byDate) for (const o of rows) {
    const n = tallyItems(o.items, mixSum);
    totalSum += n;
    if (o.delivery_window === 'dinner') dinnerSum += n; else lunchSum += n;
  }
  const mix = {};
  for (const k of Object.keys(mixSum)) mix[k] = Math.round(mixSum[k] / samples);
  return { total: Math.round(totalSum / samples), lunch: Math.round(lunchSum / samples), dinner: Math.round(dinnerSum / samples), mix, samples };
}

// Compute (not persist) the forecast for a single date.
export async function computeForecast(env, date) {
  const sub = await subscriptionDemand(env, date);
  const od = await ondemandPrediction(env, date);
  const total = sub.total + od.total;
  const subShare = total > 0 ? sub.total / total : 1;
  const dataDepth = Math.min(od.samples / ONDEMAND_LOOKBACK_WEEKS, 1);
  // Known subscriptions anchor confidence; on-demand history refines the rest.
  const confidence = Math.round(Math.max(0.4, Math.min(0.95, 0.5 + 0.4 * subShare + 0.1 * dataDepth)) * 100) / 100;
  const drivers = `${sub.total} subscription bowls locked in (${Math.round(subShare * 100)}% of total). On-demand est. ${od.total} from ${od.samples} prior ${DOW[dow(date)]}${od.samples === 1 ? '' : 's'}.`;
  return {
    forecast_date: date, total_bowls: total, subscription_bowls: sub.total, ondemand_bowls: od.total,
    lunch_bowls: sub.lunch + od.lunch, dinner_bowls: sub.dinner + od.dinner,
    bowl_mix: mergeMix(sub.mix, od.mix), confidence, drivers, _od_mix: od.mix,
  };
}

// Run + persist the next-day forecast (and a 7-day total). `date` defaults to tomorrow (ET).
export async function runDemandForecast(env, { date, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, reason: 'no_db' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const today = etToday(t);
  const target = date || addDays(today, 1);

  const f = await computeForecast(env, target);
  const fid = id('fc');
  try {
    await env.DB.prepare(
      'INSERT INTO forecasts (id, forecast_date, horizon, total_bowls, subscription_bowls, ondemand_bowls, lunch_bowls, dinner_bowls, bowl_mix, confidence, drivers, generated_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(fid, target, 'next_day', f.total_bowls, f.subscription_bowls, f.ondemand_bowls, f.lunch_bowls, f.dinner_bowls, toJson(f.bowl_mix), f.confidence, f.drivers, t, t).run();
  } catch { /* persist best-effort */ }

  let weekTotal = 0, weekSub = 0, weekOd = 0, weekMix = {};
  for (let i = 1; i <= 7; i++) {
    const wf = await computeForecast(env, addDays(today, i));
    weekTotal += wf.total_bowls; weekSub += wf.subscription_bowls; weekOd += wf.ondemand_bowls; weekMix = mergeMix(weekMix, wf.bowl_mix);
  }
  try {
    await env.DB.prepare(
      'INSERT INTO forecasts (id, forecast_date, horizon, total_bowls, subscription_bowls, ondemand_bowls, lunch_bowls, dinner_bowls, bowl_mix, confidence, drivers, generated_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id('fc'), addDays(today, 7), 'week', weekTotal, weekSub, weekOd, null, null, toJson(weekMix), null, `Next 7 days: ${weekSub} subscription + ${weekOd} predicted on-demand bowls.`, t, t).run();
  } catch { /* best-effort */ }

  return { ok: true, forecast_id: fid, date: target, forecast: f, week: { total: weekTotal, subscription: weekSub, ondemand: weekOd, mix: weekMix } };
}

// Convert a forecast into a kitchen prep sheet (per-bowl counts) with a safety buffer on the
// predicted on-demand component. Persists a prep_plans row.
export async function runProductionPlan(env, { date, forecast, nowMs } = {}) {
  if (!env || !env.DB) return { ok: false, reason: 'no_db' };
  const t = typeof nowMs === 'number' ? nowMs : now();
  const f = forecast || await computeForecast(env, date);
  const counts = { ...(f.bowl_mix || {}) };
  const odMix = f._od_mix || {};
  for (const k of Object.keys(odMix)) counts[k] = (counts[k] || 0) - odMix[k] + Math.ceil(odMix[k] * (1 + ONDEMAND_BUFFER_PCT / 100));
  let total = 0; for (const k of Object.keys(counts)) total += counts[k];
  const pid = id('pp');
  try {
    await env.DB.prepare(
      'INSERT INTO prep_plans (id, plan_date, horizon, forecast_id, bowl_counts, total_bowls, buffer_pct, notes, generated_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(pid, f.forecast_date, 'next_day', null, toJson(counts), total, ONDEMAND_BUFFER_PCT, `${ONDEMAND_BUFFER_PCT}% buffer applied to the on-demand estimate.`, t, t).run();
  } catch { /* best-effort */ }
  return { ok: true, prep_plan_id: pid, plan_date: f.forecast_date, bowl_counts: counts, total_bowls: total, buffer_pct: ONDEMAND_BUFFER_PCT };
}
