// GET /api/hub/owner/contracts — owner view of B2B contract accounts: each account, its sites
// (with the per-site intake link, lazily minted), and the recent daily-count ledger. Owner-only.
import { json, bad, randToken, now, id, isEmail } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendEmail, emailShell, escHtml, normalizeEmail } from '../../../_lib/email.js';
import { activateAccount, generateInvoice, getInvoice, setSiteContact, revokeDevice, listDevices, listEvents } from '../../../_lib/contract.js';
import { capture } from '../../../_lib/track.js';

// The edit-terms / invoice-lifecycle helpers below live here rather than in _lib/contract.js
// because they are owner-desk-only: nothing on the public intake path (/lunch-count) may reach
// them, and keeping them beside the requireRole guard makes that obvious.

// ---------- terms validation ----------
// Money is INTEGER CENTS end to end (same Number → round → clamp coercion activateAccount uses),
// plus an upper bound: a renegotiation typed as "600" meaning $6.00 would otherwise sail through
// as $600.00/lunch and bill an office thousands on the next head count.
const MAX_CENTS = 100000; // $1,000 — far above any per-lunch price or fee we'd ever negotiate
function centsField(raw, label, { min = 0 } = {}) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { err: `${label} must be a number.` };
  const v = Math.round(n);
  if (v < min) return { err: `${label} can't be less than $${(min / 100).toFixed(2)}.` };
  if (v > MAX_CENTS) return { err: `${label} looks wrong (over $${(MAX_CENTS / 100).toFixed(0)}) — enter dollars, not cents.` };
  return { v };
}
// ET wall-clock HH:MM, zero-padded so cutoffMin() in _lib/contract.js parses it.
function cutoffField(raw) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(raw).trim());
  if (!m) return { err: 'Cut-off must be a time like 09:00.' };
  return { v: `${String(m[1]).padStart(2, '0')}:${m[2]}` };
}

const TERM_COLS = ['price_per_lunch_cents', 'delivery_fee_cents', 'rush_fee_cents', 'cutoff_time'];
const termsOf = (s) => TERM_COLS.reduce((o, k) => { o[k] = s ? s[k] : null; return o; }, {});
const actorOf = (ctx) => (ctx && (ctx.email || ctx.distinct_id)) || null;

// Append-only terms history (migrations/0046). Best-effort on purpose: if that migration has NOT
// been applied the table is missing, and losing the owner's rate change over a missing audit row
// would be worse than the gap — callers surface `degraded` so it's visible rather than silent.
async function writeTermsEvent(env, ev) {
  try {
    await env.DB.prepare(
      'INSERT INTO contract_terms_events (id, account_id, site_id, event, changed_by, changed_role, before_json, after_json, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      id('cte'), ev.account_id, ev.site_id || null, ev.event, ev.changed_by || null, ev.changed_role || null,
      JSON.stringify(ev.before || {}), JSON.stringify(ev.after || {}),
      (ev.note || '').toString().trim().slice(0, 200) || null, now(),
    ).run();
    return true;
  } catch { return false; }
}

