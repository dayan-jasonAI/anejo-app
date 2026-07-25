// Promo codes + influencer affiliate attribution.
//
// Two kinds, one redemption path:
//   'customer'  — issued to a launch-list signup. NON-SHAREABLE: enforced here by requiring the
//                 redeeming session's email to equal bound_email. 10% off / 30 days / 2x points.
//   'affiliate' — a PBC influencer's code. Shareable by design. Their followers get a first-order
//                 perk (free Añejo Fit drink) + 2x points; the partner earns commission_pct.
//
// Everything is server-side: the browser sends only a code string. Percentages, expiry, binding,
// and commission are read from D1 — never trusted from the client.
import { id, now } from './util.js';

const CUSTOMER_DAYS = 30;
const AMBIGUOUS = /[0OIL1]/g;                       // drop look-alikes from generated codes
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // (already excludes the ambiguous set)

export const norm = (c) => String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, '');
const email = (e) => String(e == null ? '' : e).trim().toLowerCase();

function randomSuffix(n = 6) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

/** Issue (or return the existing) 30-day 10%-off + 2x-points code for a launch signup. */
export async function issueCustomerCode(env, { email: to, note } = {}) {
  if (!env || !env.DB) return null;
  const em = email(to);
  if (!em) return null;

  // Idempotent: one active customer code per email — a re-signup returns the same code.
  try {
    const existing = await env.DB
      .prepare("SELECT code, expires_at FROM promo_codes WHERE kind='customer' AND bound_email=? AND status='active' ORDER BY created_at DESC LIMIT 1")
      .bind(em).first();
    if (existing && (!existing.expires_at || existing.expires_at > now())) return existing;
  } catch { /* fall through and mint a new one */ }

  const t = now();
  const code = ('FOUND-' + randomSuffix(6)).replace(AMBIGUOUS, 'X');
  const expires = t + CUSTOMER_DAYS * 86400 * 1000;
  try {
    await env.DB.prepare(
      `INSERT INTO promo_codes (code, kind, bound_email, pct_off, points_mult, expires_at, status, note, created_at)
       VALUES (?,?,?,?,?,?,'active',?,?)`
    ).bind(code, 'customer', em, 10, 2, expires, note || 'launch signup', t).run();
  } catch { return null; }
  return { code, expires_at: expires };
}

/**
 * Evaluate a code for a pending checkout. Pure read — nothing is consumed here.
 * `sessionEmail` is the SIGNED-IN account (null for guests).
 * Returns { ok:false, reason } or { ok:true, ... } with server-computed money.
 */
export async function evaluatePromo(env, { code, sessionEmail, subtotalCents }) {
  if (!env || !env.DB) return { ok: false, reason: 'unavailable' };
  const c = norm(code);
  if (!c) return { ok: false, reason: 'empty' };

  let row;
  try {
    row = await env.DB.prepare('SELECT * FROM promo_codes WHERE code = ?').bind(c).first();
  } catch { return { ok: false, reason: 'unavailable' }; }
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'active') return { ok: false, reason: 'disabled' };

  const t = now();
  if (row.starts_at && t < row.starts_at) return { ok: false, reason: 'not_started' };
  if (row.expires_at && t > row.expires_at) return { ok: false, reason: 'expired' };
  if (row.max_uses != null && (row.uses || 0) >= row.max_uses) return { ok: false, reason: 'exhausted' };

  const em = email(sessionEmail);

  if (row.kind === 'customer') {
    // THE non-shareable rule: only the account it was issued to may redeem it.
    if (!em) return { ok: false, reason: 'signin_required' };
    if (em !== email(row.bound_email)) return { ok: false, reason: 'not_your_code' };
  } else if (row.kind === 'affiliate') {
    // Anti-self-referral: a partner can't earn commission on their own order.
    if (em && row.partner_id) {
      try {
        const p = await env.DB.prepare('SELECT email FROM trainers WHERE id = ?').bind(row.partner_id).first();
        if (p && email(p.email) === em) return { ok: false, reason: 'self_referral' };
      } catch { /* non-fatal */ }
    }
  }

  const sub = Math.max(0, Number(subtotalCents) || 0);
  const discountCents = Math.floor(sub * (Number(row.pct_off) || 0) / 100);

  // First-order perk (free Fit drink) only if this email has never had a paid order.
  let perk = null;
  if (row.perk) {
    let firstOrder = true;
    if (em && row.perk_first_order_only) {
      try {
        const r = await env.DB.prepare(
          "SELECT COUNT(*) n FROM orders WHERE LOWER(TRIM(customer_email))=? AND status IN ('paid','fulfilled')"
        ).bind(em).first();
        firstOrder = !r || !r.n;
      } catch { firstOrder = false; }
    }
    if (firstOrder) perk = row.perk;
  }

  return {
    ok: true,
    code: row.code,
    kind: row.kind,
    pct_off: Number(row.pct_off) || 0,
    discount_cents: discountCents,
    points_mult: Number(row.points_mult) || 1,
    perk,
    partner_id: row.partner_id || null,
    commission_pct: Number(row.commission_pct) || 0,
    expires_at: row.expires_at || null,
  };
}

/** Consume the code for a created order. Idempotent per order (UNIQUE order_id). */
export async function recordRedemption(env, { evaluated, orderId, customerEmail }) {
  if (!env || !env.DB || !evaluated || !evaluated.ok || !orderId) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO promo_redemptions (id, code, order_id, email, discount_cents, points_mult, perk_granted, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id('pr'), evaluated.code, orderId, email(customerEmail) || null,
      evaluated.discount_cents || 0, evaluated.points_mult || 1, evaluated.perk || null, now()).run();
  } catch { return false; }  // UNIQUE(order_id) → already recorded
  try {
    await env.DB.prepare('UPDATE promo_codes SET uses = uses + 1 WHERE code = ?').bind(evaluated.code).run();
  } catch { /* count is advisory */ }
  return true;
}

/**
 * Pay an affiliate partner their commission on a PAID à-la-carte order.
 * Idempotent: rev_share_events PK is derived from the order id.
 * (Subscription commissions keep flowing through the existing invoice path in webhooks/square.js.)
 */
export async function creditAffiliateForOrder(env, { orderId, grossCents }) {
  if (!env || !env.DB || !orderId) return 0;
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT pc.partner_id, pc.commission_pct
         FROM promo_redemptions pr JOIN promo_codes pc ON pc.code = pr.code
        WHERE pr.order_id = ? AND pc.kind = 'affiliate' AND pc.partner_id IS NOT NULL`
    ).bind(orderId).first();
  } catch { return 0; }
  if (!row || !row.partner_id) return 0;

  const gross = Math.max(0, Number(grossCents) || 0);
  const share = Math.round(gross * (Number(row.commission_pct) || 0) / 100);
  if (share <= 0) return 0;

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO rev_share_events (id, trainer_id, order_id, amount_cents, share_cents, occurred_at, payout_status)
       VALUES (?,?,?,?,?,?,'pending')`
    ).bind('rso_' + orderId, row.partner_id, orderId, gross, share, now()).run();
  } catch { return 0; }
  return share;
}
