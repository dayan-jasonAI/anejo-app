// Añejo Rewards — points + "Longevity" tiers. _lib is not routed.
// Points are EMAIL-keyed (matches the CRM's unifying key); 1 point per $1 of merchandise
// (subtotal) spent, multiplied by the customer's tier. Tier is DERIVED from lifetime spend
// (paid+fulfilled orders) at read time — nothing about the tier is stored, so the thresholds
// and multipliers below can be retuned anytime without a migration.
import { id, now } from './util.js';

// Lifetime-spend thresholds in CENTS → tier + earn multiplier. Keep ascending.
export const TIERS = [
  { key: 'vital',    name: 'Vital',    min: 0,      mult: 1.0 },
  { key: 'thriving', name: 'Thriving', min: 25000,  mult: 1.25 }, // $250
  { key: 'legend',   name: 'Legend',   min: 60000,  mult: 1.5 },  // $600
  { key: 'immortal', name: 'Immortal', min: 150000, mult: 2.0 },  // $1,500 — the "black card"
];

const key = (e) => String(e == null ? '' : e).trim().toLowerCase();

export function tierForSpend(cents) {
  const c = Math.max(0, Number(cents) || 0);
  let t = TIERS[0];
  for (const x of TIERS) if (c >= x.min) t = x;
  return t;
}

export function nextTier(cents) {
  const c = Math.max(0, Number(cents) || 0);
  for (const x of TIERS) if (c < x.min) return x;
  return null;
}

// Award loyalty points when an order becomes paid. Idempotent: the UNIQUE index on
// (order_id, reason='earn') means duplicate calls (webhook retries) silently no-op.
// Multiplier is based on PRIOR lifetime spend so an order can't inflate its own rate.
export async function awardOrderPoints(env, { orderId, email, subtotalCents }) {
  if (!env.DB || !orderId) return 0;
  const em = key(email);
  if (!em) return 0;

  let priorCents = 0;
  try {
    const r = await env.DB.prepare(
      "SELECT COALESCE(SUM(total_estimate_cents),0) AS c FROM orders " +
      "WHERE LOWER(TRIM(customer_email))=? AND status IN ('paid','fulfilled') AND id<>?"
    ).bind(em, orderId).first();
    priorCents = (r && r.c) || 0;
  } catch { priorCents = 0; }

  const tier = tierForSpend(priorCents);
  const dollars = Math.max(0, Math.round((Number(subtotalCents) || 0) / 100));
  const pts = Math.round(dollars * tier.mult);
  if (pts <= 0) return 0;

  let clientId = null;
  try {
    const c = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? LIMIT 1').bind(em).first();
    clientId = c ? c.id : null;
  } catch { clientId = null; }

  try {
    await env.DB.prepare(
      'INSERT INTO points_ledger (id, email, client_id, delta, reason, order_id, note, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id('pt'), em, clientId, pts, 'earn', orderId, tier.name + ' x' + tier.mult, now()).run();
  } catch { return 0; } // unique(order_id,'earn') violation → already awarded
  return pts;
}

export async function pointsBalance(env, email) {
  const em = key(email);
  if (!em || !env.DB) return 0;
  try {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(delta),0) AS b FROM points_ledger WHERE email=?').bind(em).first();
    return (r && r.b) || 0;
  } catch { return 0; }
}

export async function lifetimeSpendCents(env, email) {
  const em = key(email);
  if (!em || !env.DB) return 0;
  try {
    const r = await env.DB.prepare(
      "SELECT COALESCE(SUM(total_estimate_cents),0) AS c FROM orders " +
      "WHERE LOWER(TRIM(customer_email))=? AND status IN ('paid','fulfilled')"
    ).bind(em).first();
    return (r && r.c) || 0;
  } catch { return 0; }
}

// One call for display: balance + tier + progress to next tier.
// Pass knownSpendCents when the caller already aggregated it (avoids a second query).
export async function rewardsSummary(env, email, knownSpendCents) {
  const em = key(email);
  const spend = (knownSpendCents != null) ? Math.max(0, Number(knownSpendCents) || 0) : await lifetimeSpendCents(env, em);
  const balance = await pointsBalance(env, em);
  const tier = tierForSpend(spend);
  const next = nextTier(spend);
  return {
    points: balance,
    tier: tier.key,
    tier_name: tier.name,
    multiplier: tier.mult,
    lifetime_spend_cents: spend,
    next_tier: next ? next.name : null,
    next_tier_at_cents: next ? next.min : null,
    to_next_cents: next ? Math.max(0, next.min - spend) : 0,
  };
}