// ---------- edit terms on a live account ----------
// Scope: one site when site_id is given, otherwise every site on the account (what activation
// does). Pending accounts are excluded — they still go through the activation form, which is the
// step that flips status; anything past that (active/paused) is a renegotiation, not a setup.
async function updateTerms(env, ctx, b) {
  const account = await env.DB.prepare('SELECT id, name, status FROM contract_accounts WHERE id = ?').bind(b.account_id).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };
  if (account.status === 'pending') return { ok: false, error: 'This account is still pending — set its terms with Activate.' };

  const price = centsField(b.price_per_lunch_cents, 'Price per lunch', { min: 1 });
  const fee = centsField(b.delivery_fee_cents, 'Delivery fee');
  const rush = centsField(b.rush_fee_cents, 'Rush fee');
  const cutoff = cutoffField(b.cutoff_time);
  for (const f of [price, fee, rush, cutoff]) if (f.err) return { ok: false, error: f.err };

  const sets = [], binds = [], after = {};
  if (!price.skip) { sets.push('price_per_lunch_cents = ?'); binds.push(price.v); after.price_per_lunch_cents = price.v; }
  if (!fee.skip) { sets.push('delivery_fee_cents = ?'); binds.push(fee.v); after.delivery_fee_cents = fee.v; }
  if (!rush.skip) { sets.push('rush_fee_cents = ?'); binds.push(rush.v); after.rush_fee_cents = rush.v; }
  if (!cutoff.skip) { sets.push('cutoff_time = ?'); binds.push(cutoff.v); after.cutoff_time = cutoff.v; }
  if (!sets.length) return { ok: false, error: 'Nothing to change.' };

  const siteId = b.site_id ? String(b.site_id) : null;
  // Read the sites FIRST: these rows are the "before" side of the audit trail.
  let sites = [];
  try {
    const q = siteId
      ? env.DB.prepare('SELECT * FROM contract_sites WHERE account_id = ? AND id = ?').bind(b.account_id, siteId)
      : env.DB.prepare('SELECT * FROM contract_sites WHERE account_id = ?').bind(b.account_id);
    sites = ((await q.all()).results) || [];
  } catch { sites = []; }
  if (!sites.length) return { ok: false, error: siteId ? 'Site not found on this account.' : 'This account has no delivery locations yet.' };

  const t = now();
  try {
    await env.DB.prepare(
      `UPDATE contract_sites SET ${sets.join(', ')}, updated_at = ? WHERE account_id = ?${siteId ? ' AND id = ?' : ''}`
    ).bind(...binds, t, b.account_id, ...(siteId ? [siteId] : [])).run();
  } catch { return { ok: false, error: 'Could not save the new terms.' }; }

  // One audit row per site touched, so a per-site history reads cleanly later.
  let audited = true;
  for (const s of sites) {
    const wrote = await writeTermsEvent(env, {
      account_id: b.account_id, site_id: s.id, event: 'terms_updated',
      changed_by: actorOf(ctx), changed_role: ctx && ctx.role,
      before: termsOf(s), after, note: b.note,
    });
    if (!wrote) audited = false;
  }

  // New terms are forward-looking only: contract_orders snapshots price/fees on every submitted
  // day, so already-counted (and already-invoiced) days are never re-priced behind the client.
  return { ok: true, sites: sites.length, after, ...(audited ? {} : { degraded: 'terms_audit_unavailable' }) };
}

// ---------- invoice lifecycle ----------
async function loadInvoice(env, accountId, invoiceId) {
  const inv = await env.DB.prepare('SELECT * FROM contract_invoices WHERE id = ?').bind(invoiceId).first().catch(() => null);
  if (!inv) return { error: 'Invoice not found.' };
  if (inv.account_id !== accountId) return { error: 'That invoice belongs to another account.' };
  return { inv };
}

// Mark paid. paid_at/paid_by/paid_ref arrive with migrations/0046; until it's applied the UPDATE
// throws on the unknown column, so fall back to a status-only write rather than leaving the owner
// with an invoice that refuses to close — and say so via `degraded`.
async function markInvoicePaid(env, ctx, b) {
  const { inv, error } = await loadInvoice(env, b.account_id, b.invoice_id);
  if (error) return { ok: false, error };
  if (inv.status === 'void') return { ok: false, error: 'That invoice is void.' };
  if (inv.status === 'paid') return { ok: true, already: true, status: 'paid' };

  const t = now();
  const ref = (b.paid_ref || '').toString().trim().slice(0, 120) || null;
  try {
    await env.DB.prepare("UPDATE contract_invoices SET status='paid', paid_at=?, paid_by=?, paid_ref=?, updated_at=? WHERE id=?")
      .bind(t, actorOf(ctx), ref, t, inv.id).run();
    return { ok: true, status: 'paid', paid_at: t };
  } catch {
    try {
      await env.DB.prepare("UPDATE contract_invoices SET status='paid', updated_at=? WHERE id=?").bind(t, inv.id).run();
      return { ok: true, status: 'paid', degraded: 'invoice_paid_columns_missing' };
    } catch { return { ok: false, error: 'Could not mark the invoice paid.' }; }
  }
}

