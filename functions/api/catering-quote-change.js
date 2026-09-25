// A customer asking for her quote to change.
//
// Reached from /q/<token>?edit=1 — the "Modify my order" button — and from her account page.
//
// TWO WAYS IN, BOTH PROVED SERVER-SIDE. The access token is 128 bits of entropy, it names exactly
// one quote, and it is the same secret that lets her see the quote at all; a customer should never
// need an account to say "make it 35 people". A signed-in session is the other way, and it is
// matched against the quote's OWN customer_email — never an address the caller supplies — so
// having an account does not let anybody reach somebody else's event.
//
// WHAT THIS DELIBERATELY DOES NOT DO: reprice anything. It writes down what she asked for and
// tells Dayan. Prices are his decision — that is the whole point of the line editor in the Hub —
// and a self-service repricing would hand the menu's ladder the authority he took back. Her
// quote's total, deposit, terms and payment link are untouched by this endpoint.
import { json, bad } from '../_lib/util.js';
import { sendEmail } from '../_lib/email.js';
import { currentUser } from '../_lib/session.js';

const MAX_MESSAGE = 1200;
const MAX_ITEMS = 24;
const SITE = 'https://anejocateringco.com';

// What she can ask for. Anything else is refused rather than stored as an unknown string, so the
// Hub never has to guess how to render a request.
const KINDS = new Set(['message', 'add_items', 'guests', 'cajita', 'dietary']);

// A line she picked off the catalogue. NO MONEY CROSSES THIS BOUNDARY: the customer sends what she
// wants and how many, and the price stays the owner's to set in the Hub — the same reason this
// endpoint has never repriced a quote.
function readItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const x of raw.slice(0, MAX_ITEMS)) {
    const name = String((x && x.name) || '').trim().slice(0, 120);
    if (!name) continue;
    const qty = Math.round(Number(x && x.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 999) continue;
    const id = String((x && x.id) || '').trim().slice(0, 64) || null;
    out.push({ id, name, qty });
  }
  return out;
}

/** One line per item, for the owner's email and for the Hub. */
const itemLines = (items) => items.map((i) => `${i.qty} × ${i.name}`);

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

  const token = String(b?.token || '').trim();
  const quoteId = String(b?.quote_id || '').trim();
  const hasToken = /^[a-f0-9]{32}$/.test(token);
  // A malformed token is refused identically to an unknown one, so this cannot be used to probe
  // which tokens exist. Without one we fall through to the session path below.
  if (!hasToken && !quoteId) return bad('That link is not valid.', 404);
  if (!env?.DB) return bad('Not available right now.', 503);

  const kind = KINDS.has(String(b?.kind || '')) ? String(b.kind) : 'message';
  const items = kind === 'add_items' ? readItems(b?.items) : [];
  const message = String(b?.message || '').trim().slice(0, MAX_MESSAGE);

  // Every kind must carry something real. "Add items" with nothing selected and no note is not a
  // request, and recording it would show her a pending row that says nothing.
  if (kind === 'add_items' && !items.length && !message) return bad('Choose what you would like to add.');
  if (kind !== 'add_items' && kind !== 'guests' && !message) return bad('Tell us what you would like to change.');

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
    quote = hasToken
      ? await env.DB.prepare(
        'SELECT id, customer_name, customer_email, event_date, guests, total_cents, lang FROM catering_quotes WHERE access_token = ?'
      ).bind(token).first()
      : await env.DB.prepare(
        'SELECT id, customer_name, customer_email, event_date, guests, total_cents, lang FROM catering_quotes WHERE id = ?'
      ).bind(quoteId).first();
  } catch { return bad('Could not reach your quote. Please try again.', 500); }
  if (!quote) return bad('That link is not valid.', 404);

  // Reached by quote id rather than by token: the session has to BE this customer. The comparison
  // is against the address on the quote, not one the caller sent, and a mismatch reads exactly like
  // an unknown quote so a signed-in customer cannot enumerate other people's events.
  if (!hasToken) {
    const sess = await currentUser(env, request);
    const mine = sess && sess.email && quote.customer_email
      && String(sess.email).trim().toLowerCase() === String(quote.customer_email).trim().toLowerCase();
    if (!mine) return bad('That link is not valid.', 404);
  }

  if (kind === 'guests' && guests == null) return bad('Tell us the new guest count.');

  const lang = quote.lang === 'es' ? 'es' : 'en';
  const now = Date.now();
  const rowId = id();

  // THE REQUEST IS WRITTEN BEFORE ANYBODY IS TOLD. If the notification fails, she has still been
  // heard and the Hub still shows it; if this insert fails, she is told so rather than thanked for
  // a message that went nowhere.
  try {
    await env.DB.prepare(
      `INSERT INTO catering_quote_changes
         (id, quote_id, guests, message, customer_name, customer_email, lang, created_at, kind, items_json, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,'open')`
    ).bind(
      rowId, quote.id, guests,
      // Every row keeps a readable sentence even when the ask was structured, so the Hub, the email
      // and her own account can all show the same thing without re-deriving it three ways.
      message || itemLines(items).join(', ') || 'Change requested',
      quote.customer_name || null, quote.customer_email || null, lang, now,
      kind, items.length ? JSON.stringify(items) : null
    ).run();
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
  ${items.length ? `<p><b>Items requested</b></p><ul>${itemLines(items).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
  ${guests ? `<p>New guest count requested: <b>${guests}</b> (quote says ${esc(quote.guests)}).</p>` : ''}
  <p>Event ${esc(quote.event_date || 'not set')} · quoted $${(quote.total_cents / 100).toFixed(2)} · ${esc(quote.customer_email || 'no email on file')}</p>
  <p><a href="${SITE}/hub/owner/catering">Open the catering desk</a> — nothing has been changed on her quote.</p>
</div>`,
        text: `${quote.customer_name || 'A customer'} asked to change her quote.\n\n${message}\n\n`
          + (items.length ? `Items requested:\n${itemLines(items).map((l) => '  ' + l).join('\n')}\n` : '')
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
