// A customer asking for her quote to change.
//
// Reached only from /q/<token>?edit=1 — the "Modify my order" button, which until now pointed at a
// parameter nothing read. The access token IS the authentication: it is 128 bits of entropy, it
// names exactly one quote, and it is the same secret that lets her see the quote at all. There is
// no session here and there must not be; a customer should never need an account to say "make it
// 35 people".
//
// WHAT THIS DELIBERATELY DOES NOT DO: reprice anything. It writes down what she asked for and
// tells Dayan. Prices are his decision — that is the whole point of the line editor in the Hub —
// and a self-service repricing would hand the menu's ladder the authority he took back. Her
// quote's total, deposit, terms and payment link are untouched by this endpoint.
import { json, bad } from '../_lib/util.js';
import { sendEmail } from '../_lib/email.js';

const MAX_MESSAGE = 1200;
const SITE = 'https://anejocateringco.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const id = () => {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return 'cqc_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export const onRequestPost = async ({ request, env }) => {
  let b = null;
  try { b = await request.json(); } catch { return bad('Send JSON.'); }

  // Same guard the quote page uses. A malformed token is refused before it ever reaches the
  // database, and it is refused identically to an unknown one so this cannot be used to probe
  // which tokens exist.
  const token = String(b?.token || '').trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return bad('That link is not valid.', 404);
  if (!env?.DB) return bad('Not available right now.', 503);

  const message = String(b?.message || '').trim().slice(0, MAX_MESSAGE);
  if (!message) return bad('Tell us what you would like to change.');

  // Guests is optional — "add a dish" changes nothing about the headcount. When it is given it has
  // to be a sane whole number; a bad one is a refusal rather than a silently dropped field, so she
  // is never told her new count was recorded when it was not.
  let guests = null;
  if (b?.guests != null && b.guests !== '') {
    const g = Math.round(Number(b.guests));
    if (!Number.isFinite(g) || g <= 0 || g > 100000) return bad('That guest count does not look right.');
    guests = g;
  }

  let quote = null;
  try {
    quote = await env.DB.prepare(
      'SELECT id, customer_name, customer_email, event_date, guests, total_cents, lang FROM catering_quotes WHERE access_token = ?'
    ).bind(token).first();
  } catch { return bad('Could not reach your quote. Please try again.', 500); }
  if (!quote) return bad('That link is not valid.', 404);

  const lang = quote.lang === 'es' ? 'es' : 'en';
  const now = Date.now();
  const rowId = id();

  // THE REQUEST IS WRITTEN BEFORE ANYBODY IS TOLD. If the notification fails, she has still been
  // heard and the Hub still shows it; if this insert fails, she is told so rather than thanked for
  // a message that went nowhere.
  try {
    await env.DB.prepare(
      `INSERT INTO catering_quote_changes
         (id, quote_id, guests, message, customer_name, customer_email, lang, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(rowId, quote.id, guests, message, quote.customer_name || null, quote.customer_email || null, lang, now).run();
  } catch {
    return bad('We could not record that. Please reply to the email instead.', 500);
  }

  // Tell the owner. This is an INTERNAL notification, not a customer send — the preview law covers
  // what goes TO a customer, and nothing here does.
  const to = String(env.OWNER_BCC || env.OWNER_EMAIL || '').trim();
  let notifyError = null;
  if (to) {
    try {
      await sendEmail(env, {
        to,
        subject: `Quote change requested — ${quote.customer_name || 'a customer'} · ${quote.event_date || 'no date'}`,
        html: `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.6;color:#0b1f0a">
  <p><b>${esc(quote.customer_name || 'A customer')}</b> asked to change her quote.</p>
  <p style="white-space:pre-wrap;padding:12px 14px;background:#f6f2e7;border-left:3px solid #ae8745">${esc(message)}</p>
  ${guests ? `<p>New guest count requested: <b>${guests}</b> (quote says ${esc(quote.guests)}).</p>` : ''}
  <p>Event ${esc(quote.event_date || 'not set')} · quoted $${(quote.total_cents / 100).toFixed(2)} · ${esc(quote.customer_email || 'no email on file')}</p>
  <p><a href="${SITE}/hub/owner/catering">Open the catering desk</a> — nothing has been changed on her quote.</p>
</div>`,
        text: `${quote.customer_name || 'A customer'} asked to change her quote.\n\n${message}\n\n`
          + (guests ? `New guest count requested: ${guests} (quote says ${quote.guests}).\n` : '')
          + `Event ${quote.event_date || 'not set'} · quoted $${(quote.total_cents / 100).toFixed(2)}\n`
          + `${SITE}/hub/owner/catering — nothing has been changed on her quote.`,
      });
      await env.DB.prepare('UPDATE catering_quote_changes SET notified_at = ? WHERE id = ?').bind(Date.now(), rowId).run();
    } catch (e) {
      notifyError = String((e && e.message) || e).slice(0, 200);
      try {
        await env.DB.prepare('UPDATE catering_quote_changes SET notify_error = ? WHERE id = ?').bind(notifyError, rowId).run();
      } catch { /* the request is recorded; failing to note the failure must not fail the request */ }
    }
  }

  // She is told the truth either way: it is recorded. Whether an email reached Dayan a second later
  // is not something to make her responsible for.
  return json({
    ok: true,
    recorded: true,
    message: lang === 'es'
      ? 'Recibido. Le enviaremos una cotización actualizada — no se ha cobrado nada.'
      : 'Got it. We will send you an updated quote — nothing has been charged.',
  });
};