// The emailed invoice: the same figures as the printable page, flattened into one table so it
// survives every mail client. Amounts come straight off the stored row — never recomputed here,
// or the email and the PDF could disagree about what the client owes.
function invoiceEmailHtml({ inv, account, lineItems }) {
  const m = (c) => '$' + ((Number(c) || 0) / 100).toFixed(2);
  const rows = (lineItems.sites || []).map((s) => {
    const days = (s.days || []).map((d) =>
      `<tr><td style="padding:5px 8px;color:#6f7b74;font-size:12.5px">${escHtml(d.date)}${d.rush ? ' · RUSH' : ''}</td>` +
      `<td style="padding:5px 8px;text-align:right;color:#6f7b74;font-size:12.5px">${escHtml(d.count)}</td>` +
      `<td style="padding:5px 8px;text-align:right;color:#6f7b74;font-size:12.5px">${m(d.total_cents)}</td></tr>`).join('');
    return `<tr><td colspan="3" style="padding:7px 8px;background:#F5F2EC;font-weight:700;color:#1A3D2E">${escHtml(s.name)}</td></tr>` + days +
      `<tr><td colspan="2" style="padding:6px 8px;border-bottom:1px solid #e3ddcf">${escHtml(s.name)} — ${escHtml(s.lunches)} lunches</td>` +
      `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e3ddcf"><b>${m((s.subtotal_cents || 0) + (s.delivery_cents || 0) + (s.rush_cents || 0))}</b></td></tr>`;
  }).join('');
  const firstName = account.billing_contact ? String(account.billing_contact).trim().split(/\s+/)[0] : '';
  return emailShell([
    `<p>Hi${firstName ? ' ' + escHtml(firstName) : ''},</p>`,
    `<p>Here is invoice <strong>${escHtml(inv.number || inv.id)}</strong> for ${escHtml(account.name || 'your account')}, covering <strong>${escHtml(inv.period_from || '')} – ${escHtml(inv.period_to || '')}</strong>.</p>`,
    `<table style="width:100%;border-collapse:collapse;font-size:13.5px;margin:18px 0">${rows}</table>`,
    `<table style="width:100%;border-collapse:collapse;font-size:14px">
       <tr><td>Lunches (${escHtml(inv.lunches)})</td><td style="text-align:right">${m(inv.subtotal_cents)}</td></tr>
       <tr><td>Delivery</td><td style="text-align:right">${m(inv.delivery_cents)}</td></tr>
       ${inv.rush_cents ? `<tr><td>Rush fees</td><td style="text-align:right">${m(inv.rush_cents)}</td></tr>` : ''}
       <tr><td style="border-top:2px solid #1A3D2E;padding-top:9px;font-size:17px;font-weight:700;color:#1A3D2E">${inv.status === 'paid' ? 'Paid in full' : 'Total due'}</td>
           <td style="border-top:2px solid #1A3D2E;padding-top:9px;text-align:right;font-size:17px;font-weight:700;color:#1A3D2E">${m(inv.total_cents)}</td></tr>
     </table>`,
    // A re-send of a PAID invoice must not read as a bill. sendInvoiceEmail deliberately supports
    // re-sending (the button even says "Re-send"), and the printable page shows PAID — the email
    // said "Total due" and "Thank you for your business", which invites a second payment.
    inv.status === 'paid'
      ? `<p style="margin-top:14px;padding:10px 12px;background:#e8f1ea;border-radius:8px;color:#1b5c37"><strong>This is a copy — no payment is due.</strong> We received payment in full.</p>`
      : '',
    // NOTE: no link. The only invoice page is /hub/owner/invoice.html, which is owner-gated and
    // bounces a client to the STAFF login — an undeliverable link on every invoice we send. The
    // figures above are the invoice; a token-scoped public route (like contract_sites.intake_token)
    // would be the way to add one back.
    `<p style="margin-top:20px">Thank you for your business — just reply to this email with any questions.</p>`,
    `<p>— Dayan<br>Añejo Catering Co.</p>`,
  ].join(''));
}

