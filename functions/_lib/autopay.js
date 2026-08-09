// autopay.js — automatic B2B contract charging and payout marking, behind TWO safeties.
// Files under _lib are NOT routed.
//
// WHAT WAS TRUE BEFORE THIS FILE. `weekly_autopay` was a string in a list (_lib/contract.js:7-8).
// It selected an invoice cadence and nothing else: invoices were generated, emailed, and waited
// for someone to type a cheque number into the HUB. Nothing in the codebase had ever charged a
// card. On the other side, `payouts.js` and the `rev_share_events` ledger could flip rows to
// 'paid' with no record that a human had ever agreed to the figure.
//
// DAYAN'S REQUIREMENT, VERBATIM: "add an on/off switch button to the hub that is visible and
// properly wired so I can turn it on and off as I please, OR leave it on with the rule that it
// doesn't send unless Dayan approves the number."
//
// He offered a choice; both are implemented, because they answer different questions:
//
//   THE TOGGLE answers "is automatic money movement allowed at all right now?" It is a standing
//   posture. One switch, off by default, flipped from the HUB, effective immediately, no deploy.
//
//   THE APPROVAL answers "is THIS number allowed?" It is per-amount and single-use. It is bound
//   to the exact cents approved: if the invoice total changes after approval — a late headcount,
//   a corrected rate — the approval no longer matches and the charge REFUSES rather than charging
//   the new figure. Approving $1,200 must never authorise $2,400.
//
// A toggle alone would let a re-priced invoice charge silently. An approval alone would leave no
// way to stop everything at once when something is obviously wrong. So: both, and both must pass.
//
// EVERY REFUSAL IS RECORDED (money_movements). A refusal is not an error, it is the safety doing
// its job, and it is exactly what you want to read when someone asks why a client wasn't charged.
import { square, squareConfigured } from './square.js';
import { id, now } from './hub.js';

// ── the toggles ───────────────────────────────────────────────────────────────
// app_settings, not env vars: an env var needs a deploy, and "turn it off as I please" cannot mean
// "open a terminal". Absent key → OFF. That is the whole default story: applying the migration and
// shipping this code changes no behaviour until somebody deliberately turns something on.
export const AUTOPAY_KEYS = {
  contracts: 'autopay.contracts_enabled',
  payouts: 'autopay.payouts_enabled',
};

const isOn = (v) => v === '1' || v === 1 || v === 'true' || v === true;

export async function getAutopaySettings(env) {
  const out = { contracts_enabled: false, payouts_enabled: false, degraded: false };
  if (!env || !env.DB) return { ...out, degraded: true };
  try {
    const r = await env.DB.prepare(
      "SELECT key, value FROM app_settings WHERE key IN ('autopay.contracts_enabled','autopay.payouts_enabled')"
    ).all();
    for (const row of (r && r.results) || []) {
      if (row.key === AUTOPAY_KEYS.contracts) out.contracts_enabled = isOn(row.value);
      if (row.key === AUTOPAY_KEYS.payouts) out.payouts_enabled = isOn(row.value);
    }
  } catch {
    // FAIL CLOSED. Anything we cannot read is off. The failure mode of an unreadable settings
    // table must be "no money moves", never "money moves on last-known-good".
    return { contracts_enabled: false, payouts_enabled: false, degraded: true };
  }
  return out;
}

export async function setAutopaySetting(env, which, on, actor) {
  const key = AUTOPAY_KEYS[which];
  if (!key) return { ok: false, error: 'Unknown switch.' };
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  try {
    await env.DB.prepare(
      'INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?) ' +
      'ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at'
    ).bind(key, on ? '1' : '0', actor || null, now()).run();
    return { ok: true, key, on: !!on };
  } catch { return { ok: false, error: 'Could not save that switch.' }; }
}

// ── the audit trail ───────────────────────────────────────────────────────────
export async function recordMovement(env, m) {
  try {
    await env.DB.prepare(
      'INSERT INTO money_movements (id, kind, ref_type, ref_id, amount_cents, outcome, reason, actor, detail, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      id('mm'), m.kind, m.ref_type || null, m.ref_id || null,
      m.amount_cents == null ? null : Math.round(Number(m.amount_cents)),
      m.outcome, m.reason || null, m.actor || null,
      m.detail ? String(m.detail).slice(0, 500) : null, now(),
    ).run();
    return true;
  } catch { return false; }
}

