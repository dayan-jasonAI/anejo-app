// GET/POST /api/hub/owner/qbo — connect QuickBooks and push a contract invoice into it.
// Owner-only.
//
// QuickBooks is ADDITIVE. Invoices are generated, emailed and marked paid entirely in D1 today,
// and that keeps working whether or not this is ever connected. Nothing here can change what a
// client owes — it copies a stored invoice into the books.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { qboConfigured, getConnection, authorizeUrl, redirectUri, pushInvoice, disconnect } from '../../../_lib/qbo.js';

const STATE_TTL_SEC = 600;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const conn = await getConnection(env);
  const t = now();
  // Say which of the three states this is in, because they need three different actions:
  // nothing to do (no app credentials), connect, or reconnect.
  const configured = qboConfigured(env);
  const expired = !!(conn && conn.refresh_expires_at && Number(conn.refresh_expires_at) <= t);
  return json({
    ok: true,
    configured,
    connected: !!conn && !expired,
    needs_reconnect: !!conn && expired,
    realm_id: (conn && conn.realm_id) || null,
    environment: (conn && conn.environment) || null,
    connected_at: (conn && conn.connected_at) || null,
    refreshed_at: (conn && conn.refreshed_at) || null,
    last_error: (conn && conn.last_error) || null,
    // Shown so a redirect_uri_mismatch — the most common setup failure, and one whose error
    // message says nothing useful — can be diagnosed by reading it off the screen.
    redirect_uri: configured ? redirectUri(env, request) : null,
    setup: configured ? null : 'Set QBO_CLIENT_ID and QBO_CLIENT_SECRET (Cloudflare Pages secrets) from an Intuit developer app, then reload.',
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';

  if (op === 'connect') {
    if (!qboConfigured(env)) return bad('QuickBooks is not set up yet — add QBO_CLIENT_ID and QBO_CLIENT_SECRET first.', 400);
    // CSRF nonce: the callback refuses any `state` it did not issue, so a link someone else
    // crafted cannot bind a stranger's QuickBooks company to this HUB.
    const state = crypto.randomUUID();
    if (env.SESSIONS) {
      try {
        await env.SESSIONS.put(`qbo_state:${state}`, ctx.distinct_id || '1', { expirationTtl: STATE_TTL_SEC });
      } catch { return bad('Could not start the connection. Try again.', 500); }
    }
    return json({ ok: true, url: authorizeUrl(env, request, state) });
  }

  if (op === 'disconnect') {
    await disconnect(env);
    await capture(env, {
      event: 'qbo.disconnected',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: {},
    });
    return json({ ok: true, connected: false });
  }

  if (op === 'push_invoice') {
    const invoiceId = String((b && b.invoice_id) || '').trim();
    if (!invoiceId) return bad('Missing invoice_id.');
    const r = await pushInvoice(env, { invoiceId });
    if (!r.ok) {
      if (r.reason === 'not_configured') return bad('QuickBooks is not set up yet.', 400);
      if (r.reason === 'not_connected') return bad('QuickBooks is not connected yet.', 400);
      if (r.reason === 'reconnect_required') return bad(r.error || 'Reconnect QuickBooks to continue.', 409);
      return bad(r.error || 'Could not send that invoice to QuickBooks.', 502);
    }
    await capture(env, {
      event: 'qbo.invoice_pushed',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { invoice_id: invoiceId, already: !!r.already, customer_created: !!r.customer_created },
    });
    // "already" is reported rather than hidden: the owner pressed a button and deserves to know
    // it did nothing BECAUSE the work was already done, not because it failed.
    return json(r);
  }

  return bad('Unknown action.');
};
