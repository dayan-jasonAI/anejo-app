// /api/unsubscribe — the opt-out every marketing email must carry.
//
//   GET  ?a=<address>&c=<email|sms|all>  → human-facing confirmation page (link in the footer)
//   POST ?a=<address>&c=…                → one-click (RFC 8058 List-Unsubscribe-Post)
//
// PUBLIC AND UNAUTHENTICATED BY DESIGN. An opt-out that requires signing in is not an opt-out —
// CAN-SPAM requires it to work without the recipient doing anything but click, and Gmail/Yahoo
// bulk-sender rules require the one-click POST. The worst an attacker can do here is unsubscribe
// someone else from marketing, which is recoverable and vastly less harmful than a broken opt-out.
// Transactional mail (receipts, magic links, delivery notices) is unaffected — those are not
// marketing and are not something a customer opts out of here.
import { recordUnsubscribe } from '../_lib/audience.js';
import { limitOr429 } from '../_lib/ratelimit.js';

const CHANNELS = ['email', 'sms', 'all'];

function page(title, message) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} — Añejo Catering Co.</title>
<div style="font-family:system-ui,-apple-system,sans-serif;background:#0d2419;color:#F5F2EC;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="max-width:440px;text-align:center">
    <div style="letter-spacing:.35em;font-weight:600;color:#C6A85B;margin-bottom:22px">AÑEJO</div>
    <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;margin:0 0 12px">${title}</h1>
    <p style="color:#cfd6cb;line-height:1.6;margin:0 0 22px">${message}</p>
    <p style="font-size:13px;color:#8fa08c">You'll still get order confirmations and delivery updates for anything you buy — those aren't marketing.</p>
    <p style="margin-top:26px"><a href="/" style="color:#C6A85B">anejocateringco.com</a></p>
  </div></div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

async function optOut(request, env) {
  const url = new URL(request.url);
  const address = (url.searchParams.get('a') || '').trim();
  const c = (url.searchParams.get('c') || 'email').trim();
  const channel = CHANNELS.includes(c) ? c : 'email';
  if (!address) return { ok: false, title: 'Link incomplete', msg: 'That unsubscribe link is missing its address. Reply to any Añejo email and we will take you off by hand.' };

  const done = await recordUnsubscribe(env, { address, channel, source: 'link', reason: 'unsubscribe link' });
  return done
    ? { ok: true, title: 'You’re unsubscribed', msg: `We won’t send ${channel === 'sms' ? 'marketing texts' : channel === 'all' ? 'marketing messages' : 'marketing emails'} to <strong>${address.replace(/[<>&]/g, '')}</strong> again.` }
    : { ok: false, title: 'We couldn’t complete that', msg: 'Something went wrong on our end. Reply to any Añejo email and we will remove you by hand — you do not need to try again.' };
}

// One-click. Must return 200 quickly and take no further interaction.
export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const r = await optOut(request, env);
  return new Response(r.ok ? 'unsubscribed' : 'error', { status: r.ok ? 200 : 500 });
};

export const onRequestGet = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'unsub', limit: 30, windowSec: 60 });
  if (limited) return limited;
  const r = await optOut(request, env);
  return page(r.title, r.msg);
};