// ── the approval, for a contract invoice ──────────────────────────────────────
/**
 * Approve ONE invoice for automatic charging, at ONE amount.
 * `amount_cents` must be sent explicitly by the approver and must match the invoice's current
 * total. Deriving it from the row would make this a rubber stamp: the whole point is that a human
 * read a number and agreed to it, so the number has to come from the human.
 */
export async function approveInvoiceCharge(env, { invoiceId, amountCents, actor } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  const want = Math.round(Number(amountCents));
  if (!Number.isFinite(want) || want <= 0) return { ok: false, error: 'Approve an amount in cents greater than zero.' };

  let inv;
  try { inv = await env.DB.prepare('SELECT * FROM contract_invoices WHERE id = ?').bind(invoiceId).first(); }
  catch { return { ok: false, error: 'Could not read that invoice.' }; }
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status === 'paid') return { ok: false, error: 'That invoice is already paid.' };
  if (inv.status === 'void') return { ok: false, error: 'That invoice is void.' };
  if (Number(inv.total_cents) !== want) {
    return { ok: false, error: `That invoice is for $${(Number(inv.total_cents) / 100).toFixed(2)}, not $${(want / 100).toFixed(2)}. Approve the amount actually on the invoice.` };
  }

  try {
    await env.DB.prepare(
      'UPDATE contract_invoices SET autopay_approved_at=?, autopay_approved_by=?, autopay_approved_cents=?, updated_at=? WHERE id=?'
    ).bind(now(), actor || null, want, now(), inv.id).run();
  } catch { return { ok: false, error: 'Could not record the approval. The migration may not be applied.' }; }

  await recordMovement(env, {
    kind: 'contract_autopay', ref_type: 'invoice', ref_id: inv.id,
    amount_cents: want, outcome: 'refused', reason: 'approved_pending_charge',
    actor, detail: 'Amount approved for automatic charge; nothing charged yet.',
  });
  return { ok: true, invoice_id: inv.id, approved_cents: want };
}

/** Withdraw an approval. Cheap, always allowed, and the reason the toggle is not the only brake. */
export async function revokeInvoiceApproval(env, { invoiceId, actor } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  try {
    await env.DB.prepare(
      'UPDATE contract_invoices SET autopay_approved_at=NULL, autopay_approved_by=NULL, autopay_approved_cents=NULL, updated_at=? WHERE id=?'
    ).bind(now(), invoiceId).run();
    await recordMovement(env, {
      kind: 'contract_autopay', ref_type: 'invoice', ref_id: invoiceId,
      outcome: 'refused', reason: 'approval_revoked', actor,
    });
    return { ok: true };
  } catch { return { ok: false, error: 'Could not revoke that approval.' }; }
}

// ── the charge ────────────────────────────────────────────────────────────────
/**
 * Charge one contract invoice to the account's card on file.
 *
 * THE GATE ORDER IS THE POINT. Every refusal is decided BEFORE Square is contacted, so a refusal
 * cannot possibly have moved money — there is no window in which the toggle was off and a request
 * was already in flight.
 *
 *   1. toggle off                        → refused, no Square call
 *   2. never approved                    → refused, no Square call
 *   3. approved for a DIFFERENT amount   → refused, no Square call
 *   4. no card on file                   → refused, no Square call
 *   5. Square not configured             → refused, no Square call
 *   … only then does a payment request leave the building.
 *
 * Returns { ok, charged, reason, payment_id }. Never throws.
 */
