// catering_quote_delivery.js — getting the quote to the customer, by email and by text.
// Files under _lib are NOT routed.
//
// Dayan, 2026-09-09: "the catering quote must be sent out via text and email — the email how I
// described it, and the text with the link to the HTML email or their account login where the
// quote will be sitting."
//
// FIVE RULES THIS FILE KEEPS
//
//   1. THE PAGE AND THE EMAIL ARE ONE ARTIFACT. /q/<token> renders the same HTML that was
//      emailed, from the same function. Two renderers would drift, and the customer would end up
//      arguing from a page that says something the email did not.
//   2. THE LINK IS A SECRET, NOT AN ID. Quote ids are guessable; a page served on one would let
//      anybody walk the table and read other people's names, phones and totals.
//   3. TEXTING IS CONSENT-GATED. `sms_consent` was collected with wording about order updates.
//      A quote for something they asked for is squarely that — but no consent, no text, and the
//      email still goes. We never fall back to a phone number nobody agreed to.
//   4. A FAILED SEND NEVER LOSES THE QUOTE. The row and the Square link are written first. If
//      email or SMS fails, that is recorded on the row and reported; the booking still exists.
//   5. SENDING IS IDEMPOTENT PER CHANNEL. email_sent_at / sms_sent_at mean "already delivered";
//      a retry re-sends only the channel that has not landed.
import { sendEmail, isSuppressed } from './email.js';
import { sendSms, isTwilioConfigured } from './twilio.js';
import { cateringQuoteEmail } from './catering_quote_email.js';
import { renderLines, DEPOSIT_PCT } from './catering_terms.js';

const SITE = 'https://anejocateringco.com';

/** A quote's public address. 32 hex chars from the platform CSPRNG — not Math.random. */
export function mintAccessToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const quoteUrl = (token, base = SITE) => `${base}/q/${token}`;

