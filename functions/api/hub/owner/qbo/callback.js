// GET /api/hub/owner/qbo/callback — where Intuit sends the owner back after approving the connection.
//
// This is a BROWSER redirect target, not an API call: Intuit navigates the owner here, so it must
// answer with a page, never JSON. It ends by bouncing to the finance desk with a short result in
// the query string, so the outcome is read in the HUB rather than as a bare status code.
//
// Auth is the `state` nonce issued by op:'connect', not a session — a redirect arriving from
// Intuit may not carry one. Any state this HUB did not issue is refused, so nobody can bind their
// own QuickBooks company to this install by sending Dayan a link.
import { exchangeCode } from '../../../../_lib/qbo.js';

const DEST = '/hub/owner/finance.html';

function bounce(origin, params) {
  const u = new URL(DEST, origin);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, String(v).slice(0, 200));
  return Response.redirect(u.toString(), 302);
}

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');

  // The owner pressed Cancel on Intuit's screen. Not an error worth alarming them about.
  if (denied) return bounce(origin, { qbo: 'cancelled' });
  if (!code || !realmId) return bounce(origin, { qbo: 'error', qbo_msg: 'QuickBooks did not send a company to connect.' });

  // Single-use: delete the nonce before doing any work, so a replayed callback cannot re-run the
  // exchange.
  let connectedBy = null;
  if (env.SESSIONS && state) {
    try {
      connectedBy = await env.SESSIONS.get(`qbo_state:${state}`);
      if (connectedBy) await env.SESSIONS.delete(`qbo_state:${state}`);
    } catch { connectedBy = null; }
  }
  if (env.SESSIONS && !connectedBy) {
    return bounce(origin, { qbo: 'error', qbo_msg: 'That connection link expired or was not started here. Press Connect again.' });
  }

  const res = await exchangeCode(env, request, { code, realmId, connectedBy });
  if (!res.ok) {
    return bounce(origin, {
      qbo: 'error',
      qbo_msg: res.reason === 'not_configured' ? 'QuickBooks is not set up yet.' : (res.error || 'Could not finish connecting.'),
    });
  }
  return bounce(origin, { qbo: 'connected', realm: res.realm_id });
};