export async function chargeContractInvoice(env, invoice, { actor = 'cron', settings = null } = {}) {
  const refuse = async (reason, detail) => {
    await recordMovement(env, {
      kind: 'contract_autopay', ref_type: 'invoice', ref_id: invoice && invoice.id,
      amount_cents: invoice && invoice.total_cents, outcome: 'refused', reason, actor, detail,
    });
    return { ok: false, charged: false, reason };
  };

  if (!env || !env.DB || !invoice || !invoice.id) return { ok: false, charged: false, reason: 'no_invoice' };
  if (invoice.status === 'paid') return { ok: false, charged: false, reason: 'already_paid' };
  if (invoice.status === 'void') return { ok: false, charged: false, reason: 'void' };

  const s = settings || await getAutopaySettings(env);
  if (!s.contracts_enabled) return refuse('autopay_off', 'The contracts autopay switch is off in the HUB.');

  const approved = Number(invoice.autopay_approved_cents);
  if (!invoice.autopay_approved_at || !Number.isFinite(approved) || approved <= 0) {
    return refuse('not_approved', 'Nobody has approved an amount for this invoice.');
  }
  const total = Math.round(Number(invoice.total_cents));
  if (approved !== total) {
    return refuse('amount_changed',
      `Approved $${(approved / 100).toFixed(2)} but the invoice is now $${(total / 100).toFixed(2)} — it must be approved again.`);
  }

  let account;
  try { account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(invoice.account_id).first(); }
  catch { account = null; }
  if (!account) return refuse('no_account', 'The account behind this invoice could not be read.');
  if (!account.square_card_id || !account.square_customer_id) {
    return refuse('no_card_on_file', `${account.name || 'This account'} has no card on file — nothing to charge.`);
  }
  if (!squareConfigured(env)) return refuse('square_not_configured', 'Square credentials are not set.');

  // Idempotency is derived from the invoice, not the moment: a retried tick reuses the same key
  // and Square returns the original payment instead of taking the money twice.
  let res;
  try {
    res = await square(env, '/v2/payments', {
      method: 'POST',
      body: {
        idempotency_key: `ctinv_${invoice.id}`,
        source_id: account.square_card_id,
        customer_id: account.square_customer_id,
        location_id: env.SQUARE_LOCATION_ID,
        amount_money: { amount: total, currency: 'USD' },
        reference_id: String(invoice.number || invoice.id).slice(0, 40),
        note: `Añejo contract invoice ${invoice.number || invoice.id}`,
      },
    });
  } catch (e) {
    res = { ok: false, status: 0, data: { errors: [{ detail: String((e && e.message) || 'network error') }] } };
  }

  if (!res.ok) {
    const detail = (res.data && res.data.errors && res.data.errors[0] && res.data.errors[0].detail) || `Square returned ${res.status}.`;
    try {
      await env.DB.prepare('UPDATE contract_invoices SET autopay_status=?, autopay_error=?, updated_at=? WHERE id=?')
        .bind('failed', String(detail).slice(0, 300), now(), invoice.id).run();
    } catch { /* best-effort */ }
    await recordMovement(env, {
      kind: 'contract_autopay', ref_type: 'invoice', ref_id: invoice.id,
      amount_cents: total, outcome: 'failed', reason: 'square_error', actor, detail,
    });
    return { ok: false, charged: false, reason: 'square_error', error: detail };
  }

  const paymentId = (res.data && res.data.payment && res.data.payment.id) || null;
  const t = now();
  try {
    // The approval is CONSUMED here. Clearing it means a second charge of the same invoice would
    // have to be approved all over again, even with the toggle on.
    await env.DB.prepare(
      "UPDATE contract_invoices SET status='paid', paid_at=?, paid_by=?, paid_ref=?, " +
      "autopay_status='charged', autopay_charged_at=?, autopay_payment_id=?, autopay_error=NULL, " +
      'autopay_approved_at=NULL, autopay_approved_cents=NULL, updated_at=? WHERE id=?'
    ).bind(t, actor, `Square autopay ${paymentId || ''}`.trim(), t, paymentId, t, invoice.id).run();
  } catch { /* the money moved; the row lagging is recoverable and the movement log records it */ }

  await recordMovement(env, {
    kind: 'contract_autopay', ref_type: 'invoice', ref_id: invoice.id,
    amount_cents: total, outcome: 'charged', actor, detail: paymentId || null,
  });
  return { ok: true, charged: true, payment_id: paymentId, amount_cents: total };
}

