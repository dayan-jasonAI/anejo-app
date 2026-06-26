// Añejo Rewards — points + "Longevity" tiers. _lib is not routed.
// Points are EMAIL-keyed (matches the CRM's unifying key). Earn = points per $1 of merchandise
// (subtotal) × tier multiplier. Tier is DERIVED from lifetime spend at read time (nothing stored).
// Rates/thresholds/perks are OWNER-TUNABLE via KV (getRewardsConfig/setRewardsConfig); the
// constants below are the safe defaults used when no config has been saved.
import { id, now } from './util.js';

// Default ladder (cents thresholds) — used when KV config is absent.
export const TIERS = [
  { key: 'vital',    name: 'Vital',    min: 0,      mult: 1.0 },
  { key: 'thriving', name: 'Thriving', min: 25000,  mult: 1.25 }, // $250
  { key: 'legend',   name: 'Legend',   min: 60000,  mult: 1.5 },  // $600
  { key: 'immortal', name: 'Immortal', min: 150000, mult: 2.0 },  // $1,500 — the "black card"
];
export const POINT_CENTS = 5;                 // default 20 pts = $1
export const TIER_ORDER = ['vital', 'thriving', 'legend', 'immortal'];

export const DEFAULT_CONFIG = {
  earn_per_dollar: 1,                          // points per $1 subtotal
  redeem_per_dollar: 20,                       // points to redeem $1 of discount
  thresholds: { thriving: 25000, legend: 60000, immortal: 150000 },  // cents lifetime spend
  mults: { thriving: 1.25, legend: 1.5, immortal: 2.0 },
  free_delivery_min_tier: 'thriving',          // 'off' | 'thriving' | 'legend' | 'immortal'
};
const RWD_KEY = 'rewards:config';

const key = (e) => String(e == null ? '' : e).trim().toLowerCase();
const numOr = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const intOr = (v, d, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// ---- Owner-tunable config (KV-backed, validated, defaults-merged) ----
export async function getRewardsConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(RWD_KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  const th = kv.thresholds || {}, mu = kv.mults || {};
  const fd = kv.free_delivery_min_tier;
  return {
    earn_per_dollar: numOr(kv.earn_per_dollar, DEFAULT_CONFIG.earn_per_dollar, 0.1, 100),
    redeem_per_dollar: numOr(kv.redeem_per_dollar, DEFAULT_CONFIG.redeem_per_dollar, 1, 1000),
    thresholds: {
      thriving: intOr(th.thriving, DEFAULT_CONFIG.thresholds.thriving, 0, 100000000),
      legend: intOr(th.legend, DEFAULT_CONFIG.thresholds.legend, 0, 100000000),
      immortal: intOr(th.immortal, DEFAULT_CONFIG.thresholds.immortal, 0, 100000000),
    },
    mults: {
      thriving: numOr(mu.thriving, DEFAULT_CONFIG.mults.thriving, 1, 10),
      legend: numOr(mu.legend, DEFAULT_CONFIG.mults.legend, 1, 10),
      immortal: numOr(mu.immortal, DEFAULT_CONFIG.mults.immortal, 1, 10),
    },
    free_delivery_min_tier: (fd === 'off' || TIER_ORDER.includes(fd)) ? fd : DEFAULT_CONFIG.free_delivery_min_tier,
  };
}

export async function setRewardsConfig(env, patch) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const cur = await getRewardsConfig(env);
  const p = patch || {}, pt = p.thresholds || {}, pm = p.mults || {};
  const next = {
    earn_per_dollar: p.earn_per_dollar != null ? numOr(p.earn_per_dollar, cur.earn_per_dollar, 0.1, 100) : cur.earn_per_dollar,
    redeem_per_dollar: p.redeem_per_dollar != null ? numOr(p.redeem_per_dollar, cur.redeem_per_dollar, 1, 1000) : cur.redeem_per_dollar,
    thresholds: {
      thriving: pt.thriving != null ? intOr(pt.thriving, cur.thresholds.thriving, 0, 100000000) : cur.thresholds.thriving,
      legend: pt.legend != null ? intOr(pt.legend, cur.thresholds.legend, 0, 100000000) : cur.thresholds.legend,
      immortal: pt.immortal != null ? intOr(pt.immortal, cur.thresholds.immortal, 0, 100000000) : cur.thresholds.immortal,
    },
    mults: {
      thriving: pm.thriving != null ? numOr(pm.thriving, cur.mults.thriving, 1, 10) : cur.mults.thriving,
      legend: pm.legend != null ? numOr(pm.legend, cur.mults.legend, 1, 10) : cur.mults.legend,
      immortal: pm.immortal != null ? numOr(pm.immortal, cur.mults.immortal, 1, 10) : cur.mults.immortal,
    },
    free_delivery_min_tier: (p.free_delivery_min_tier === 'off' || TIER_ORDER.includes(p.free_delivery_min_tier)) ? p.free_delivery_min_tier : cur.free_delivery_min_tier,
  };
  try { await env.SESSIONS.put(RWD_KEY, JSON.stringify(next)); return { ok: true, config: next }; }
  catch { return { ok: false, error: 'Could not save rewards settings.' }; }
}

