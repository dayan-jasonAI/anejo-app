// Abandoned-checkout sweep.
//
// checkout.js writes the orders row BEFORE the customer pays — it has to, because the row is what
// holds same-day production capacity while they are on Square's hosted page. When someone opens
// checkout and walks away, that row stays `pending` forever, sitting in the order list looking
// exactly like a real order awaiting action. That is not cosmetic: an owner scanning the list
// cannot tell "customer paid and we missed it" from "customer never paid", and the safe assumption
// (someone may be owed food) is the expensive one.
//
// So after a grace window we relabel those rows `abandoned`. THREE SAFETY RULES, all load-bearing:
//
//   1. `status='pending'` ONLY. A paid/prep/ready/fulfilled/canceled order is never touched.
//   2. `square_order_id IS NOT NULL` and not a `sub_` synthetic. A NULL id is a manual counter sale
//      the owner entered by hand (orders.js) and may legitimately sit pending; a `sub_` id is a
//      subscription delivery whose money lives on the weekly invoice, not on a checkout.
//   3. The grace window is long. Square webhooks are usually seconds, but a retry after an outage
//      can be far later, and marking a genuinely-paid order abandoned is the failure that matters.
//
// This is a LABEL, not a decision. It never touches money and never cancels anything in Square.
// The webhook accepts `abandoned` alongside `pending`/`canceled`, so a late payment still flips the
// order to paid and raises the critical alert — the sweep can be wrong and the money path still
// self-heals. That property is why this is safe to run automatically.

// ── PART TWO: the recovery message ────────────────────────────────────────────────────────────
//
// Relabelling the row made the OWNER's list honest and did nothing at all for the customer. Some
// of those people hit a broken card, an expired session, a phone that rang; they meant to buy
// lunch and did not. Nobody ever asked.
//
// FOUR RULES, and each one is here because of a way this kind of message goes wrong:
//
//   1. AT MOST ONE, EVER, PER ORDER. `orders.recovery_sent_at` is claimed with an `IS NULL` guard
//      and the message only sends when that UPDATE changed exactly one row. Two cron ticks
//      overlapping, or a retry, sends nothing the second time. A "you left something behind" that
//      arrives twice is spam by any definition that matters.
//   2. IT CARRIES AN OPT-OUT AND HONOURS THE EXISTING ONES. Email gets a real one-click
//      unsubscribe (the same /api/unsubscribe RFC 8058 route campaigns use); SMS carries STOP and
//      only ever goes to a number that opted in. Anyone already on campaign_unsubscribes or
//      email_suppressions is skipped before a single send is attempted — but the row is still
//      claimed, so they are never reconsidered.
//   3. IT DOES NOT CHASE ANCIENT CARTS. Older than RECOVERY_MAX_AGE_HOURS (default 72h) and we
//      leave it alone. A note about a lunch someone didn't buy last month is not a nudge, it is a
//      stranger reading your shopping history back to you.
//   4. IT IS OFFERED, NOT SOLD. No discount, no countdown, no "your cart expires". If a card
//      failed we want them to know we noticed and that finishing is easy.
//
// The delay is separate from the abandon grace window on purpose. The sweep relabels at 2 hours
// so the owner's list is accurate; the message waits until RECOVERY_AFTER_HOURS (default 4) so
// that someone who paid on a second attempt, or was called back by the owner, is already off the
// list by the time we would have written.

const HOUR = 3600000;

// Two hours. Well past any normal webhook delivery, short enough that the list is honest the same
// day. Override with ABANDON_AFTER_HOURS without a deploy if real traffic argues for a different
// number.
export const DEFAULT_GRACE_HOURS = 2;

