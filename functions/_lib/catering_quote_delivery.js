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
//   5. SENDING IS IDEMPOTENT PER CHANNEL. email_sent_at / sms_sent_at mean provider acceptance was recorded;
//      a retry re-sends only the channel that has not landed.
import { sendEmail, isSuppressed, normalizeEmail } from './email.js';
import { isTwilioConfigured } from './twilio.js';
import { leadForPhone, ensureCateringConversation, sendCateringSms, cateringSmsOptedOut } from './catering_conversation.js';
import { cateringQuoteEmail } from './catering_quote_email.js';
import { renderLines, DEPOSIT_PCT } from './catering_terms.js';
import { loadMenu } from './menu.js';

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

// Historical owner-written lines did not retain catalog IDs or images. These explicit
// aliases identify the three dishes in the affected quote; no substring/fuzzy food matching.
const LEGACY_IMAGE_PRODUCTS = {
  'hawaiian roll with spread': 'traditional_bocadito',
  'yuca, onion & chicharrones · 6 oz per serving': 'traditional_yuca',
  'roast pork · 6 oz per serving': 'catering_lechon-10',
};
const exactName = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Resolve display assets only. Never replace quoted names, quantities, or prices. */
export function quoteLinesWithImages(lines, menu) {
  const items = Array.isArray(menu?.items) ? menu.items : [];
  return lines.map(line => {
    if (line.image) return { ...line };
    const id = line.menu_item_id || line.product_id || line.sku || line.id || LEGACY_IMAGE_PRODUCTS[exactName(line.name)];
    let candidates = id ? items.filter(item => item.id === id) : items.filter(item =>
      [item.name, item.name_es].some(name => name && [line.name, line.name_es].some(n => n && exactName(n) === exactName(name))));
    // Several exact-name rows may exist only when they all point to the same picture.
    const images = [...new Set(candidates.map(item => item.image || item.img).filter(Boolean))];
    return images.length === 1 ? { ...line, image: images[0] } : { ...line };
  });
}

/** Shared asynchronous adapter used by email sending and the hosted quote. */
export async function loadQuoteEmailArgs(env, row, options = {}) {
  const menu = await loadMenu(env);
  return quoteEmailArgs(row, { ...options, menu });
}

/**
 * Turn a stored quote row into the arguments cateringQuoteEmail() wants.
 * Pure. Shared by the send path and the hosted page, so the two cannot disagree.
 */
export function quoteEmailArgs(row, { lang, baseUrl = SITE, menu } = {}) {
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
    lines: quoteLinesWithImages(Array.isArray(breakdown?.lines) ? breakdown.lines : [], menu),
    deliveryFeeCents: Number.isInteger(breakdown?.delivery_fee_cents) && breakdown.delivery_fee_cents >= 0 ? breakdown.delivery_fee_cents : null,
    deliveryFeeConfirmed: Number.isInteger(breakdown?.delivery_fee_cents) && breakdown.delivery_fee_cents >= 0,
    recommendations: Array.isArray(breakdown?.recommendations) ? breakdown.recommendations : [],
    subtotalCents: breakdown?.subtotal_cents ?? row.total_cents,
    discountCents: breakdown?.discount_cents ?? 0,
    totalCents: row.total_cents,
    depositCents: row.deposit_cents,
    depositPct: Number(row.deposit_pct) || DEPOSIT_PCT,
    balanceCents: row.balance_cents,
    balanceDueDate: terms?.balance_due_date || row.balance_due_date || null,
    depositUrl: row.payment_link_url,
    // NO PAY-IN-FULL URL. It used to point at /order?quote=<token>&pay=full, and nothing reads
    // that parameter — the customer landed on an empty shop and had to rebuild her order. A quote
    // must not carry a button that dead-ends, so the option is gone until there is a real
    // full-payment Square link to send her to.
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
export async function sendQuote(env, row, { baseUrl = SITE, force = false, reviewedEmail = null } = {}) {
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
    const { subject, html, text } = reviewedEmail || cateringQuoteEmail(await loadQuoteEmailArgs(env, row, { lang, baseUrl }));
    // sendEmail THROWS on a provider error and returns the Resend body on success; a suppressed
    // address comes back as { skipped: true }. There is no `.ok` on it — checking for one is how
    // a successful send reads as a failure.
    // The owner's own copy of exactly what the customer received. Dayan asked for this on
    // 2026-09-09 and the reason is the same one that put OWNER_BCC on invoice mail: without it,
    // the only record of what a client was actually sent lives in Resend. Skipped when it would
    // duplicate the recipient — quoting yourself is a real case while testing.
    const ownerBcc = normalizeEmail(env.OWNER_BCC || '');
    const bcc = (ownerBcc && ownerBcc.includes('@') && ownerBcc !== normalizeEmail(row.customer_email))
      ? ownerBcc : null;
    const sent = await sendEmail(env, {
      to: row.customer_email,
      subject,
      html,
      text,
      ...(bcc ? { bcc } : {}),
      // Two sends of the same quote must not produce two emails in her inbox.
      idempotencyKey: `catering-quote:${row.id}:${lang}`,
    }).catch((e) => ({ error: String((e && e.message) || e).slice(0, 200) }));
    if (sent && sent.error) result.email = { sent: false, error: sent.error };
    else if (sent && sent.skipped) result.email = { sent: false, skipped: `address is suppressed (${sent.suppressed || 'unknown'})` };
    else if(typeof sent?.id==='string' && /^[A-Za-z0-9_-]{1,192}$/.test(sent.id)) result.email = { sent: true, at: t, receipt_id:sent.id, provider_accepted:true,delivery_verified:false,owner_copy: Boolean(bcc) };
    else result.email={sent:false,error:'Provider acceptance is unverified; reconcile before retrying.'};
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
  } else if (env.DB && await cateringSmsOptedOut(env,phone)) {
    result.sms = { sent:false, skipped:'Customer has opted out of text messages.' };
  } else if (!isTwilioConfigured(env)) {
    result.sms = { sent: false, skipped: 'SMS is not configured' };
  } else {
    const body = quoteSms({
      customerName: row.customer_name, totalCents: row.total_cents,
      eventDate: row.event_date, url, lang,
    });
    let lead = null;
    try {
      const detail = typeof row.quote_json === 'string' ? JSON.parse(row.quote_json) : row.quote_json;
      if (row.lead_id || detail?.lead_id) lead = await env.DB.prepare("SELECT id,name,phone,sms_consent FROM leads WHERE id=? AND kind='catering'").bind(row.lead_id || detail.lead_id).first();
      if (!lead) lead = await leadForPhone(env,phone);
    } catch { /* standalone quote retains a named conversation */ }
    const thread = await ensureCateringConversation(env,{lead,quote:row});
    const sent = await sendCateringSms(env, {thread,lead:{phone,sms_consent:consented?1:0},body,
      actorId:null,requestId:`quote_sms_${row.id}`})
      .catch((e) => ({ok:false,error:String(e?.message||e).slice(0,200)}));
    if(sent.record_error)result.conversation_error=sent.record_error;
    result.sms = sent.ok ? {sent:true,at:t,...sent.sms,thread_id:thread.id,replayed:!!sent.replayed}
      : {sent:false,error:sent.error||'SMS outcome could not be verified; reconcile before retrying.'};
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
