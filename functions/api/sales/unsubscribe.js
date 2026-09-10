// /api/sales/unsubscribe?t=<token> — the opt-out every prospect email carries.
//
//   GET  → a human confirmation page (the footer link)
//   POST → one-click (RFC 8058 List-Unsubscribe-Post)
//
// PUBLIC AND UNAUTHENTICATED BY DESIGN, like /api/unsubscribe: an opt-out that needs a login is not
// an opt-out. Unlike that endpoint, the link carries a per-email RANDOM TOKEN, never the address —
// a prospect's email must not sit in a URL, in a browser history or in a log line.
//
// The token resolves to the outreach row, and from it the address: that address is suppressed for
// prospecting everywhere (every organization it appears under), and every sequence aimed at it stops.
import { limitOr429 } from '../../_lib/ratelimit.js';
import { recordSalesUnsubscribe, salesRow } from '../../_lib/sales/store.js';

function page(title, message, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} — Añejo Catering Co.</title>
<div style="font-family:system-ui,-apple-system,sans-serif;background:#0d2419;color:#F5F2EC;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="max-width:440px;text-align:center">
    <div style="letter-spacing:.35em;font-weight:600;color:#C6A85B;margin-bottom:22px">AÑEJO</div>
    <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;margin:0 0 12px">${title}</h1>
    <p style="color:#cfd6cb;line-height:1.6;margin:0 0 22px">${message}</p>
  </div></div>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}

async function optOut(request, env, source) {
  const t = (new URL(request.url).searchParams.get('t') || '').trim();
  if (!/^[a-f0-9]{32}$/.test(t) || !env || !env.DB) return { ok: false, missing: true };
  const row = await salesRow(env, 'SELECT id, recipient_email, contact_id, organization_id FROM sales_outreach WHERE unsub_token = ?', t);
  if (!row || !row.recipient_email) return { ok: false, missing: true };
  const r = await recordSalesUnsubscribe(env, {
    email: row.recipient_email, contact_id: row.contact_id, organization_id: row.organization_id,
    source, reason: 'unsubscribe link',
  });
  return { ok: !!r.ok };
}

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const r = await optOut(request, env, 'one_click');
  return new Response(r.ok ? 'unsubscribed' : 'not found', { status: r.ok ? 200 : 404 });
};

export const onRequestGet = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'sales_unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const r = await optOut(request, env, 'link');
  if (r.ok) return page('You’re unsubscribed', 'Añejo Catering Co. will not email you again. Thank you for letting us know.');
  if (r.missing) return page('Link incomplete', 'We could not match that link. Reply to the email with “unsubscribe” and we will remove you by hand.', 404);
  return page('We couldn’t complete that', 'Something went wrong on our end. Reply to the email with “unsubscribe” and we will remove you by hand.', 500);
};
