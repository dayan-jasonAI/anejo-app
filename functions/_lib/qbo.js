// QuickBooks Online — OAuth2, token refresh with ROTATION, and pushing a contract invoice.
// Files under functions/_lib are NOT routed.
//
// Posture, matching twilio.js and geo.js: with no QBO_CLIENT_ID / QBO_CLIENT_SECRET this module
// NO-OPS. Every entry point returns { ok:false, reason:'not_configured' } and nothing throws, so
// the invoicing that already works — generate, email, mark paid — is untouched whether or not
// QuickBooks is ever connected. Pushing to QBO is ADDITIVE. D1 remains the source of truth for
// what a client owes; QBO is a copy for the books.
//
// THE BUG THIS FILE EXISTS TO NOT HAVE: Intuit ROTATES the refresh token. Most refresh calls
// return a NEW refresh_token and invalidate the old one. Persist the access token but not the
// refresh token and the connection works for an hour, then dies permanently — and it dies
// silently, days later, at the moment someone tries to invoice. Every token write here saves both.
import { now } from './hub.js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';
// Refresh this far BEFORE expiry. An access token that dies mid-request turns one invoice push
// into a 401 the owner has to interpret.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export function qboConfigured(env) {
  return !!(env && env.QBO_CLIENT_ID && env.QBO_CLIENT_SECRET);
}

function apiBase(conn) {
  return conn && conn.environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

// The redirect Intuit sends the owner back to. Must match the app's registered URI EXACTLY —
// including scheme and trailing path — or the handshake fails with a redirect_uri_mismatch that
// says nothing useful.
export function redirectUri(env, request) {
  if (env && env.QBO_REDIRECT_URI) return env.QBO_REDIRECT_URI;
  const origin = request ? new URL(request.url).origin : 'https://anejocateringco.com';
  return `${origin}/api/hub/owner/qbo/callback`;
}

export async function getConnection(env) {
  if (!env || !env.DB) return null;
  try {
    return await env.DB.prepare("SELECT * FROM qbo_connection WHERE id = 'qbo'").first();
  } catch { return null; }   // migration 0053 not applied yet
}

async function saveTokens(env, { realmId, tok, environment, connectedBy }) {
  const t = now();
  const expiresAt = t + (Number(tok.expires_in) || 3600) * 1000;
  const refreshExpiresAt = tok.x_refresh_token_expires_in
    ? t + Number(tok.x_refresh_token_expires_in) * 1000
    : null;
  await env.DB.prepare(
    `INSERT INTO qbo_connection (id, realm_id, access_token, refresh_token, expires_at,
        refresh_expires_at, environment, connected_by, connected_at, refreshed_at, last_error, updated_at)
     VALUES ('qbo',?,?,?,?,?,?,?,?,?,NULL,?)
     ON CONFLICT(id) DO UPDATE SET
       realm_id=excluded.realm_id, access_token=excluded.access_token,
       refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
       refresh_expires_at=excluded.refresh_expires_at, environment=excluded.environment,
       refreshed_at=excluded.refreshed_at, last_error=NULL, updated_at=excluded.updated_at`
  ).bind(
    realmId, tok.access_token, tok.refresh_token, expiresAt, refreshExpiresAt,
    environment || 'production', connectedBy || null, t, t, t,
  ).run();
}

async function noteError(env, msg) {
  try {
    await env.DB.prepare("UPDATE qbo_connection SET last_error=?, updated_at=? WHERE id='qbo'")
      .bind(String(msg || '').slice(0, 300), now()).run();
  } catch { /* best-effort */ }
}

function basicAuth(env) {
  return 'Basic ' + btoa(`${env.QBO_CLIENT_ID}:${env.QBO_CLIENT_SECRET}`);
}

async function tokenCall(env, body) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* Intuit returns HTML on some failures */ }
  if (!r.ok || !j || !j.access_token) {
    const detail = (j && (j.error_description || j.error)) || text.slice(0, 160);
    return { ok: false, error: `QuickBooks refused the token request (${r.status}). ${detail}` };
  }
  return { ok: true, tok: j };
}

