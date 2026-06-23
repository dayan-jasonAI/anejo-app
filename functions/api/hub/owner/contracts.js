// GET /api/hub/owner/contracts — owner view of B2B contract accounts: each account, its sites
// (with the per-site intake link, lazily minted), and the recent daily-count ledger. Owner-only.
import { json, bad, randToken, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { activateAccount, generateInvoice, getInvoice, setSiteContact, revokeDevice, listDevices, listEvents } from '../../../_lib/contract.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  // Single invoice (for the printable page).
  const invId = new URL(request.url).searchParams.get('invoice');
  if (invId) return json(await getInvoice(env, invId));

  let accounts = [];
  try { accounts = ((await env.DB.prepare('SELECT * FROM contract_accounts ORDER BY name').all()).results) || []; } catch { accounts = []; }

  const out = [];
  for (const a of accounts) {
    let sites = [];
    try { sites = ((await env.DB.prepare('SELECT * FROM contract_sites WHERE account_id = ? ORDER BY name').bind(a.id).all()).results) || []; } catch { sites = []; }
    for (const s of sites) {
      if (!s.intake_token) {
        const tok = randToken(22);
        try { await env.DB.prepare('UPDATE contract_sites SET intake_token = ?, updated_at = ? WHERE id = ?').bind(tok, now(), s.id).run(); s.intake_token = tok; } catch { /* best-effort */ }
      }
    }
    let recent = [];
    try {
      recent = ((await env.DB.prepare(
        'SELECT site_id, service_date, headcount, total_cents, is_rush, invoiced FROM contract_orders WHERE account_id = ? ORDER BY service_date DESC LIMIT 60'
      ).bind(a.id).all()).results) || [];
    } catch { recent = []; }
    let invoices = [];
    try { invoices = ((await env.DB.prepare('SELECT id, number, period_from, period_to, total_cents, status, created_at FROM contract_invoices WHERE account_id = ? ORDER BY created_at DESC LIMIT 12').bind(a.id).all()).results) || []; } catch { invoices = []; }
    const devices = await listDevices(env, a.id);   // trusted intake devices (who can order)
    const events = await listEvents(env, a.id, 60);  // append-only audit trail
    out.push({ account: a, sites, recent, invoices, devices, events });
  }
  return json({ ok: true, accounts: out });
};

// POST { op:'activate', account_id, price_per_lunch_cents, delivery_fee_cents, rush_fee_cents?, cutoff_time? }
//   Owner sets the negotiated terms across the account's sites + flips it active.
export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = b && b.op;
  if (!b || !b.account_id) return bad('Missing account_id.');
  if (op === 'activate') {
    const r = await activateAccount(env, b.account_id, b);
    if (!r.ok) return bad(r.error || 'Could not activate.', 400);
    return json({ ok: true });
  }
  if (op === 'invoice') {
    const r = await generateInvoice(env, { accountId: b.account_id, from: b.from, to: b.to });
    if (!r.ok) return bad(r.error || 'Could not generate the invoice.', 400);
    return json(r);
  }
  if (op === 'set_contact') {
    if (!b.site_id) return bad('Missing site_id.');
    const r = await setSiteContact(env, { site_id: b.site_id, contact_name: b.contact_name, contact_phone: b.contact_phone });
    if (!r.ok) return bad(r.error || 'Could not save the contact.', 400);
    return json(r);
  }
  if (op === 'revoke_device') {
    if (!b.device_id) return bad('Missing device_id.');
    const r = await revokeDevice(env, { device_id: b.device_id });
    return json(r);
  }
  return bad('Unknown action.');
};

