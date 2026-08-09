// /api/hub/owner/autopay — the visible on/off switches, and the per-amount approvals behind them.
//
//   GET                                             → the switches, what is waiting for approval,
//                                                     and which accounts have a card on file
//   POST { op:'set', which:'contracts'|'payouts'|'card_capture', on:true|false }
//   POST { op:'approve_invoice', invoice_id, amount_cents }
//   POST { op:'revoke_invoice',  invoice_id }
//   POST { op:'approve_payout',  kind:'driver'|'partner', subject_id, amount_cents, scope? }
//   POST { op:'remove_card',     account_id }
//
// Owner-only. This endpoint NEVER charges anything and never pays anybody — it only sets posture
// and records approvals. The charge itself happens in the tick (admin/autopay-tick.js) and the
// payout marking in owner/payouts.js, both of which re-check both safeties for themselves rather
// than trusting that this endpoint was involved.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import {
  getAutopaySettings, setAutopaySetting, approveInvoiceCharge, revokeInvoiceApproval, approvePayout,
} from '../../../_lib/autopay.js';
import { removeCardOnFile } from '../../../_lib/card_on_file.js';

const actorOf = (ctx) => (ctx && (ctx.email || ctx.distinct_id)) || null;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const settings = await getAutopaySettings(env);

  // Unpaid contract invoices, with their approval state — this is the list the switch acts on, so
  // it is shown next to the switch rather than a page away.
  let invoices = [];
  try {
    const r = await env.DB.prepare(
      `SELECT i.id, i.number, i.total_cents, i.status, i.period_from, i.period_to,
              i.autopay_approved_at, i.autopay_approved_cents, i.autopay_status, i.autopay_error,
              a.name AS account_name, a.billing_model,
              a.square_card_id IS NOT NULL AND a.square_customer_id IS NOT NULL AS has_card,
              a.card_brand, a.card_last4
         FROM contract_invoices i
         LEFT JOIN contract_accounts a ON a.id = i.account_id
        WHERE i.status IN ('open','sent')
        ORDER BY i.created_at DESC LIMIT 50`
    ).all();
    invoices = (r && r.results) || [];
  } catch { invoices = []; }

  // WHICH ACCOUNTS CAN ACTUALLY BE CHARGED. The invoice list above only shows accounts that
  // happen to have an open invoice, so an account with no card would stay invisible until the
  // moment its first invoice failed. This is the standing answer instead: every account, card or
  // no card, cardless ones FIRST because those are the ones the owner has to do something about.
  // `card_link_token` is the site intake token the customer already uses for the daily count —
  // owner-only, and the reason the owner can send someone the card page without a new secret.
  let accounts = [];
  try {
    const r = await env.DB.prepare(
      `SELECT a.id, a.name, a.status, a.billing_model,
              (a.square_card_id IS NOT NULL AND a.square_customer_id IS NOT NULL) AS has_card,
              a.card_brand, a.card_last4, a.card_added_at,
              a.card_consent_at, a.card_consent_version, a.card_consent_name,
              (SELECT s.intake_token FROM contract_sites s
                WHERE s.account_id = a.id AND s.active = 1 ORDER BY s.created_at LIMIT 1) AS card_link_token
         FROM contract_accounts a
        WHERE a.status IN ('active','pending')
        ORDER BY has_card ASC, a.name ASC LIMIT 100`
    ).all();
    accounts = (r && r.results) || [];
  } catch { accounts = []; }

  let recent = [];
  try {
    const r = await env.DB.prepare(
      'SELECT kind, ref_id, amount_cents, outcome, reason, actor, created_at FROM money_movements ORDER BY created_at DESC LIMIT 25'
    ).all();
    recent = (r && r.results) || [];
  } catch { recent = []; }

  return json({ ok: true, settings, invoices, accounts, recent });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';
  const actor = actorOf(ctx);

  if (op === 'set') {
    const which = String(b.which || '');
    if (which !== 'contracts' && which !== 'payouts' && which !== 'card_capture') {
      return bad('which must be contracts, payouts or card_capture.');
    }
    const on = b.on === true || b.on === 1 || b.on === '1' || b.on === 'true';
    const r = await setAutopaySetting(env, which, on, actor);
    if (!r.ok) return bad(r.error || 'Could not save that switch.', 500);
    return json({ ok: true, settings: await getAutopaySettings(env) });
  }

  if (op === 'approve_invoice') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    // amount_cents is REQUIRED and is compared against the invoice. An approval endpoint that
    // reads the amount off the row it is approving is a rubber stamp, not an approval.
    if (b.amount_cents == null) return bad('Send the amount you are approving, in cents.');
    const r = await approveInvoiceCharge(env, { invoiceId: b.invoice_id, amountCents: b.amount_cents, actor });
    if (!r.ok) return bad(r.error || 'Could not approve that invoice.', 400);
    return json(r);
  }

  if (op === 'revoke_invoice') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await revokeInvoiceApproval(env, { invoiceId: b.invoice_id, actor });
    if (!r.ok) return bad(r.error || 'Could not revoke that approval.', 400);
    return json(r);
  }

  // The consent text promises the customer can withdraw the authorization "by replying to any
  // Añejo invoice or calling us". This is what the owner presses when they do. It clears the card
  // AND the consent together, and the very next autopay attempt refuses with no_card_on_file.
  if (op === 'remove_card') {
    if (!b.account_id) return bad('Missing account_id.');
    const r = await removeCardOnFile(env, { accountId: String(b.account_id), actor });
    if (!r.ok) return bad(r.error || 'Could not remove that card.', 400);
    return json(r);
  }

  if (op === 'approve_payout') {
    const r = await approvePayout(env, {
      kind: b.kind, subjectId: b.subject_id, amountCents: b.amount_cents, scope: b.scope, actor,
    });
    if (!r.ok) return bad(r.error || 'Could not approve that payout.', 400);
    return json(r);
  }

  return bad('Unknown action.');
};
