// POST /api/promo-check { code, subtotal_cents } → validate a promo/creator code for the cart
// BEFORE checkout, so the customer sees the result inline instead of discovering it at Square.
//
// Read-only: nothing is consumed here (recordRedemption happens at checkout). Rate-limited,
// because an open code-checker is a brute-force surface.
import { json, bad } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { currentUser } from '../_lib/session.js';
import { evaluatePromo, autoCustomerCodeFor } from '../_lib/promo.js';

const MESSAGES = {
  not_found: 'That code isn’t valid.',
  disabled: 'That code is no longer active.',
  expired: 'That code has expired.',
  exhausted: 'That code has reached its limit.',
  not_started: 'That code isn’t active yet.',
  signin_required: 'Sign in with the email your code was sent to, then apply it.',
  not_your_code: 'That code belongs to another account — codes can’t be shared.',
  self_referral: 'You can’t use your own partner code.',
  empty: 'Enter a code.',
  unavailable: 'Couldn’t check that code right now.',
};

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'promocheck', limit: 12, windowSec: 60 });
  if (limited) return limited;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  let sessEmail = null;
  try {
    const sess = await currentUser(env, request);
    if (sess && sess.type === 'client' && sess.email) sessEmail = String(sess.email).trim().toLowerCase();
  } catch { sessEmail = null; }

  const subtotalCents = Math.max(0, Math.round(Number(b.subtotal_cents) || 0));

  // No code typed → report the signed-in member's auto-applied lifetime benefit (if any), so the
  // cart can show "Founding Legacy Member — 2x points" without them doing anything.
  let code = (b.code || '').trim();
  let auto = false;
  if (!code) {
    code = (await autoCustomerCodeFor(env, sessEmail)) || '';
    auto = !!code;
    if (!code) return json({ ok: false, reason: 'empty', auto: false });
  }

  const ev = await evaluatePromo(env, { code, sessionEmail: sessEmail, subtotalCents });
  if (!ev.ok) {
    return json({ ok: false, auto, reason: ev.reason, message: MESSAGES[ev.reason] || MESSAGES.unavailable });
  }

  // Human-readable summary of what they just unlocked.
  const parts = [];
  if (ev.pct_off > 0) parts.push(`${ev.pct_off}% off`);
  if (ev.points_mult > 1) parts.push(`${ev.points_mult}x rewards points`);
  if (ev.perk === 'fit_drink') parts.push('a free Añejo Fit drink on your first order');

  return json({
    ok: true,
    auto,
    code: ev.code,
    kind: ev.kind,
    pct_off: ev.pct_off,
    discount_cents: ev.discount_cents,
    points_mult: ev.points_mult,
    perk: ev.perk,
    label: ev.kind === 'customer' ? 'Founding Legacy Member' : ev.code,
    message: parts.length ? `Applied — ${parts.join(' + ')}.` : 'Applied.',
  });
};
