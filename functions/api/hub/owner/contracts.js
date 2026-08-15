// GET /api/hub/owner/contracts — owner view of B2B contract accounts: each account, its sites
// (with the per-site intake link, lazily minted), and the recent daily-count ledger. Owner-only.
import { json, bad, randToken, now, id, isEmail, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendEmail, emailShell, escHtml, normalizeEmail } from '../../../_lib/email.js';
import { activateAccount, generateInvoice, getInvoice, setSiteContact, revokeDevice, listDevices, listEvents, parseDeliveryDays, addSite, registerAccount, listSiteStaff, addSiteStaff, setStaffActive, maskSiteStaff, ownerSetHeadcount, sendStaffInvite, createInvoicePaymentLink } from '../../../_lib/contract.js';
import { capture } from '../../../_lib/track.js';

// The edit-terms / invoice-lifecycle helpers below live here rather than in _lib/contract.js
// because they are owner-desk-only: nothing on the public intake path (/lunch-count) may reach
// them, and keeping them beside the requireRole guard makes that obvious.

/**
 * The signed-in staffer's real name, or null.
 *
 * `requireRole` hands back a session CONTEXT — type, role, distinct_id, team, email, is_lead —
 * and no name (contextFromSession in _lib/roles.js). Anything that wants to say WHO did something
 * has to read the staff row. Returns null rather than a placeholder so callers can choose
 * wording that still reads properly with no name at all.
 */
async function staffName(env, ctx) {
  try {
    if (!ctx || !env || !env.DB) return null;
    const where = ctx.distinct_id ? 'id = ?' : 'email = ?';
    const arg = ctx.distinct_id || ctx.email;
    if (!arg) return null;
    const row = await env.DB.prepare(`SELECT name FROM staff WHERE ${where}`).bind(arg).first();
    const n = row && String(row.name || '').trim();
    return n ? n.slice(0, 60) : null;
  } catch { return null; }
}

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

// ---------- schedule / identity validation ----------
// Everything below used to be unreachable from the HUB: the desk showed the delivery days and the
// window as read-only pills while letting the owner edit price and cut-off, so moving a clinic from
// Mon/Tue/Wed to Tue/Thu, correcting a street address, or pausing one location all required a SQL
// console. A displayed value the owner cannot change is the same withheld-control shape as the
// missing billing contact.
function daysField(raw) {
  if (raw === undefined || raw === null) return { skip: true };
  const parsed = parseDeliveryDays(raw);
  // An empty list is rejected rather than stored: a site with no delivery days accepts no head
  // counts at all, which looks identical to a broken intake link from the office's side.
  if (!parsed.length) return { err: 'Pick at least one delivery day.' };
  return { v: parsed.join(',') };
}
function textField(raw, label, max, { required = false } = {}) {
  if (raw === undefined || raw === null) return { skip: true };
  const v = String(raw).trim().slice(0, max);
  if (!v) return required ? { err: `${label} can't be empty.` } : { v: null };
  return { v };
}
function windowField(raw) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  const v = String(raw).trim().toLowerCase();
  // The kitchen board and the router only understand these two; anything else silently lands in
  // an "unspecified" bucket that no prep list reads.
  if (v !== 'lunch' && v !== 'dinner') return { err: 'Delivery window must be lunch or dinner.' };
  return { v };
}
function activeField(raw) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  return { v: (raw === true || raw === 1 || raw === '1' || raw === 'true') ? 1 : 0 };
}
function stateField(raw) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  const v = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v)) return { err: 'State must be a 2-letter code like FL.' };
  return { v };
}
function zipField(raw) {
  if (raw === undefined || raw === null || raw === '') return { skip: true };
  const v = String(raw).trim();
  if (!/^\d{5}(-\d{4})?$/.test(v)) return { err: 'ZIP must be 5 digits (or ZIP+4).' };
  return { v };
}

