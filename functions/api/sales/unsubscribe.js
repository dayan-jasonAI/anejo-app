// /api/sales/unsubscribe?t=<token> — the opt-out every prospect email carries.
//
//   GET  → a confirmation page with ONE button. It changes nothing.
//   POST → the opt-out: that button, or RFC 8058 one-click (List-Unsubscribe-Post) from the mail client.
//
// WHY A GET CHANGES NOTHING. Corporate mail security (Microsoft Safe Links, Mimecast, Proofpoint —
// routine at healthcare organizations) opens every link in an inbound message to scan it. An opt-out
// that fired on GET would unsubscribe prospects the moment the email arrived, silently, and record it
// as their choice. Mail clients use POST for one-click, and a person clicks the button; scanners do
// neither. CAN-SPAM allows the opt-out to take one visit to a single web page — this is that page.
//
// PUBLIC AND UNAUTHENTICATED BY DESIGN: an opt-out that needs a login is not an opt-out. The link
// carries a per-email RANDOM TOKEN, never the address, so a prospect's email is never in a URL,
// a browser history or a log line. The token resolves to the outreach row, and from it the address,
// which is then suppressed for prospecting everywhere and every sequence aimed at it stops.
import { limitOr429 } from '../../_lib/ratelimit.js';
import { recordSalesUnsubscribe, salesRow } from '../../_lib/sales/store.js';

const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function page(title, message, status = 200, extra = '') {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} — Añejo Catering Co.</title>
<div style="font-family:system-ui,-apple-system,sans-serif;background:#0d2419;color:#F5F2EC;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="max-width:440px;text-align:center">
    <div style="letter-spacing:.35em;font-weight:600;color:#C6A85B;margin-bottom:22px">AÑEJO</div>
    <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;margin:0 0 12px">${title}</h1>
    <p style="color:#cfd6cb;line-height:1.6;margin:0 0 22px">${message}</p>${extra}
  </div></div>`,
    { status, headers: HEADERS },
  );
}

async function rowFor(request, env) {
  const t = (new URL(request.url).searchParams.get('t') || '').trim();
  if (!/^[a-f0-9]{32}$/.test(t) || !env || !env.DB) return { t, row: null };
  const row = await salesRow(env, 'SELECT id, recipient_email, contact_id, organization_id FROM sales_outreach WHERE unsub_token = ?', t);
  return { t, row: row && row.recipient_email ? row : null };
}

// One-click from a mail client (and a person's button press) — both opt out immediately.
export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  let body = '';
  try { body = await request.text(); } catch { body = ''; }
  const oneClick = /List-Unsubscribe=One-Click/i.test(body);
  const { row } = await rowFor(request, env);
  if (!row) {
    return oneClick ? new Response('not found', { status: 404 })
      : page('Link incomplete', 'We could not match that link. Reply to the email with “unsubscribe” and we will remove you by hand.', 404);
  }
  const r = await recordSalesUnsubscribe(env, {
    email: row.recipient_email, contact_id: row.contact_id, organization_id: row.organization_id,
    source: oneClick ? 'one_click' : 'link', reason: 'unsubscribe link',
  });
  if (oneClick) return new Response(r.ok ? 'unsubscribed' : 'error', { status: r.ok ? 200 : 500 });
  return r.ok
    ? page('You’re unsubscribed', 'Añejo Catering Co. will not email you again. Thank you for letting us know.')
    : page('We couldn’t complete that', 'Something went wrong on our end. Reply to the email with “unsubscribe” and we will remove you by hand.', 500);
};

// The page a person lands on. Reads only; the button POSTs.
export const onRequestGet = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const { t, row } = await rowFor(request, env);
  if (!row) return page('Link incomplete', 'We could not match that link. Reply to the email with “unsubscribe” and we will remove you by hand.', 404);
  const already = await salesRow(env, "SELECT id FROM sales_unsubscribes WHERE email = ? AND channel IN ('email','all') LIMIT 1", String(row.recipient_email).toLowerCase());
  if (already) return page('You’re already unsubscribed', 'Añejo Catering Co. will not email you again.');
  return page('Unsubscribe from Añejo emails?', 'One click and we will not email you again.', 200,
    `<form method="post" action="/api/sales/unsubscribe?t=${t}"><input type="hidden" name="confirm" value="1">
      <button type="submit" style="background:#C6A85B;color:#1c1606;border:0;border-radius:999px;padding:14px 28px;font-weight:700;font-size:15px;cursor:pointer">Unsubscribe me</button></form>`);
};