/** Step 1 of the handshake: where to send the owner. `state` is the caller's CSRF nonce. */
export function authorizeUrl(env, request, state) {
  const p = new URLSearchParams({
    client_id: env.QBO_CLIENT_ID,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirectUri(env, request),
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

/** Step 2: exchange the one-time code for tokens and store them. */
export async function exchangeCode(env, request, { code, realmId, connectedBy }) {
  if (!qboConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!code || !realmId) return { ok: false, error: 'QuickBooks did not return a company to connect.' };
  const res = await tokenCall(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(env, request),
  });
  if (!res.ok) return res;
  try {
    await saveTokens(env, {
      realmId: String(realmId), tok: res.tok,
      environment: env.QBO_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
      connectedBy,
    });
  } catch (e) {
    return { ok: false, error: 'Connected to QuickBooks but could not save the connection. ' + String((e && e.message) || '').slice(0, 120) };
  }
  return { ok: true, realm_id: String(realmId) };
}

/**
 * A usable access token, refreshing first if it is close to expiry.
 * Returns { ok, token, conn } or { ok:false, reason|error }.
 */
export async function accessToken(env, { force = false } = {}) {
  if (!qboConfigured(env)) return { ok: false, reason: 'not_configured' };
  const conn = await getConnection(env);
  if (!conn) return { ok: false, reason: 'not_connected' };

  const t = now();
  if (!force && Number(conn.expires_at) - REFRESH_SKEW_MS > t) {
    return { ok: true, token: conn.access_token, conn };
  }
  // The refresh token itself can expire (~100 days) if nobody invoices for a quarter. Say so
  // precisely — "reconnect" is a different action from "try again".
  if (conn.refresh_expires_at && Number(conn.refresh_expires_at) <= t) {
    await noteError(env, 'The QuickBooks connection expired. Reconnect to continue.');
    return { ok: false, reason: 'reconnect_required', error: 'The QuickBooks connection expired. Reconnect to continue.' };
  }

  const res = await tokenCall(env, { grant_type: 'refresh_token', refresh_token: conn.refresh_token });
  if (!res.ok) {
    await noteError(env, res.error);
    return { ok: false, reason: 'reconnect_required', error: res.error };
  }
  // ROTATION: Intuit may return a new refresh token and invalidate the old one. It is written
  // here, in the same statement as the access token, so the two can never disagree.
  try {
    await saveTokens(env, {
      realmId: conn.realm_id,
      tok: { ...res.tok, refresh_token: res.tok.refresh_token || conn.refresh_token },
      environment: conn.environment,
      connectedBy: conn.connected_by,
    });
  } catch (e) {
    return { ok: false, error: 'Refreshed the QuickBooks token but could not store it. ' + String((e && e.message) || '').slice(0, 120) };
  }
  const fresh = await getConnection(env);
  return { ok: true, token: (fresh && fresh.access_token) || res.tok.access_token, conn: fresh || conn };
}

/** An authenticated QBO API call. Refreshes once on a 401 rather than failing the owner's click. */
export async function qboFetch(env, path, init = {}, { _retried = false } = {}) {
  const auth = await accessToken(env, { force: _retried });
  if (!auth.ok) return auth;

  const url = `${apiBase(auth.conn)}/v3/company/${auth.conn.realm_id}${path}`;
  let r;
  try {
    r = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, error: 'Could not reach QuickBooks. ' + String((e && e.message) || '').slice(0, 120) };
  }

  if (r.status === 401 && !_retried) return qboFetch(env, path, init, { _retried: true });

  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!r.ok) {
    // Intuit nests the useful part; surfacing "400 Bad Request" alone tells the owner nothing.
    const f = body && body.Fault && body.Fault.Error && body.Fault.Error[0];
    const detail = f ? `${f.Message}${f.Detail ? ' — ' + f.Detail : ''}` : text.slice(0, 160);
    await noteError(env, detail);
    return { ok: false, error: `QuickBooks rejected the request (${r.status}). ${detail}`, status: r.status };
  }
  return { ok: true, body };
}

// ---------- customers ----------