// Money + cut-off may be set across every site on an account at once (one negotiated rate).
// Identity, address and schedule are per-location by nature and require an explicit site_id —
// broadcasting a street address to every clinic on the account would be silent data loss.
const TERM_COLS = ['price_per_lunch_cents', 'delivery_fee_cents', 'rush_fee_cents', 'cutoff_time'];
const SITE_COLS = ['name', 'street', 'unit', 'city', 'state', 'zip', 'delivery_days', 'window_label', 'delivery_window', 'active'];
const ADDRESS_COLS = ['street', 'unit', 'city', 'state', 'zip'];
const termsOf = (s) => [...TERM_COLS, ...SITE_COLS].reduce((o, k) => { o[k] = s ? s[k] : null; return o; }, {});
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

  const fields = {
    price_per_lunch_cents: centsField(b.price_per_lunch_cents, 'Price per lunch', { min: 1 }),
    delivery_fee_cents: centsField(b.delivery_fee_cents, 'Delivery fee'),
    rush_fee_cents: centsField(b.rush_fee_cents, 'Rush fee'),
    cutoff_time: cutoffField(b.cutoff_time),
    name: textField(b.name, 'Location name', 80, { required: true }),
    street: textField(b.street, 'Street', 160, { required: true }),
    unit: textField(b.unit, 'Unit', 60),
    city: textField(b.city, 'City', 80, { required: true }),
    state: stateField(b.state),
    zip: zipField(b.zip),
    delivery_days: daysField(b.delivery_days),
    window_label: textField(b.window_label, 'Delivery time', 40, { required: true }),
    delivery_window: windowField(b.delivery_window),
    active: activeField(b.active),
  };
  for (const f of Object.values(fields)) if (f.err) return { ok: false, error: f.err };

  const siteId = b.site_id ? String(b.site_id) : null;
  const touchedSiteCols = SITE_COLS.filter((k) => !fields[k].skip);
  if (touchedSiteCols.length && !siteId) {
    return { ok: false, error: 'Pick a location first — an address and schedule belong to one location, not the whole account.' };
  }

  const sets = [], binds = [], after = {};
  for (const [col, f] of Object.entries(fields)) {
    if (f.skip) continue;
    sets.push(`${col} = ?`); binds.push(f.v); after[col] = f.v;
  }
  // A moved location's stored coordinates now point at the old building. Null them so the router
  // re-geocodes from the new address instead of driving yesterday's route to a former tenant.
  if (ADDRESS_COLS.some((k) => !fields[k].skip)) {
    sets.push('delivery_lat = NULL', 'delivery_lng = NULL');
  }
  if (!sets.length) return { ok: false, error: 'Nothing to change.' };
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

// Void an invoice and RELEASE its days back to the un-invoiced pool, so a period billed wrong
// (e.g. a picker that grabbed the current week too) can be corrected by re-generating the right
// range. A PAID invoice is never voided this way — money already moved, so that needs a credit,
// not a silent un-bill. voided_at/voided_by may not exist on older schemas → status-only fallback.
async function voidInvoice(env, ctx, b) {
  const { inv, error } = await loadInvoice(env, b.account_id, b.invoice_id);
  if (error) return { ok: false, error };
  if (inv.status === 'paid') return { ok: false, error: 'A paid invoice can’t be voided — issue a credit or refund instead.' };
  if (inv.status === 'void') return { ok: true, already: true, status: 'void' };

  const t = now();
  // Release first: the days returning to the pool is the whole point, and it must happen even if
  // the status write below has to fall back. invoice_id is cleared so a re-generate re-groups them.
  try { await env.DB.prepare('UPDATE contract_orders SET invoiced = 0, invoice_id = NULL, updated_at = ? WHERE invoice_id = ?').bind(t, inv.id).run(); } catch { /* best-effort */ }
  try {
    await env.DB.prepare("UPDATE contract_invoices SET status='void', voided_at=?, voided_by=?, updated_at=? WHERE id=?")
      .bind(t, actorOf(ctx), t, inv.id).run();
    return { ok: true, status: 'void', voided_at: t };
  } catch {
    try {
      await env.DB.prepare("UPDATE contract_invoices SET status='void', updated_at=? WHERE id=?").bind(t, inv.id).run();
      return { ok: true, status: 'void', degraded: 'invoice_void_columns_missing' };
    } catch { return { ok: false, error: 'Could not void the invoice.' }; }
  }
}