// ── payout approvals ──────────────────────────────────────────────────────────
/**
 * Approve one payout figure. Same contract as the invoice approval: single-use, amount-bound.
 * Nothing here pays anybody — it authorises exactly one later `mark_paid` for exactly this number.
 */
export async function approvePayout(env, { kind, subjectId, amountCents, scope, actor } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  if (kind !== 'driver' && kind !== 'partner') return { ok: false, error: 'kind must be driver or partner.' };
  const amt = Math.round(Number(amountCents));
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Approve an amount in cents greater than zero.' };
  const sid = String(subjectId || '').trim();
  if (!sid) return { ok: false, error: 'Missing who the payout is for.' };

  const aid = id('pa');
  try {
    await env.DB.prepare(
      'INSERT INTO payout_approvals (id, kind, subject_id, amount_cents, scope_json, approved_by, approved_at) VALUES (?,?,?,?,?,?,?)'
    ).bind(aid, kind, sid, amt, scope ? JSON.stringify(scope) : null, actor || null, now()).run();
  } catch { return { ok: false, error: 'Could not record the approval. The migration may not be applied.' }; }
  return { ok: true, approval_id: aid, amount_cents: amt };
}

/**
 * Claim the approval that authorises paying `amountCents` to `subjectId`, if there is one.
 *
 * The claim is a conditional UPDATE, so two concurrent mark-paid calls cannot both consume the
 * same approval and pay twice. Returns the approval id, or null — and null means REFUSE.
 */
export async function consumePayoutApproval(env, { kind, subjectId, amountCents, ref } = {}) {
  if (!env || !env.DB) return null;
  const amt = Math.round(Number(amountCents));
  if (!Number.isFinite(amt) || amt <= 0) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT id FROM payout_approvals WHERE kind=? AND subject_id=? AND amount_cents=? AND consumed_at IS NULL ORDER BY approved_at DESC LIMIT 1'
    ).bind(kind, String(subjectId), amt).first();
    if (!row || !row.id) return null;
    const r = await env.DB.prepare(
      'UPDATE payout_approvals SET consumed_at=?, consumed_ref=? WHERE id=? AND consumed_at IS NULL'
    ).bind(now(), ref || null, row.id).run();
    return (r && r.meta && r.meta.changes === 1) ? row.id : null;
  } catch { return null; }
}

/**
 * The single gate every payout marking goes through. Returns { ok } or { ok:false, reason, error }.
 * Both safeties, same order as the charge path: toggle first, then the amount.
 */
export async function authorizePayout(env, { kind, subjectId, amountCents, ref, actor, settings = null } = {}) {
  const s = settings || await getAutopaySettings(env);
  const movementKind = kind === 'partner' ? 'partner_payout' : 'driver_payout';

  if (!s.payouts_enabled) {
    await recordMovement(env, {
      kind: movementKind, ref_type: kind, ref_id: subjectId, amount_cents: amountCents,
      outcome: 'refused', reason: 'payouts_off', actor,
      detail: 'The payouts switch is off in the HUB.',
    });
    return { ok: false, reason: 'payouts_off', error: 'Payouts are switched off in the HUB. Turn them on in Finance → Automatic payments.' };
  }

  const approvalId = await consumePayoutApproval(env, { kind, subjectId, amountCents, ref });
  if (!approvalId) {
    await recordMovement(env, {
      kind: movementKind, ref_type: kind, ref_id: subjectId, amount_cents: amountCents,
      outcome: 'refused', reason: 'not_approved', actor,
      detail: 'No unused approval matches this exact amount.',
    });
    return {
      ok: false, reason: 'not_approved',
      error: `Nobody has approved $${(Math.round(Number(amountCents) || 0) / 100).toFixed(2)} for this payout. Approve the amount first.`,
    };
  }

  await recordMovement(env, {
    kind: movementKind, ref_type: kind, ref_id: subjectId, amount_cents: amountCents,
    outcome: 'paid', actor, detail: approvalId,
  });
  return { ok: true, approval_id: approvalId };
}
