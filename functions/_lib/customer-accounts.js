// Canonical email-keyed customer profile. Calling this does NOT authenticate anyone, create a
// meal plan, consent to marketing, or award rewards. Only a verified magic link creates a session.
import { id, isEmail, normalizePhone } from './util.js';
import { getRewardsConfig, tierForSpend, nextTier, TIER_ORDER } from './rewards.js';

const emailKey = (email) => String(email || '').trim().toLowerCase();
const short = (value, max) => String(value || '').trim().slice(0, max) || null;

export async function ensureCustomerAccount(env, { email, name, phone, source = 'verified_signin' } = {}) {
  const em = emailKey(email);
  if (!env?.DB || !isEmail(em)) return null;
  const time = Date.now();
  await env.DB.prepare(
    `INSERT INTO customer_accounts (id,email,name,phone,source,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
       name=COALESCE(NULLIF(customer_accounts.name,''),excluded.name),
       phone=COALESCE(NULLIF(customer_accounts.phone,''),excluded.phone),
       updated_at=MAX(customer_accounts.updated_at,excluded.updated_at)`
  ).bind(id('ca'), em, short(name, 160), normalizePhone(phone), short(source, 40) || 'verified_signin', time, time).run();
  return customerAccount(env, em);
}

export async function customerAccount(env, email) {
  const em = emailKey(email);
  if (!env?.DB || !isEmail(em)) return null;
  return env.DB.prepare('SELECT id,email,name,phone,created_at FROM customer_accounts WHERE email=?').bind(em).first();
}

// Payment webhook integration: derives identity from the saved quote, never a payer/browser
// supplied email. Safe to call on a retry after the payment state is already durable.
export async function ensureCateringCustomerAccount(env, quoteId) {
  if (!env?.DB || !quoteId) return null;
  const quote = await env.DB.prepare(
    "SELECT customer_email,customer_name,customer_phone FROM catering_quotes WHERE id=? AND deposit_status='paid'"
  ).bind(quoteId).first();
  if (!quote) return null;
  return ensureCustomerAccount(env, { email: quote.customer_email, name: quote.customer_name,
    phone: quote.customer_phone, source: 'catering_payment' });
}

// Account-facing rewards must not turn a storage outage into a factual "0 points" or a lower
// tier. Read the recorded ledger and configured rules once; let failures reach the account UI.
// This is a display projection only. It never awards points for catering or changes earn rules.
export async function customerAccountRewards(env, email) {
  const em = emailKey(email);
  const rawConfig = env.SESSIONS ? await env.SESSIONS.get('rewards:config') : null;
  if (rawConfig) {
    const parsed = JSON.parse(rawConfig);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Rewards settings unavailable');
  }
  const cfg = await getRewardsConfig({ SESSIONS: { get: async () => rawConfig } });
  const totals = await env.DB.prepare(`SELECT
    (SELECT COALESCE(SUM(delta),0) FROM points_ledger WHERE email=?) AS points,
    (SELECT COALESCE(SUM(total_estimate_cents),0) FROM orders
      WHERE LOWER(TRIM(customer_email))=? AND status IN ('paid','prep','ready','fulfilled')) AS spend`
  ).bind(em, em).first();
  if (!totals || !Number.isFinite(Number(totals.points)) || !Number.isFinite(Number(totals.spend))) throw new Error('Rewards balance unavailable');
  const ledger = await env.DB.prepare(
    'SELECT delta,reason,created_at FROM points_ledger WHERE email=? ORDER BY created_at DESC LIMIT 30'
  ).bind(em).all();
  if (!Array.isArray(ledger.results)) throw new Error('Rewards activity unavailable');
  const spend = Math.max(0, Number(totals.spend));
  const tier = tierForSpend(spend, cfg), next = nextTier(spend, cfg);
  return {
    summary: { points: Number(totals.points), tier: tier.key, tier_name: tier.name, multiplier: tier.mult,
      lifetime_spend_cents: spend, next_tier: next ? next.name : null, next_tier_at_cents: next ? next.min : null,
      to_next_cents: next ? Math.max(0, next.min - spend) : 0,
      free_delivery: cfg.free_delivery_min_tier !== 'off' && TIER_ORDER.indexOf(tier.key) >= TIER_ORDER.indexOf(cfg.free_delivery_min_tier),
      redeem_point_cents: 100 / cfg.redeem_per_dollar },
    activity: ledger.results,
  };
}