// The emailed invoice: the same figures as the printable page, flattened into one table so it
// survives every mail client. Amounts come straight off the stored row — never recomputed here,
// or the email and the PDF could disagree about what the client owes.
function invoiceEmailHtml({ inv, account, lineItems, payUrl }) {
  const m = (c) => '$' + ((Number(c) || 0) / 100).toFixed(2);
  // Mirror of invoice.html's row builder — delivery is billed once per day for the whole account
  // (one shared trip, not one charge per site on that trip), so each site's block is lunches (+
  // rush, genuinely per-order) only, and delivery gets its own block below. See the long comment on
  // generateInvoice in _lib/contract.js for why.
  let rows = (lineItems.sites || []).map((s) => {
    const days = (s.days || []).map((d) =>
      `<tr><td style="padding:5px 8px;color:#6f7b74;font-size:12.5px">${escHtml(d.date)}${d.rush ? ' · RUSH' : ''}</td>` +
      `<td style="padding:5px 8px;text-align:right;color:#6f7b74;font-size:12.5px">${escHtml(d.count)}</td>` +
      `<td style="padding:5px 8px;text-align:right;color:#6f7b74;font-size:12.5px">${m(d.total_cents)}</td></tr>`).join('');
    return `<tr><td colspan="3" style="padding:7px 8px;background:#F5F2EC;font-weight:700;color:#1A3D2E">${escHtml(s.name)}</td></tr>` + days +
      `<tr><td colspan="2" style="padding:6px 8px;border-bottom:1px solid #e3ddcf">${escHtml(s.name)} — ${escHtml(s.lunches)} lunches</td>` +
      `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e3ddcf"><b>${m((s.subtotal_cents || 0) + (s.rush_cents || 0))}</b></td></tr>`;
  }).join('');
  if (lineItems.delivery && lineItems.delivery.days && lineItems.delivery.days.length) {
    const dDays = lineItems.delivery.days;
    rows += `<tr><td colspan="3" style="padding:7px 8px;background:#F5F2EC;font-weight:700;color:#1A3D2E">Delivery — shared route</td></tr>` +
      dDays.map((d) => `<tr><td style="padding:5px 8px;color:#6f7b74;font-size:12.5px">${escHtml(d.date)}</td><td></td>` +
        `<td style="padding:5px 8px;text-align:right;color:#6f7b74;font-size:12.5px">${m(d.cents)}</td></tr>`).join('') +
      `<tr><td colspan="2" style="padding:6px 8px;border-bottom:1px solid #e3ddcf">Delivery subtotal — ${dDays.length} day${dDays.length === 1 ? '' : 's'}</td>` +
      `<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #e3ddcf"><b>${m(lineItems.delivery.total_cents)}</b></td></tr>`;
  }
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
    // A real, LIVE Square-hosted payment link — closes the gap the old note here used to document
    // ("the only invoice page is owner-gated and bounces a client to staff login"). Square's own
    // checkout page needs no login, so this is the first link on a contract invoice a client can
    // actually use. Omitted when there's no link (Square not configured, or the invoice is paid).
    (payUrl && inv.status !== 'paid')
      ? `<p style="margin-top:20px;text-align:center"><a href="${escHtml(payUrl)}" style="display:inline-block;background:#1A3D2E;color:#fff;text-decoration:none;padding:13px 28px;border-radius:24px;font-weight:700;font-size:14.5px">Pay ${m(inv.total_cents)} now</a></p>` +
        `<p style="margin-top:6px;text-align:center;font-size:12px;color:#6f7b74">Or by check/ACH — reply to this email and we'll send the details.</p>`
      : '',
    `<p style="margin-top:20px">Thank you for your business — just reply to this email with any questions.</p>`,
    `<p>— Dayan<br>Añejo Catering Co.</p>`,
  ].join(''));
}