// E.164-ish. Twilio wants a leading +; a US ten-digit number is the common case from the form.
export function normalizePhone(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : null;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

const money = (cents) => `$${(Math.round(Number(cents) || 0) / 100).toFixed(2)}`;

// The text. Deliberately short: one line of what it is, the number, the link, and who it is from.
// No emoji, no marketing — a link in an unexpected text is already asking for trust.
export function quoteSms({ customerName, totalCents, eventDate, url, lang = 'en' }) {
  const name = String(customerName || '').trim().split(/\s+/)[0];
  if (lang === 'es') {
    return [
      name ? `Hola ${name}, aquí está su cotización de Añejo` : 'Aquí está su cotización de Añejo',
      `${eventDate ? `para el ${eventDate} · ` : ''}${money(totalCents)}`,
      url,
      'Puede verla, modificarla o reservar su fecha desde ese enlace. — Añejo Catering Co.',
    ].join('\n');
  }
  return [
    name ? `Hi ${name}, here is your Añejo catering quote` : 'Here is your Añejo catering quote',
    `${eventDate ? `for ${eventDate} · ` : ''}${money(totalCents)}`,
    url,
    'View it, change it, or book your date from that link. — Añejo Catering Co.',
  ].join('\n');
}

/**
 * Turn a stored quote row into the arguments cateringQuoteEmail() wants.
 * Pure. Shared by the send path and the hosted page, so the two cannot disagree.
 */
export function quoteEmailArgs(row, { lang, baseUrl = SITE } = {}) {
  const language = lang || row.lang || 'en';
  let breakdown = null;
  try { breakdown = row.quote_json ? JSON.parse(row.quote_json) : null; } catch { /* a bad blob shows as no lines, never a crash */ }
  let terms = null;
  try { terms = row.terms_json ? JSON.parse(row.terms_json) : null; } catch { /* same */ }

  const url = quoteUrl(row.access_token, baseUrl);
  return {
    lang: language,
    customerName: row.customer_name,
    eventDate: row.event_date,
    eventTime: breakdown?.event_time || null,
    guests: row.guests,
    quoteId: row.id,
    lines: Array.isArray(breakdown?.lines) ? breakdown.lines : [],
    subtotalCents: breakdown?.subtotal_cents ?? row.total_cents,
    discountCents: breakdown?.discount_cents ?? 0,
    totalCents: row.total_cents,
    depositCents: row.deposit_cents,
    depositPct: Number(row.deposit_pct) || DEPOSIT_PCT,
    balanceCents: row.balance_cents,
    balanceDueDate: terms?.balance_due_date || row.balance_due_date || null,
    depositUrl: row.payment_link_url,
    // Pay-in-full goes through the ordinary checkout carrying this quote, so the customer is
    // never asked to pay a deposit they did not want.
    payFullUrl: `${baseUrl}/order?quote=${encodeURIComponent(row.access_token)}&pay=full`,
    modifyUrl: `${url}?edit=1`,
    termsLines: terms ? renderLines(terms, language) : [],
    altLangUrl: `${url}?lang=${language === 'es' ? 'en' : 'es'}`,
  };
}

/**
 * Send one quote to its customer.
 *
 * Returns { ok, email: {...}, sms: {...} }. NEVER throws on a provider failure — the caller has
 * already written the row and minted a payment link, and losing that because Resend was down
 * would be the worse outcome by a distance.
 */
export async function sendQuote(env, row, { baseUrl = SITE, force = false } = {}) {
  const result = { ok: true, quote_id: row?.id || null, email: { sent: false }, sms: { sent: false } };
  if (!row || !row.access_token) {
    return { ...result, ok: false, error: 'This quote has no access token, so there is no link to send.' };
  }
  const lang = row.lang === 'es' ? 'es' : 'en';
  const url = quoteUrl(row.access_token, baseUrl);
  const t = Date.now();

  // ---------------------------------------------------------------- email
  if (row.email_sent_at && !force) {
    result.email = { sent: false, skipped: 'already sent' };
  } else if (!row.customer_email) {
    result.email = { sent: false, skipped: 'no email address on the quote' };
  } else if (await isSuppressed(env, row.customer_email).catch(() => false)) {
    // A previous hard bounce or unsubscribe. Sending anyway is how a sending domain dies.
    result.email = { sent: false, skipped: 'address is suppressed' };
  } else {
    const { subject, html, text } = cateringQuoteEmail(quoteEmailArgs(row, { lang, baseUrl }));
    // sendEmail THROWS on a provider error and returns the Resend body on success; a suppressed
    // address comes back as { skipped: true }. There is no `.ok` on it — checking for one is how
    // a successful send reads as a failure.
    const sent = await sendEmail(env, {
      to: row.customer_email,
      subject,
      html,
      text,
      // Two sends of the same quote must not produce two emails in her inbox.
      idempotencyKey: `catering-quote:${row.id}:${lang}`,
    }).catch((e) => ({ error: String((e && e.message) || e).slice(0, 200) }));
    if (sent && sent.error) result.email = { sent: false, error: sent.error };
    else if (sent && sent.skipped) result.email = { sent: false, skipped: `address is suppressed (${sent.suppressed || 'unknown'})` };
    else result.email = { sent: true, at: t };
  }

  // ---------------------------------------------------------------- text
  const phone = normalizePhone(row.customer_phone);
  const consented = row.sms_consent === 1 || row.sms_consent === true;
  if (row.sms_sent_at && !force) {
    result.sms = { sent: false, skipped: 'already sent' };
  } else if (!phone) {
    result.sms = { sent: false, skipped: row.customer_phone ? 'phone number is not textable' : 'no phone number on the quote' };
  } else if (!consented) {
    // Rule 3. The email still went; this is not an error, it is a boundary.
    result.sms = { sent: false, skipped: 'no SMS consent on file' };
  } else if (!isTwilioConfigured(env)) {
    result.sms = { sent: false, skipped: 'SMS is not configured' };
  } else {
    const body = quoteSms({
      customerName: row.customer_name, totalCents: row.total_cents,
      eventDate: row.event_date, url, lang,
    });
    const sent = await sendSms(env, { to: phone, body, thread_id: `catering-quote:${row.id}` })
      .catch((e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 200) }));
    result.sms = sent && sent.sent ? { sent: true, at: t } : { sent: false, error: (sent && sent.error) || (sent && sent.noop ? 'SMS is not configured' : 'send failed') };
  }

  // ---------------------------------------------------------------- record it on the row
  const errors = [result.email.error, result.sms.error].filter(Boolean);
  if (env?.DB) {
    try {
      await env.DB.prepare(
        `UPDATE catering_quotes SET
           email_sent_at = COALESCE(?1, email_sent_at),
           sms_sent_at   = COALESCE(?2, sms_sent_at),
           delivery_error = ?3,
           updated_at = ?4
         WHERE id = ?5`
      ).bind(
        result.email.sent ? t : null,
        result.sms.sent ? t : null,
        errors.length ? errors.join(' · ').slice(0, 300) : null,
        t, row.id,
      ).run();
    } catch (e) {
      // The customer has the quote; we just could not write that down. Say so, do not fail.
      result.record_error = String((e && e.message) || e).slice(0, 200);
    }
  }

  result.ok = result.email.sent || result.sms.sent;
  if (!result.ok) result.error = errors.join(' · ') || 'nothing could be sent';
  return result;
}