const esc = (s) => String(s || '').replace(/['\\]/g, '\\$&');

/**
 * The QBO customer for a contract account, creating it only if needed.
 * Reuses `contract_accounts.qbo_customer_id` when already mapped, then falls back to a name match
 * so a customer the bookkeeper already created by hand is adopted rather than duplicated —
 * duplicate customers are the thing that makes an accountant distrust an integration.
 */
export async function ensureCustomer(env, account) {
  if (!account) return { ok: false, error: 'No account.' };
  if (account.qbo_customer_id) return { ok: true, customer_id: String(account.qbo_customer_id), created: false };

  const name = String(account.name || '').trim();
  if (!name) return { ok: false, error: 'That account has no name to file under.' };

  const found = await qboFetch(env, `/query?query=${encodeURIComponent(`select Id, DisplayName from Customer where DisplayName = '${esc(name)}'`)}`, { method: 'GET' });
  if (!found.ok) return found;
  const hit = found.body && found.body.QueryResponse && found.body.QueryResponse.Customer && found.body.QueryResponse.Customer[0];

  let customerId = hit && hit.Id;
  let created = false;
  if (!customerId) {
    const payload = { DisplayName: name };
    if (account.billing_email) payload.PrimaryEmailAddr = { Address: account.billing_email };
    const made = await qboFetch(env, '/customer?minorversion=65', { method: 'POST', body: JSON.stringify(payload) });
    if (!made.ok) return made;
    customerId = made.body && made.body.Customer && made.body.Customer.Id;
    created = true;
  }
  if (!customerId) return { ok: false, error: 'QuickBooks did not return a customer id.' };

  try {
    await env.DB.prepare('UPDATE contract_accounts SET qbo_customer_id = ?, updated_at = ? WHERE id = ?')
      .bind(String(customerId), now(), account.id).run();
  } catch { /* the push can still proceed; it will re-resolve next time */ }
  return { ok: true, customer_id: String(customerId), created };
}

// ---------- the service item every line must reference ----------

// The name of the QBO Service item catering lines are billed under. One item, not one per bowl:
// the invoice's own Description carries the site and the count, and a bookkeeper wants a single
// income line to reconcile, not a product catalogue.
const ITEM_NAME = 'Catering';
const ITEM_SETTING = 'qbo.item_id';

async function cachedItemId(env) {
  try {
    const r = await env.DB.prepare('SELECT value FROM app_settings WHERE key = ?').bind(ITEM_SETTING).first();
    return (r && r.value) || null;
  } catch { return null; }
}

/**
 * The Item id to put on every invoice line.
 *
 * THIS IS NOT OPTIONAL. QuickBooks treats a SalesItemLineDetail line with no ItemRef as a
 * DESCRIPTION line and IGNORES its Amount — so an invoice built without one posts successfully and
 * books ZERO. That failure is invisible from our side (we get an invoice id back) and only shows
 * up as an empty invoice in the client's books.
 */
export async function ensureItem(env) {
  const cached = await cachedItemId(env);
  if (cached) return { ok: true, item_id: String(cached), created: false };

  const found = await qboFetch(env, `/query?query=${encodeURIComponent(`select Id, Name from Item where Name = '${esc(ITEM_NAME)}'`)}`, { method: 'GET' });
  if (!found.ok) return found;
  const hit = found.body && found.body.QueryResponse && found.body.QueryResponse.Item && found.body.QueryResponse.Item[0];

  let itemId = hit && hit.Id;
  let created = false;
  if (!itemId) {
    // A Service item REQUIRES an IncomeAccountRef, so the income account has to be resolved first.
    // Whichever the file already uses — we never create an account; chart-of-accounts structure is
    // the bookkeeper's decision, not ours.
    const acct = await qboFetch(env, `/query?query=${encodeURIComponent("select Id, Name from Account where AccountType = 'Income' and Active = true")}`, { method: 'GET' });
    if (!acct.ok) return acct;
    const income = acct.body && acct.body.QueryResponse && acct.body.QueryResponse.Account && acct.body.QueryResponse.Account[0];
    if (!income || !income.Id) {
      return { ok: false, error: 'No active income account in QuickBooks to book catering against. Add one, then try again.' };
    }
    const made = await qboFetch(env, '/item?minorversion=65', {
      method: 'POST',
      body: JSON.stringify({
        Name: ITEM_NAME, Type: 'Service', Active: true,
        IncomeAccountRef: { value: String(income.Id), name: income.Name || undefined },
      }),
    });
    if (!made.ok) return made;
    itemId = made.body && made.body.Item && made.body.Item.Id;
    created = true;
  }
  if (!itemId) return { ok: false, error: 'QuickBooks did not return an item id.' };

  try {
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
    ).bind(ITEM_SETTING, String(itemId), 'qbo', now()).run();
  } catch { /* re-resolved next time */ }
  return { ok: true, item_id: String(itemId), created };
}

// ---------- invoices ----------

// One line per site, matching how the emailed invoice and the printable page already read. The
// AMOUNTS ARE NOT RECOMPUTED — they come off the stored invoice row, so QuickBooks, the email and
// the PDF cannot disagree about what the client owes. That is the same rule invoiceEmailHtml
// follows in contracts.js.
//
// `itemId` is REQUIRED — see ensureItem. Passing nothing here would post a $0 invoice.
export function invoiceLines(inv, lineItems, itemId) {
  const money = (c) => Math.round(Number(c) || 0) / 100;
  const ref = { ItemRef: { value: String(itemId) } };
  const sites = (lineItems && lineItems.sites) || [];
  const lines = sites.map((s) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: money((s.subtotal_cents || 0) + (s.delivery_cents || 0) + (s.rush_cents || 0)),
    Description: `${s.name} — ${s.lunches} lunches${s.rush_cents ? ' (incl. rush)' : ''}`,
    SalesItemLineDetail: { ...ref, Qty: Number(s.lunches) || 0 },
  })).filter((l) => l.Amount > 0);

  // A total with no lines would post a zero invoice. Fall back to one line for the whole period
  // rather than silently booking nothing.
  if (!lines.length && Number(inv.total_cents) > 0) {
    return [{
      DetailType: 'SalesItemLineDetail',
      Amount: money(inv.total_cents),
      Description: `Catering — ${inv.period_from || ''} to ${inv.period_to || ''}`,
      SalesItemLineDetail: { ...ref, Qty: Number(inv.lunches) || 1 },
    }];
  }
  return lines;
}

