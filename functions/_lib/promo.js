// Promo codes + influencer affiliate attribution.
//
// Two kinds, one redemption path:
//   'customer'  — the Founding Legacy Member benefit, issued on launch-list signup: 2x rewards
//                 points FOR LIFE (no % discount, no expiry). NON-SHAREABLE: enforced here by
//                 requiring the redeeming session's email to equal bound_email. Auto-applies.
//   'affiliate' — a PBC influencer's code. Shareable by design. Their followers get a first-order
//                 perk (free Añejo Fit drink) + 2x points; the partner earns commission_pct.
//
// Everything is server-side: the browser sends only a code string. Percentages, expiry, binding,
// and commission are read from D1 — never trusted from the client.
import { id, now } from './util.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // (already excludes the ambiguous set)

// Partner payout: monthly cash, or take it as Añejo credit at 1.5x face value. The credit option
// preserves cash (it costs ~COGS, not dollars) and most nano-creators prefer the bigger number.
export const CREDIT_MULTIPLIER = 1.5;
export function payoutOptions(shareCents) {
  const c = Math.max(0, Math.round(Number(shareCents) || 0));
  return { cash_cents: c, credit_cents: Math.round(c * CREDIT_MULTIPLIER) };
}

export const norm = (c) => String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, '');
const email = (e) => String(e == null ? '' : e).trim().toLowerCase();
// Last 10 digits — normalises +1/(561)/dashes so a partner can't dodge the self-referral
// check by formatting their number differently.
const digitsOnly = (p) => {
  const d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
};

function randomSuffix(n = 6) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

/**
 * Issue (or return the existing) FOUNDING LEGACY MEMBER benefit for a launch signup:
 * 2x rewards points FOR LIFE. No percentage discount, no expiry.
 * The code string is the member's badge/receipt — but they never have to type it: checkout
 * auto-applies it whenever they're signed in (see autoCustomerCodeFor).
 */
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
  // Only the random suffix needs to avoid look-alikes — ALPHABET already excludes them, so the
  // prefix must NOT be filtered (that turned 'FOUND-' into 'FXUND-').
  const code = 'FOUND-' + randomSuffix(6);
  try {
    await env.DB.prepare(
      `INSERT INTO promo_codes (code, kind, bound_email, pct_off, points_mult, expires_at, status, note, created_at)
       VALUES (?,?,?,0,2,NULL,'active',?,?)`   // 0% off, 2x points, NULL expiry = for life
    ).bind(code, 'customer', em, note || 'founding legacy member', t).run();
  } catch { return null; }
  return { code, expires_at: null };
}

/**
 * The signed-in member's own active benefit, for silent auto-apply at checkout.
 * A lifetime perk shouldn't need typing — this is what makes "2x for life" feel automatic.
 */
export async function autoCustomerCodeFor(env, sessionEmail) {
  if (!env || !env.DB) return null;
  const em = email(sessionEmail);
  if (!em) return null;
  try {
    const r = await env.DB.prepare(
      "SELECT code FROM promo_codes WHERE kind='customer' AND bound_email=? AND status='active' " +
      'AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at ASC LIMIT 1'
    ).bind(em, now()).first();
    return r ? r.code : null;
  } catch { return null; }
}

/**
 * Make a partner's affiliate_code a LIVE checkout code (idempotent).
 * A partner is a `trainers` row; this mirrors their code into promo_codes so customers can
 * actually use it — 0% off (the perk is the free drink, not a discount), 2x points, free Añejo
 * Fit drink on first order, and commission_pct to the partner on every sale INCLUDING renewals.
 */
