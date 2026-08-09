// /api/hub/owner/autopay — the visible on/off switches, and the per-amount approvals behind them.
//
//   GET                                             → both switches + what is waiting for approval
//   POST { op:'set', which:'contracts'|'payouts', on:true|false }
//   POST { op:'approve_invoice', invoice_id, amount_cents }
//   POST { op:'revoke_invoice',  invoice_id }
//   POST { op:'approve_payout',  kind:'driver'|'partner', subject_id, amount_cents, scope? }
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

  let recent = [];
  try {
    const r = await env.DB.prepare(
      'SELECT kind, ref_id, amount_cents, outcome, reason, actor, created_at FROM money_movements ORDER BY created_at DESC LIMIT 25'
    ).all();
    recent = (r && r.results) || [];
  } catch { recent = []; }

  return json({ ok: true, settings, invoices, recent });
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
    if (which !== 'contracts' && which !== 'payouts') return bad('which must be contracts or payouts.');
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

  if (op === 'approve_payout') {
    const r = await approvePayout(env, {
      kind: b.kind, subjectId: b.subject_id, amountCents: b.amount_cents, scope: b.scope, actor,
    });
    if (!r.ok) return bad(r.error || 'Could not approve that payout.', 400);
    return json(r);
  }

  return bad('Unknown action.');
};
