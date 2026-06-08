// POST /api/hub/driver/expense/submit — driver submits an expense for reimbursement.
// Body: { amount_cents (int) | amount (dollars), expense_type: 'fuel'|'supplies'|'maintenance'|'other', receipt_photo?, note? }
// Receipt stored as ref string (base64/data/url) — R2 is a follow-up.
// Fires expense.submitted.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { raiseAlert } from '../../../../_lib/alerts.js';
import { id, now } from '../../../../_lib/hub.js';

const TYPES = ['fuel', 'supplies', 'maintenance', 'other'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const expenseType = TYPES.includes(b && b.expense_type) ? b.expense_type : null;
  if (!expenseType) return bad('expense_type must be one of: ' + TYPES.join(', '));

  let amountCents = Number.isFinite(Number(b && b.amount_cents)) ? Math.round(Number(b.amount_cents)) : null;
  if (amountCents == null && Number.isFinite(Number(b && b.amount))) amountCents = Math.round(Number(b.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return bad('amount_cents (or amount) must be a positive number.');

  const ts = now();
  const expId = id('exp');
  const receipt = b.receipt_photo ? String(b.receipt_photo).slice(0, 200000) : null;

  await env.DB
    .prepare(
      'INSERT INTO expenses (id, staff_id, expense_type, amount_cents, receipt_photo, note, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    )
    .bind(expId, staff.id, expenseType, amountCents, receipt, (b && b.note) || null, 'pending', ts, ts)
    .run();

  await capture(env, {
    event: 'expense.submitted',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { amount_cents: amountCents, expense_type: expenseType, has_receipt: !!receipt, platform: 'pwa' },
  });

  // Owner alert: an expense is waiting for review/approval.
  await raiseAlert(env, {
    alert_type: 'expense_pending',
    severity: 'info',
    title: 'Expense awaiting review',
    body: `${staff.name || 'Staff'} · $${(amountCents / 100).toFixed(2)} · ${expenseType}`,
    team: ctx.team || 'delivery',
    ref_type: 'expense', ref_id: expId,
    source: 'surface',
    dedupe_key: `expense_pending:${expId}`,
  });

  return json({ ok: true, expense: { id: expId, amount_cents: amountCents, expense_type: expenseType, status: 'pending' } });
};