export async function ensureAffiliateCode(env, { partnerId, code, commissionPct = 10 } = {}) {
  if (!env || !env.DB || !partnerId) return null;
  const c = norm(code);
  if (!c || c === 'HOUSE') return null;   // HOUSE is the internal direct-sales bucket, not a partner
  try {
    const existing = await env.DB.prepare('SELECT code, partner_id FROM promo_codes WHERE code = ?').bind(c).first();
    if (existing) {
      // Re-point / re-activate if this partner already owns it; never hijack someone else's code.
      if (existing.partner_id && existing.partner_id !== partnerId) return null;
      await env.DB.prepare("UPDATE promo_codes SET partner_id=?, commission_pct=?, status='active' WHERE code=?")
        .bind(partnerId, commissionPct, c).run();
      return c;
    }
    await env.DB.prepare(
      `INSERT INTO promo_codes (code, kind, partner_id, pct_off, points_mult, perk, perk_first_order_only,
         commission_pct, status, note, created_at)
       VALUES (?, 'affiliate', ?, 0, 2, 'fit_drink', 1, ?, 'active', 'creator partner', ?)`
    ).bind(c, partnerId, commissionPct, now()).run();
    return c;
  } catch { return null; }
}

/**
 * Evaluate a code for a pending checkout. Pure read — nothing is consumed here.
 * `sessionEmail` is the SIGNED-IN account (null for guests).
 * Returns { ok:false, reason } or { ok:true, ... } with server-computed money.
 */
export async function evaluatePromo(env, { code, sessionEmail, guestEmail, guestPhone, subtotalCents }) {
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
  } else if (row.kind === 'campaign') {
    // Owner-minted general code (e.g. a seasonal promo). Shareable on purpose — the only
    // limits are expires_at / max_uses, already checked above.
  } else if (row.kind === 'affiliate') {
    // Anti-self-referral: a partner can't earn commission on their own order.
    // MUST work for GUESTS too — a partner checking out logged-out was previously unguarded,
    // which made the code a self-service 10% discount. Guests give a phone, not an email, so
    // match on either identifier.
    if (row.partner_id) {
      const buyerEmail = em || email(guestEmail);
      const buyerPhone = digitsOnly(guestPhone);
      try {
        const p = await env.DB.prepare('SELECT email, phone FROM trainers WHERE id = ?').bind(row.partner_id).first();
        if (p) {
          if (buyerEmail && email(p.email) === buyerEmail) return { ok: false, reason: 'self_referral' };
          if (buyerPhone && digitsOnly(p.phone) && digitsOnly(p.phone) === buyerPhone) return { ok: false, reason: 'self_referral' };
        }
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

/**
 * ATOMICALLY claim one use of a capped code. Returns true only if this caller got the slot.
 *
 * The check in evaluatePromo is advisory — between it and the increment sits a Square API
 * round-trip, so N concurrent checkouts could all pass a `max_uses: 1` gate. The conditional
 * UPDATE below is the real gate: SQLite applies it atomically, so exactly one caller sees
 * changes === 1. Call this BEFORE creating the payment link; releasePromoUse() on failure.
 * Uncapped codes (max_uses IS NULL) still increment, and always succeed.
 */
export async function claimPromoUse(env, code) {
  if (!env || !env.DB) return false;
  const c = norm(code);
  if (!c) return false;
  try {
    const r = await env.DB.prepare(
      'UPDATE promo_codes SET uses = uses + 1 WHERE code = ? AND status = ? AND (max_uses IS NULL OR uses < max_uses)'
    ).bind(c, 'active').run();
    return !!(r && r.meta && r.meta.changes === 1);
  } catch { return false; }
}

/** Give the slot back when checkout fails after a successful claim. Best-effort. */
export async function releasePromoUse(env, code) {
  if (!env || !env.DB) return;
  const c = norm(code);
  if (!c) return;
  try {
    await env.DB.prepare('UPDATE promo_codes SET uses = MAX(0, uses - 1) WHERE code = ?').bind(c).run();
  } catch { /* best-effort */ }
}

/** Record the redemption for a created order. Idempotent per order (UNIQUE order_id).
 *  The `uses` counter is NOT touched here — claimPromoUse() owns it. */
export async function recordRedemption(env, { evaluated, orderId, customerEmail }) {
  if (!env || !env.DB || !evaluated || !evaluated.ok || !orderId) return false;
  try {
    await env.DB.prepare(
      `INSERT INTO promo_redemptions (id, code, order_id, email, discount_cents, points_mult, perk_granted, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id('pr'), evaluated.code, orderId, email(customerEmail) || null,
      evaluated.discount_cents || 0, evaluated.points_mult || 1, evaluated.perk || null, now()).run();
  } catch { return false; }  // UNIQUE(order_id) → already recorded
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