/**
 * Push one contract invoice into QuickBooks. Idempotent: an invoice that already carries a
 * qbo_invoice_id is never posted twice — a duplicated invoice is a client asked to pay twice.
 */
export async function pushInvoice(env, { invoiceId }) {
  if (!qboConfigured(env)) return { ok: false, reason: 'not_configured' };
  if (!env.DB) return { ok: false, error: 'Database not configured.' };

  const inv = await env.DB.prepare('SELECT * FROM contract_invoices WHERE id = ?').bind(invoiceId).first().catch(() => null);
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.qbo_invoice_id) {
    return { ok: true, already: true, qbo_invoice_id: String(inv.qbo_invoice_id) };
  }
  if (inv.status === 'void') return { ok: false, error: 'That invoice is void — it should not be booked.' };

  const account = await env.DB.prepare('SELECT * FROM contract_accounts WHERE id = ?').bind(inv.account_id).first().catch(() => null);
  if (!account) return { ok: false, error: 'Account not found.' };

  const cust = await ensureCustomer(env, account);
  if (!cust.ok) return cust;
  // Resolved BEFORE building the payload, and a failure aborts: a line with no ItemRef posts an
  // invoice QuickBooks values at zero, which is worse than not posting at all because it looks
  // like it worked.
  const item = await ensureItem(env);
  if (!item.ok) return item;

  let lineItems = { sites: [] };
  try { lineItems = JSON.parse(inv.line_items || '{}') || { sites: [] }; } catch { lineItems = { sites: [] }; }
  const Line = invoiceLines(inv, lineItems, item.item_id);
  if (!Line.length) return { ok: false, error: 'That invoice has nothing to bill.' };

  const payload = {
    CustomerRef: { value: cust.customer_id },
    DocNumber: String(inv.number || inv.id).slice(0, 21),  // Intuit caps DocNumber at 21 chars
    Line,
    ...(account.billing_email ? { BillEmail: { Address: account.billing_email } } : {}),
    ...(inv.period_to ? { TxnDate: inv.period_to } : {}),
  };

  const made = await qboFetch(env, '/invoice?minorversion=65', { method: 'POST', body: JSON.stringify(payload) });
  if (!made.ok) return made;
  const qboId = made.body && made.body.Invoice && made.body.Invoice.Id;
  if (!qboId) return { ok: false, error: 'QuickBooks did not return an invoice id.' };

  // Written immediately: if this UPDATE is lost the next push creates a SECOND invoice in the
  // client's books, which is far worse than a missing link here.
  try {
    await env.DB.prepare('UPDATE contract_invoices SET qbo_invoice_id = ?, updated_at = ? WHERE id = ?')
      .bind(String(qboId), now(), inv.id).run();
  } catch {
    return { ok: true, qbo_invoice_id: String(qboId), degraded: 'link_not_saved' };
  }
  return { ok: true, qbo_invoice_id: String(qboId), customer_created: !!cust.created };
}

/** Best-effort revoke, then forget. Local state is cleared even if Intuit is unreachable. */
export async function disconnect(env) {
  const conn = await getConnection(env);
  if (conn && qboConfigured(env)) {
    try {
      await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { Authorization: basicAuth(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: conn.refresh_token }),
      });
    } catch { /* revoking is courtesy; forgetting is the point */ }
  }
  try { await env.DB.prepare("DELETE FROM qbo_connection WHERE id = 'qbo'").run(); } catch { /* nothing to forget */ }
  return { ok: true };
}