// Email the invoice to the account's billing contact. Only an 'open' invoice becomes 'sent': a
// paid or void one can still be re-sent as a copy without walking its status backwards.
async function sendInvoiceEmail(env, ctx, b, request) {
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

  // Best-effort: get (or reuse) a Square payment link for an unpaid invoice, so the email can carry
  // a real "Pay now" button. A Square hiccup must never block the invoice itself from going out —
  // the figures are still the bill even without a clickable pay button.
  let payUrl = inv.payment_link_url || null;
  if (!payUrl && inv.status !== 'paid') {
    try {
      const link = await createInvoicePaymentLink(env, inv.id, { baseUrl: appBaseUrl(env, request) });
      if (link && link.ok) payUrl = link.url;
    } catch { /* email still sends without a pay link */ }
  }

  let res;
  try {
    res = await sendEmail(env, {
      to,
      subject: `Invoice ${inv.number || inv.id} — Añejo Catering Co.`,
      html: invoiceEmailHtml({ inv, account: account || {}, lineItems, payUrl }),
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
    // Who may order for each site (migrations/0077), INCLUDING inactive rows: a stand-in who
    // covered while the registered contact was out lands here as pending, and the owner needs to
    // see them in order to authorize or remove them. Masked — the HUB never needs full numbers.
    for (const s of sites) s.staff = maskSiteStaff(await listSiteStaff(env, s.id, { all: true }));
    out.push({ account: a, sites, recent, invoices, devices, events, terms_events: termsEvents });
  }
  return json({ ok: true, accounts: out });
};

// POST { op:'activate', account_id, price_per_lunch_cents, delivery_fee_cents, rush_fee_cents?, cutoff_time? }
//   Owner sets the negotiated terms across the account's sites + flips it active.
// POST { op:'edit_terms', account_id, site_id?, price_per_lunch_cents?, delivery_fee_cents?,
//        rush_fee_cents?, cutoff_time?, note? }  → renegotiate a LIVE account (all sites, or one)
//        …plus, with an explicit site_id: name, street, unit, city, state, zip, delivery_days,
//        window_label, delivery_window, active → every column the desk displays is now editable.
// POST { op:'create_account', company, billing_email, billing_contact?, billing_model?, sites:[…] }
//        → onboard a new business from the HUB (lands pending; Activate sets the terms)
// POST { op:'add_site', account_id, name, street, city, … } → add a location to a live account
// POST { op:'mark_paid', account_id, invoice_id, paid_ref? }      → close an invoice
// POST { op:'send_invoice', account_id, invoice_id, to?, link? }  → email it to the billing contact
export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = b && b.op;

  // Onboarding a brand-new business is the one op with no account to name yet. It ran BEFORE the
  // account_id guard below, which would otherwise reject the request that creates the account.
  //
  // Until now the ONLY way an account could come into existence was the public /business signup
  // form: a client Añejo signed in person, or over the phone, could not be entered anywhere. The
  // desk could activate, re-price and invoice accounts — but not create one.
  if (op === 'create_account') {
    const r = await registerAccount(env, {
      company: b.company,
      billing_email: b.billing_email,
      billing_contact: b.billing_contact,
      billing_model: b.billing_model,
      sites: Array.isArray(b.sites) ? b.sites : [],
    });
    if (!r.ok) return bad(r.error || 'Could not create the account.', 400);
    await capture(env, {
      event: 'contract.account_created',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { account_id: r.account_id, sites: (r.sites || []).length, source: 'hub_owner' },
    });
    // Deliberately lands as PENDING with no price set: terms are agreed per account and the
    // Activate form is the single place that records them. Creating it live at $0 would deliver
    // free lunches on the first head count.
    return json({ ...r, next: 'Set the negotiated terms, then Activate to turn on their links.' });
  }

  // SITE-SCOPED OPS RESOLVE THEIR OWN ACCOUNT, so they must run BEFORE the account_id guard.
  //
  // They shipped AFTER it and were therefore unreachable in production: the roster and override
  // controls sent only `site_id`, so every click died on "Missing account_id." before touching
  // its handler — the owner added someone, saw a message, and nothing happened. The tests said
  // the ops existed because they string-matched the source; a match proves code is PRESENT, never
  // that it is REACHABLE. contract-staff-roster.test.js now drives onRequestPost for real.
  //
  // A site id already determines its account, so demanding both is asking the caller to repeat
  // something the database knows. Resolved here, once, for every site-scoped op.
  if (op === 'add_staff' || op === 'set_staff_active' || op === 'set_headcount') {
    if (!b || !b.site_id) return bad('Missing site_id.');
    const site = await env.DB.prepare('SELECT id, account_id FROM contract_sites WHERE id = ?').bind(String(b.site_id)).first().catch(() => null);
    if (!site) return bad('Site not found.', 404);

    if (op === 'add_staff') {
      const r = await addSiteStaff(env, {
        site_id: site.id, account_id: site.account_id, name: b.name, phone: b.phone, added_by: 'owner', active: true,
      });
      if (!r.ok) return json(r);
      // The invite text is sent ONLY when the owner ticked the box. Being added and being TOLD
      // you were added are separate acts: without the link the person is authorized and has no
      // way in, but a text to a client's employee is not something to send on their behalf by
      // default. The tick is the per-send tap.
      let invited = null;
      if (b.invite) {
        const full = await env.DB.prepare('SELECT id, name, intake_token FROM contract_sites WHERE id = ?').bind(site.id).first().catch(() => null);
        invited = await sendStaffInvite(env, {
          site: full, name: b.name, phone: b.phone, lang: b.lang,
          // The session context carries type/role/distinct_id/team/email — NOT a name
          // (contextFromSession in _lib/roles.js). Reading ctx.name always fell through to the
          // brand, so the first live invites went out reading "Añejo Catering: Añejo added you
          // to place the lunch order" — the one thing the sender line exists to say, missing.
          // The staff row has the real name; look it up, and fall back to a phrase that reads
          // like a sentence rather than to a word that repeats the brand.
          addedBy: await staffName(env, ctx), origin: new URL(request.url).origin,
        });
      }
      return json({ ok: true, invited, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
    }

    if (op === 'set_staff_active') {
      if (!b.staff_id) return bad('Missing staff_id.');
      const r = await setStaffActive(env, { staff_id: b.staff_id, active: !!b.active });
      if (!r.ok) return json(r);
      return json({ ok: true, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
    }

    // THE OVERRIDE. Records the ledger + kitchen order + an 'owner_override' audit row, and sends
    // NO text to the client: this is the owner correcting his own books, not a client confirming
    // an order that never happened.
    return json(await ownerSetHeadcount(env, {
      site_id: site.id, service_date: b.service_date, headcount: b.headcount,
      reason: b.reason, notes: b.notes, is_rush: !!b.is_rush,
      by: (ctx && ctx.name) || 'Owner',
    }));
  }

  if (!b || !b.account_id) return bad('Missing account_id.');

  // A second/third clinic on an account that already exists.
  if (op === 'add_site') {
    const r = await addSite(env, { ...b, account_id: b.account_id });
    if (!r.ok) return bad(r.error || 'Could not add the location.', 400);
    await writeTermsEvent(env, {
      account_id: b.account_id, site_id: r.site_id, event: 'site_added',
      changed_by: actorOf(ctx), changed_role: ctx.role,
      before: {}, after: { name: r.name }, note: b.note,
    });
    await capture(env, {
      event: 'contract.site_added',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { account_id: b.account_id, site_id: r.site_id, inherited_terms: !!r.inherited_terms },
    });
    return json(r);
  }

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
  if (op === 'void_invoice') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await voidInvoice(env, ctx, b);
    if (!r.ok) return bad(r.error || 'Could not void the invoice.', 400);
    return json(r);
  }
  if (op === 'send_invoice') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await sendInvoiceEmail(env, ctx, b, request);
    if (!r.ok) return bad(r.error || 'Could not send the invoice.', 400);
    return json(r);
  }
  if (op === 'create_payment_link') {
    if (!b.invoice_id) return bad('Missing invoice_id.');
    const r = await createInvoicePaymentLink(env, b.invoice_id, { baseUrl: appBaseUrl(env, request) });
    if (!r.ok) return bad(r.error || 'Could not create the payment link.', 400);
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