export function tiersFromConfig(cfg) {
  if (!cfg) return TIERS;
  return [
    { key: 'vital',    name: 'Vital',    min: 0,                    mult: 1.0 },
    { key: 'thriving', name: 'Thriving', min: cfg.thresholds.thriving, mult: cfg.mults.thriving },
    { key: 'legend',   name: 'Legend',   min: cfg.thresholds.legend,   mult: cfg.mults.legend },
    { key: 'immortal', name: 'Immortal', min: cfg.thresholds.immortal, mult: cfg.mults.immortal },
  ];
}
const pointCents = (cfg) => (cfg ? 100 / cfg.redeem_per_dollar : POINT_CENTS);

export function tierForSpend(cents, cfg) {
  const tiers = tiersFromConfig(cfg);
  const c = Math.max(0, Number(cents) || 0);
  let t = tiers[0];
  for (const x of tiers) if (c >= x.min) t = x;
  return t;
}

export function nextTier(cents, cfg) {
  const tiers = tiersFromConfig(cfg);
  const c = Math.max(0, Number(cents) || 0);
  for (const x of tiers) if (c < x.min) return x;
  return null;
}

// Award loyalty points when an order becomes paid. Idempotent: the UNIQUE index on
// (order_id, reason='earn') means duplicate calls (webhook retries) silently no-op.
// Multiplier is based on PRIOR lifetime spend so an order can't inflate its own rate.
export async function awardOrderPoints(env, { orderId, email, subtotalCents }) {
  if (!env.DB || !orderId) return 0;
  const em = key(email);
  if (!em) return 0;
  const cfg = await getRewardsConfig(env);

  let priorCents = 0;
  try {
    const r = await env.DB.prepare(
      "SELECT COALESCE(SUM(total_estimate_cents),0) AS c FROM orders " +
      "WHERE LOWER(TRIM(customer_email))=? AND status IN ('paid','fulfilled') AND id<>?"
    ).bind(em, orderId).first();
    priorCents = (r && r.c) || 0;
  } catch { priorCents = 0; }

  const tier = tierForSpend(priorCents, cfg);
  const dollars = Math.max(0, Math.round((Number(subtotalCents) || 0) / 100));
  const pts = Math.round(dollars * cfg.earn_per_dollar * tier.mult);
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

// ---- Redemption math (cfg-aware; default 20 pts = $1). ----
export function redeemValueCents(points, cfg) {
  return Math.max(0, Math.floor(Math.floor(Number(points) || 0) * pointCents(cfg)));
}
export function maxRedeemCents(balancePoints, subtotalCents, cfg) {
  return Math.max(0, Math.min(redeemValueCents(balancePoints, cfg), Math.max(0, Number(subtotalCents) || 0)));
}
export function pointsForCents(cents, cfg) {
  return Math.ceil(Math.max(0, Number(cents) || 0) / pointCents(cfg));
}

// Deduct redeemed points when an order is paid. Idempotent via unique(order_id,'redeem').
export async function redeemOrderPoints(env, { orderId, email, points }) {
  if (!env.DB || !orderId) return 0;
  const em = key(email);
  const pts = Math.floor(Number(points) || 0);
  if (!em || pts <= 0) return 0;
  let clientId = null;
  try {
    const c = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? LIMIT 1').bind(em).first();
    clientId = c ? c.id : null;
  } catch { clientId = null; }
  try {
    await env.DB.prepare(
      'INSERT INTO points_ledger (id, email, client_id, delta, reason, order_id, note, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id('pt'), em, clientId, -pts, 'redeem', orderId, 'Redeemed at checkout', now()).run();
  } catch { return 0; } // unique(order_id,'redeem') → already deducted
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

// One call for display: balance + tier + progress + perks. Loads owner config.
export async function rewardsSummary(env, email, knownSpendCents) {
  const em = key(email);
  const cfg = await getRewardsConfig(env);
  const spend = (knownSpendCents != null) ? Math.max(0, Number(knownSpendCents) || 0) : await lifetimeSpendCents(env, em);
  const balance = await pointsBalance(env, em);
  const tier = tierForSpend(spend, cfg);
  const next = nextTier(spend, cfg);
  const fd = cfg.free_delivery_min_tier;
  const free_delivery = fd !== 'off' && TIER_ORDER.indexOf(tier.key) >= TIER_ORDER.indexOf(fd);
  return {
    points: balance,
    tier: tier.key,
    tier_name: tier.name,
    multiplier: tier.mult,
    lifetime_spend_cents: spend,
    next_tier: next ? next.name : null,
    next_tier_at_cents: next ? next.min : null,
    to_next_cents: next ? Math.max(0, next.min - spend) : 0,
    free_delivery,
    redeem_point_cents: pointCents(cfg),
  };
}