// Email the invoice to the account's billing contact. Only an 'open' invoice becomes 'sent': a
// paid or void one can still be re-sent as a copy without walking its status backwards.
async function sendInvoiceEmail(env, ctx, b) {
  const { inv, error } = await loadInvoice(env, b.account_id, b.invoice_id);
  if (error) return { ok: false, error };
  // markInvoicePaid refuses a void invoice; sending one had no guard at all, so a stale tab or a
  // direct POST could bill a client for an invoice that was deliberately cancelled.
  if (inv.status === 'void') return { ok: false, error: 'That invoice is void — it cannot be sent.' };
  const account = await env.DB.prepare('SELECT id, name, billing_email, billing_contact FROM contract_accounts WHERE id = ?').bind(inv.account_id).first().catch(() => null);
  const to = normalizeEmail(b.to || (account && account.billing_email) || '');
  if (!isEmail(to)) return { ok: false, error: 'No billing email on this account — add one before sending.' };

  let lineItems = { sites: [] };
  try { lineItems = JSON.parse(inv.line_items || '{}') || { sites: [] }; } catch { lineItems = { sites: [] }; }

  let res;
  try {
    res = await sendEmail(env, {
      to,
      subject: `Invoice ${inv.number || inv.id} — Añejo Catering Co.`,
      html: invoiceEmailHtml({ inv, account: account || {}, lineItems }),
    });
  } catch (e) {
    return { ok: false, error: 'Could not send the invoice email. ' + String((e && e.message) || '').slice(0, 120) };
  }
  // A suppressed address (hard bounce / complaint) is a silent no-op send — never report it as
  // sent, or the owner waits on a payment for an invoice that never left the building.
  if (res && res.skipped) return { ok: false, error: `That address is suppressed (${res.suppressed}) — it would bounce. Use a different billing email.` };

  const t = now();
  const nextStatus = inv.status === 'open' ? 'sent' : inv.status;
  try {
    await env.DB.prepare('UPDATE contract_invoices SET status=?, sent_at=?, sent_to=?, sent_by=?, updated_at=? WHERE id=?')
      .bind(nextStatus, t, to, actorOf(ctx), t, inv.id).run();
    return { ok: true, status: nextStatus, sent_to: to, sent_at: t };
  } catch {
    // migrations/0046 not applied. The mail is already out, so still record what the schema holds.
    try { await env.DB.prepare('UPDATE contract_invoices SET status=?, updated_at=? WHERE id=?').bind(nextStatus, t, inv.id).run(); } catch { /* best-effort */ }
    return { ok: true, status: nextStatus, sent_to: to, degraded: 'invoice_sent_columns_missing' };
  }
}

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
    // SELECT * (not a fixed column list) so paid_at/sent_at flow through as soon as
    // migrations/0046 is applied, without another deploy. line_items is dropped below — the list
    // only needs headers, and the printable page fetches the per-day JSON per invoice.
    let invoices = [];
    try { invoices = ((await env.DB.prepare('SELECT * FROM contract_invoices WHERE account_id = ? ORDER BY created_at DESC LIMIT 12').bind(a.id).all()).results) || []; } catch { invoices = []; }
    invoices = invoices.map((v) => { const c = { ...v }; delete c.line_items; return c; });
    // Terms history (migrations/0046). Stays empty until that migration is applied.
    let termsEvents = [];
    try {
      termsEvents = ((await env.DB.prepare(
        'SELECT site_id, event, changed_by, before_json, after_json, note, created_at FROM contract_terms_events WHERE account_id = ? ORDER BY created_at DESC LIMIT 40'
      ).bind(a.id).all()).results) || [];
    } catch { termsEvents = []; }
    const devices = await listDevices(env, a.id);   // trusted intake devices (who can order)
    const events = await listEvents(env, a.id, 60);  // append-only audit trail
    out.push({ account: a, sites, recent, invoices, devices, events, terms_events: termsEvents });
  }
  return json({ ok: true, accounts: out });
};