export function graceMs(env) {
  const raw = Number(env && env.ABANDON_AFTER_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_GRACE_HOURS;
  return hours * HOUR;
}

/**
 * Relabel stale unpaid checkouts. Returns the number of rows changed (0 on any failure — this is
 * housekeeping and must never break the page that called it).
 */
export async function sweepAbandoned(env, nowMs = Date.now()) {
  if (!env || !env.DB) return 0;
  const cutoff = nowMs - graceMs(env);
  try {
    const r = await env.DB.prepare(
      `UPDATE orders SET status = 'abandoned', updated_at = ?
        WHERE status = 'pending'
          AND square_order_id IS NOT NULL
          AND square_order_id NOT LIKE 'sub_%'
          AND created_at < ?`
    ).bind(nowMs, cutoff).run();
    return (r && r.meta && r.meta.changes) || 0;
  } catch {
    return 0;
  }
}

// ── recovery ──────────────────────────────────────────────────────────────────

export const DEFAULT_RECOVERY_AFTER_HOURS = 4;
export const DEFAULT_RECOVERY_MAX_AGE_HOURS = 72;

const hours = (raw, fallback) => {
  const n = Number(raw);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * HOUR;
};
export const recoveryDelayMs = (env) => hours(env && env.RECOVERY_AFTER_HOURS, DEFAULT_RECOVERY_AFTER_HOURS);
export const recoveryMaxAgeMs = (env) => hours(env && env.RECOVERY_MAX_AGE_HOURS, DEFAULT_RECOVERY_MAX_AGE_HOURS);

/**
 * Decision #11 was ratified ON, so this defaults ON. Set RECOVERY_ENABLED='0' as a Pages var to
 * stop every recovery message without a deploy — the kill switch matters more than the default.
 */
export const recoveryEnabled = (env) => String((env && env.RECOVERY_ENABLED) ?? '1') !== '0';

// ── THE COPY ──────────────────────────────────────────────────────────────────────────────────
// Written to be read by someone who did not buy: no discount, no urgency, no "your cart expires".
// It says we noticed, offers the one thing that is actually useful (the reason it usually fails),
// and makes leaving easy. See RULE 4 above.
export const RECOVERY_SMS = (name, link) =>
  `Añejo Catering Co.: ${name ? `${name}, ` : ''}your order didn't go through — the payment page never completed, so nothing was charged and nothing was made. If you still want it, you can pick it back up here: ${link} If you hit a problem, reply to this text and a person will sort it. Reply STOP to opt out.`;

export const RECOVERY_EMAIL_SUBJECT = 'Your Añejo order didn’t go through';

export const recoveryEmailBody = (name, link) =>
  `<p>${name ? `Hi ${name} — ` : 'Hi — '}your Añejo order didn’t complete. The checkout page closed before the payment went through, so <strong>nothing was charged</strong> and nothing was made.</p>` +
  `<p>Nine times out of ten it’s a card that didn’t clear or a page that timed out, not a decision — so if you still want it, it takes about a minute:</p>` +
  `<p style="margin:20px 0"><a href="${link}" style="background:#1A3D2E;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Start my order again</a></p>` +
  `<p>If something on our end got in the way, <strong>just reply to this email</strong> and a person will fix it — we’d rather know.</p>`;

/**
 * Send the one recovery message an abandoned checkout gets. Returns { checked, sent, skipped }.
 *
 * Deliberately takes its senders as arguments (`send`) rather than importing them: this file is
 * the only place the at-most-once and consent logic lives, and the tests must be able to prove
 * that logic without a Twilio or Resend credential anywhere near them.
 */
export async function recoverAbandoned(env, {
  nowMs = Date.now(), baseUrl = 'https://anejocateringco.com', limit = 100, send = {},
} = {}) {
  const out = { checked: 0, sent: 0, skipped: { opted_out: 0, no_contact: 0, claimed_elsewhere: 0 } };
  if (!env || !env.DB) return out;
  if (!recoveryEnabled(env)) return { ...out, skipped_all: 'disabled' };

  const readyBefore = nowMs - recoveryDelayMs(env);
  const notOlderThan = nowMs - recoveryMaxAgeMs(env);

  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, customer_name, customer_email, customer_phone, sms_consent
         FROM orders
        WHERE status = 'abandoned'
          AND recovery_sent_at IS NULL
          AND created_at < ?
          AND created_at > ?
        ORDER BY created_at DESC LIMIT ?`
    ).bind(readyBefore, notOlderThan, Math.max(1, Math.min(500, limit))).all();
    rows = (r && r.results) || [];
  } catch { return out; }

  const link = `${String(baseUrl).replace(/\/$/, '')}/order`;

  for (const o of rows) {
    out.checked += 1;
    const email = ((o.customer_email || '') + '').trim().toLowerCase() || null;
    const phone = (o.sms_consent === 1 || o.sms_consent === true) ? (o.customer_phone || null) : null;
    if (!email && !phone) { out.skipped.no_contact += 1; continue; }

    // A standing opt-out beats a recovery message, always. Checked BEFORE the claim so a customer
    // who later opts back in is not permanently written off by a claim we never used... except we
    // still claim below when we skip for opt-out, because re-evaluating them on every tick is how
    // an opt-out turns into a daily re-check of somebody who said no. Claim, then don't send.
    let optedOut = false;
    try {
      const u = await env.DB.prepare(
        "SELECT 1 AS x FROM campaign_unsubscribes WHERE (email = ? OR phone = ?) AND (channel = 'all' OR channel IN ('email','sms')) LIMIT 1"
      ).bind(email, phone).first();
      optedOut = !!u;
    } catch { optedOut = false; }   // table absent → the per-send suppression check still applies

    // CLAIM. Everything past this line happens at most once for this order, forever.
    let claimed = false;
    try {
      const c = await env.DB.prepare(
        'UPDATE orders SET recovery_sent_at = ?, recovery_channel = ?, updated_at = ? WHERE id = ? AND recovery_sent_at IS NULL'
      ).bind(nowMs, optedOut ? 'none' : 'pending', nowMs, o.id).run();
      claimed = !!(c && c.meta && c.meta.changes === 1);
    } catch { claimed = false; }
    if (!claimed) { out.skipped.claimed_elsewhere += 1; continue; }
    if (optedOut) { out.skipped.opted_out += 1; continue; }

    const name = ((o.customer_name || '') + '').trim().split(/\s+/)[0] || null;
    let channel = 'none';

    if (phone && typeof send.sms === 'function') {
      try { await send.sms({ to: phone, body: RECOVERY_SMS(name, link) }); channel = 'sms'; }
      catch { /* fall through to email */ }
    }
    if (channel === 'none' && email && typeof send.email === 'function') {
      // One-click unsubscribe, RFC 8058 — this is a marketing-adjacent nudge, not a receipt, and
      // it must be as easy to stop as it was to receive.
      const unsub = `${String(baseUrl).replace(/\/$/, '')}/api/unsubscribe?a=${encodeURIComponent(email)}&c=all`;
      try {
        const r = await send.email({
          to: email,
          subject: RECOVERY_EMAIL_SUBJECT,
          html: recoveryEmailBody(name, link),
          unsubscribeUrl: unsub,
        });
        // sendEmail returns { skipped:true } for a suppressed address — that is not a send.
        channel = (r && r.skipped) ? 'none' : 'email';
      } catch { channel = 'none'; }
    }

    try {
      await env.DB.prepare('UPDATE orders SET recovery_channel = ? WHERE id = ?').bind(channel, o.id).run();
    } catch { /* the claim is what matters; the label is bookkeeping */ }

    if (channel !== 'none') out.sent += 1;
  }

  return out;
}