// POST { op:'activate', account_id, price_per_lunch_cents, delivery_fee_cents, rush_fee_cents?, cutoff_time? }
//   Owner sets the negotiated terms across the account's sites + flips it active.
// POST { op:'edit_terms', account_id, site_id?, price_per_lunch_cents?, delivery_fee_cents?,
//        rush_fee_cents?, cutoff_time?, note? }  → renegotiate a LIVE account (all sites, or one)
// POST { op:'mark_paid', account_id, invoice_id, paid_ref? }      → close an invoice
// POST { op:'send_invoice', account_id, invoice_id, to?, link? }  → email it to the billing contact
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
    // Snapshot the opening terms so the history starts at activation, not at the first edit.
    await writeTermsEvent(env, {
      account_id: b.account_id, event: 'activated', changed_by: actorOf(ctx), changed_role: ctx.role,
      before: {},
      after: { price_per_lunch_cents: b.price_per_lunch_cents, delivery_fee_cents: b.delivery_fee_cents, rush_fee_cents: b.rush_fee_cents, cutoff_time: b.cutoff_time },
    });
    return json({ ok: true });
  }
  if (op === 'edit_terms') {
    const r = await updateTerms(env, ctx, b);
    if (!r.ok) return bad(r.error || 'Could not save the new terms.', 400);
    return json(r);
  }
  if (op === 'invoice') {
    const r = await generateInvoice(env, { accountId: b.account_id, from: b.from, to: b.to });
    if (!r.ok) return bad(r.error || 'Could not generate the invoice.', 400);
    return json(r);
  }
  if (op === 'mark_paid') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await markInvoicePaid(env, ctx, b);
    if (!r.ok) return bad(r.error || 'Could not mark the invoice paid.', 400);
    return json(r);
  }
  if (op === 'send_invoice') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await sendInvoiceEmail(env, ctx, b);
    if (!r.ok) return bad(r.error || 'Could not send the invoice.', 400);
    return json(r);
  }
  if (op === 'set_contact') {
    if (!b.site_id) return bad('Missing site_id.');
    const r = await setSiteContact(env, { site_id: b.site_id, contact_name: b.contact_name, contact_phone: b.contact_phone });
    if (!r.ok) return bad(r.error || 'Could not save the contact.', 400);
    return json(r);
  }
  // Set who receives the INVOICE for an account.
  //
  // This existed nowhere until now: contract_accounts.billing_email could be read (send_invoice
  // requires it) but never written, so sending an invoice failed with "No billing email on this
  // account" and there was no screen anywhere to fix that. Worse, with no billing contact the only
  // people the system can reach at an account are the site contacts who submit headcounts — and
  // those are precisely the people who must never see pricing.
  if (op === 'set_billing') {
    const accountId = String(b.account_id || '').trim();
    if (!accountId) return bad('Missing account_id.');

    const email = normalizeEmail(b.billing_email || '');
    // Allow clearing it deliberately (empty string), but never accept a malformed address —
    // a typo here means invoices bounce and the owner waits on a payment that was never asked for.
    if (email && !isEmail(email)) return bad('That does not look like a valid email address.');
    const contact = String(b.billing_contact || '').trim().slice(0, 120);

    const t = now();
    try {
      const r = await env.DB.prepare(
        'UPDATE contract_accounts SET billing_email = ?, billing_contact = ?, updated_at = ? WHERE id = ?'
      ).bind(email || null, contact || null, t, accountId).run();
      if (!r || !r.meta || r.meta.changes !== 1) return bad('Account not found.', 404);
    } catch (e) {
      return bad('Could not save the billing contact. ' + String((e && e.message) || '').slice(0, 120), 500);
    }

    await capture(env, {
      event: 'contract.billing_contact_set',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { account_id: accountId, has_email: !!email },
    });
    return json({ ok: true, account_id: accountId, billing_email: email || null, billing_contact: contact || null });
  }

  if (op === 'revoke_device') {
    if (!b.device_id) return bad('Missing device_id.');
    const r = await revokeDevice(env, { device_id: b.device_id });
    return json(r);
  }
  return bad('Unknown action.');
};
