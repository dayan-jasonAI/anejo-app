// catering_quote_email.js — the quote a catering client actually receives.
// Files under _lib are NOT routed.
//
// Until now nothing was ever sent: createDepositCheckout() minted the Square link and handed the
// URL back to the Hub for Dayan to paste into a message himself. This module is that missing
// email (Dayan, 2026-09-09).
//
// FOUR RULES THIS FILE EXISTS TO KEEP
//
//   1. ABSOLUTE URLS ON EVERY ASSET. A relative src resolves against the mail client, not the
//      site, so it is always a broken image in an inbox. Same for every link.
//   2. TABLES, NOT FLEX. Outlook's rendering engine is Word. Layout is <table>, spacing is
//      cellpadding and explicit <td> padding, and there is no float, flex or grid anywhere.
//   3. THE MONEY IS QUOTED, NEVER RECOMPUTED. Every figure arrives already decided by
//      catering_deposit.js against the live menu. This file formats; it does not price. A
//      template that can do arithmetic is a template that can disagree with the card.
//   4. BOTH LANGUAGES, ALWAYS. Every customer-visible string is in COPY under `en` and `es`.
//      A missing key must fail loudly in review, not ship as English inside a Spanish email.
import { escHtml } from './email.js';

const SITE = 'https://anejocateringco.com';
const HEADER_BG = '#163414';
const GOLD = '#ae8745';
const GOLD_LIGHT = '#C8BC6E';
const INK = '#20392e';
const CREAM = '#fffdf7';
const RULE = '#e6e1d3';
const MUTED = '#6b7268';

const money = (cents) => `$${(Math.round(Number(cents) || 0) / 100).toFixed(2)}`;

// An image field on a menu row is a path under /assets/img/ ('menu-launch/food-lechon.webp').
// It may already be absolute or root-relative; anything else gets the prefix. Returns null for
// nothing at all, so the caller can lay out a row with no thumbnail rather than a broken one.
export function imageUrl(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return SITE + s;
  return `${SITE}/assets/img/${s}`;
}

const DATE_FMT = {
  en: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  es: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
};

/** YYYY-MM-DD → "Tuesday, September 15, 2026" / "martes, 15 de septiembre de 2026". */
export function longDate(dateStr, lang = 'en') {
  const ms = Date.parse(String(dateStr || '') + 'T12:00:00Z');
  if (!Number.isFinite(ms)) return String(dateStr || '');
  try {
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { ...DATE_FMT[lang === 'es' ? 'es' : 'en'], timeZone: 'UTC' })
      .format(new Date(ms));
  } catch { return String(dateStr || ''); }
}

/** 24h "19:00" → "7:00 PM". Left alone if it is not a time. */
export function clockTime(t, lang = 'en') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return String(t || '');
  const h = Number(m[1]);
  const suffix = h < 12 ? (lang === 'es' ? 'a. m.' : 'AM') : (lang === 'es' ? 'p. m.' : 'PM');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

const COPY = {
  en: {
    preheader: (t) => `Your Añejo catering quote — ${t}. Reserve your date with 50% today.`,
    subject: (d) => `Your Añejo catering quote — ${d}`,
    hello: (n) => (n ? `${n},` : 'Hello,'),
    intro: 'Thank you for trusting us with your celebration. Here is your quote, itemised exactly as you asked for it.',
    eventFor: 'Event',
    guests: 'Guests',
    serving: 'Serving',
    yourMenu: 'Your menu',
    qty: 'Qty',
    subtotal: 'Subtotal',
    discount: 'Volume discount',
    total: 'Total',
    payHead: 'Two ways to confirm',
    payNote: (p) => `Reserve your date with ${p} today, or settle the whole thing now — whichever suits you. Either one confirms the booking.`,
    payDeposit: (a, p) => `Pay ${p} deposit · ${a}`,
    payFull: (a) => `Pay in full · ${a}`,
    balanceNote: (a, d) => `Remaining balance ${a}, due ${d}.`,
    modifyHead: 'Need to change something?',
    modifyBody: 'Adjust quantities, add a dish, or change your guest count. Your quote updates and we are notified straight away.',
    modifyCta: 'Modify my order',
    termsHead: 'The terms in plain English',
    themeHead: 'Your theme design is coming separately',
    themeBody: 'Our design team is working on the labels and cajita artwork for your theme. That arrives in its own email as soon as it is ready — nothing for you to do now.',
    upsellEyebrow: 'New from Añejo',
    upsellHead: 'La Cajita',
    upsellBody: 'The whole meal, built to travel and finished by hand. Guests open a box, not a buffet line — and every one can carry the theme of your event.',
    upsellCta: 'See it in 3D',
    upsellPrice: 'From $17.50 each · trays of 10, 25 and 50',
    questions: 'Questions, or something not right? Reply to this email or call us. A person reads every one.',
    langSwitch: 'Ver en español',
    footerAddr: 'Añejo Catering Co. · Palm Beach County, Florida',
    quoteRef: 'Quote',
  },
  es: {
    preheader: (t) => `Su cotización de catering de Añejo — ${t}. Reserve su fecha con el 50% hoy.`,
    subject: (d) => `Su cotización de catering de Añejo — ${d}`,
    hello: (n) => (n ? `${n},` : 'Hola,'),
    intro: 'Gracias por confiarnos su celebración. Aquí tiene su cotización, detallada exactamente como la solicitó.',
    eventFor: 'Evento',
    guests: 'Invitados',
    serving: 'Se sirve',
    yourMenu: 'Su menú',
    qty: 'Cant.',
    subtotal: 'Subtotal',
    discount: 'Descuento por volumen',
    total: 'Total',
    payHead: 'Dos formas de confirmar',
    payNote: (p) => `Reserve su fecha con el ${p} hoy, o pague el total ahora — como prefiera. Cualquiera de las dos confirma la reserva.`,
    payDeposit: (a, p) => `Pagar depósito del ${p} · ${a}`,
    payFull: (a) => `Pagar el total · ${a}`,
    balanceNote: (a, d) => `Saldo restante ${a}, con vencimiento el ${d}.`,
    modifyHead: '¿Necesita cambiar algo?',
    modifyBody: 'Ajuste cantidades, agregue un plato o cambie el número de invitados. Su cotización se actualiza y nos avisa de inmediato.',
    modifyCta: 'Modificar mi pedido',
    termsHead: 'Los términos, en palabras claras',
    themeHead: 'El diseño de su tema llega por separado',
    themeBody: 'Nuestro equipo de diseño está trabajando en las etiquetas y el arte de la cajita para su tema. Le llegará en un correo aparte en cuanto esté listo — no tiene que hacer nada ahora.',
    upsellEyebrow: 'Nuevo en Añejo',
    upsellHead: 'La Cajita',
    upsellBody: 'La comida completa, hecha para viajar y terminada a mano. Sus invitados abren una caja, no una fila de buffet — y cada una puede llevar el tema de su evento.',
    upsellCta: 'Verla en 3D',
    upsellPrice: 'Desde $17.50 cada una · bandejas de 10, 25 y 50',
    questions: '¿Preguntas, o algo que no está bien? Responda a este correo o llámenos. Una persona lee cada uno.',
    langSwitch: 'View in English',
    footerAddr: 'Añejo Catering Co. · Condado de Palm Beach, Florida',
    quoteRef: 'Cotización',
  },
};

// Gold pill button. `full:true` makes it span the column — used for the two payment actions so
// neither reads as the secondary one.
function button(href, label, { solid = true, full = false } = {}) {
  const bg = solid ? GOLD : 'transparent';
  const fg = solid ? '#ffffff' : INK;
  const border = solid ? GOLD : RULE;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;${full ? 'width:100%;' : ''}">
    <tr><td align="center" style="border-radius:6px;background:${bg};border:1px solid ${border}">
      <a href="${escHtml(href)}" style="display:block;padding:14px 26px;font-family:Georgia,serif;font-size:15px;
        line-height:1;color:${fg};text-decoration:none;letter-spacing:.02em;font-weight:bold">${escHtml(label)}</a>
    </td></tr></table>`;
}

function lineRow(line, lang) {
  const name = escHtml((lang === 'es' ? (line.name_es || line.name) : line.name) || '');
  const detail = escHtml((lang === 'es' ? (line.detail_es || line.detail) : line.detail) || '');
  const img = imageUrl(line.image);
  const thumb = img
    ? `<img src="${escHtml(img)}" alt="" width="56" height="56"
         style="display:block;border:0;outline:none;border-radius:5px;object-fit:cover;background:#f0ece1">`
    : `<div style="width:56px;height:56px;border-radius:5px;background:#f0ece1"></div>`;
  return `<tr>
    <td width="56" style="padding:11px 12px 11px 0;vertical-align:top;line-height:0">${thumb}</td>
    <td style="padding:11px 10px 11px 0;vertical-align:top;font-family:Georgia,serif;font-size:14px;color:${INK};line-height:1.4">
      ${name}${detail ? `<div style="font-size:12px;color:${MUTED};padding-top:3px">${detail}</div>` : ''}
    </td>
    <td width="44" align="right" style="padding:11px 10px 11px 0;vertical-align:top;font-family:Georgia,serif;font-size:13px;color:${MUTED};white-space:nowrap">${escHtml(String(line.qty ?? ''))}</td>
    <td width="76" align="right" style="padding:11px 0;vertical-align:top;font-family:Georgia,serif;font-size:14px;color:${INK};white-space:nowrap">${money(line.cents)}</td>
  </tr>`;
}

function totalsRow(label, value, { strong = false, credit = false } = {}) {
  const color = credit ? '#2f6b4f' : INK;
  const size = strong ? '19px' : '14px';
  const weight = strong ? 'bold' : 'normal';
  return `<tr>
    <td colspan="3" align="right" style="padding:${strong ? '11px' : '5px'} 10px ${strong ? '11px' : '5px'} 0;
      font-family:Georgia,serif;font-size:${size};font-weight:${weight};color:${strong ? INK : MUTED};
      ${strong ? `border-top:2px solid ${INK};` : ''}">${escHtml(label)}</td>
    <td align="right" style="padding:${strong ? '11px' : '5px'} 0;font-family:Georgia,serif;font-size:${size};
      font-weight:${weight};color:${color};white-space:nowrap;${strong ? `border-top:2px solid ${INK};` : ''}">${credit ? '−' : ''}${money(value)}</td>
  </tr>`;
}

/**
 * Build the quote email.
 *
 * Everything monetary is passed in already decided — see rule 3 at the top of this file.
 * Returns { subject, html, text }.
 */
export function cateringQuoteEmail({
  lang = 'en',
  customerName,
  eventDate,
  eventTime,
  guests,
  quoteId,
  lines = [],
  subtotalCents = 0,
  discountCents = 0,
  totalCents = 0,
  depositCents = 0,
  depositPct = 0.5,
  balanceCents = 0,
  balanceDueDate,
  depositUrl,
  payFullUrl,
  modifyUrl,
  termsLines = [],
  altLangUrl,
} = {}) {
  const L = lang === 'es' ? 'es' : 'en';
  const c = COPY[L];
  const pctLabel = `${Math.round(Number(depositPct) * 100)}%`;
  const dateLong = longDate(eventDate, L);
  const cajitaUrl = `${SITE}/cajita-builder.html`;

  const meta = [
    [c.eventFor, dateLong],
    guests ? [c.guests, String(guests)] : null,
    eventTime ? [c.serving, clockTime(eventTime, L)] : null,
  ].filter(Boolean);

  const inner = `
  <!-- preheader: the grey line an inbox shows next to the subject. Hidden in the body. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(c.preheader(money(totalCents)))}</div>

  <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:19px;color:${INK}">${escHtml(c.hello(customerName))}</p>
  <p style="margin:0 0 22px;font-family:Georgia,serif;font-size:15px;line-height:1.65;color:${INK}">${escHtml(c.intro)}</p>

  <!-- Event facts -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border-collapse:collapse;background:#f6f2e7;border-radius:8px;margin:0 0 26px">
    <tr><td style="padding:16px 18px">
      ${meta.map(([k, v]) => `<div style="font-family:Georgia,serif;font-size:14px;color:${INK};padding:3px 0">
        <span style="color:${MUTED};font-size:11px;letter-spacing:.12em;text-transform:uppercase">${escHtml(k)}</span><br>${escHtml(v)}</div>`).join('')}
    </td></tr>
  </table>

  <!-- Itemised menu -->
  <p style="margin:0 0 10px;font-family:Georgia,serif;font-size:12px;letter-spacing:.14em;
    text-transform:uppercase;color:${GOLD};font-weight:bold">${escHtml(c.yourMenu)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 26px">
    ${lines.map((l) => lineRow(l, L)).join('')}
    ${discountCents > 0 ? totalsRow(c.subtotal, subtotalCents) : ''}
    ${discountCents > 0 ? totalsRow(c.discount, discountCents, { credit: true }) : ''}
    ${totalsRow(c.total, totalCents, { strong: true })}
  </table>

  <!-- The two ways to pay -->
  <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:12px;letter-spacing:.14em;
    text-transform:uppercase;color:${GOLD};font-weight:bold">${escHtml(c.payHead)}</p>
  <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${INK}">${escHtml(c.payNote(pctLabel))}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
    <tr><td style="padding:0 0 10px">${button(depositUrl, c.payDeposit(money(depositCents), pctLabel), { solid: true, full: true })}</td></tr>
    ${payFullUrl ? `<tr><td style="padding:0 0 10px">${button(payFullUrl, c.payFull(money(totalCents)), { solid: false, full: true })}</td></tr>` : ''}
  </table>
  <p style="margin:0 0 28px;font-family:Georgia,serif;font-size:13px;color:${MUTED}">${escHtml(c.balanceNote(money(balanceCents), balanceDueDate || ''))}</p>

  <!-- Modify -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border-collapse:collapse;border:1px solid ${RULE};border-radius:8px;margin:0 0 26px">
    <tr><td style="padding:18px">
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:16px;color:${INK}">${escHtml(c.modifyHead)}</p>
      <p style="margin:0 0 14px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:${MUTED}">${escHtml(c.modifyBody)}</p>
      ${button(modifyUrl, c.modifyCta, { solid: false })}
    </td></tr>
  </table>

  <!-- Theme design note -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border-collapse:collapse;background:#f6f2e7;border-left:3px solid ${GOLD};margin:0 0 26px">
    <tr><td style="padding:15px 18px">
      <p style="margin:0 0 5px;font-family:Georgia,serif;font-size:15px;color:${INK}">${escHtml(c.themeHead)}</p>
      <p style="margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.6;color:${MUTED}">${escHtml(c.themeBody)}</p>
    </td></tr>
  </table>

  <!-- Terms -->
  ${termsLines.length ? `<p style="margin:0 0 8px;font-family:Georgia,serif;font-size:12px;letter-spacing:.14em;
    text-transform:uppercase;color:${GOLD};font-weight:bold">${escHtml(c.termsHead)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 24px">
    ${termsLines.map((t) => `<tr><td style="padding:0 0 9px;font-family:Georgia,serif;font-size:13px;
      line-height:1.6;color:${MUTED}">${escHtml(t)}</td></tr>`).join('')}
  </table>` : ''}

  <p style="margin:0;font-family:Georgia,serif;font-size:13px;line-height:1.6;color:${MUTED}">${escHtml(c.questions)}</p>
  `;

  // The cajita upsell sits OUTSIDE the cream card, on the dark ground, so it reads as a closing
  // note rather than another line item on the quote.
  const upsell = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border-collapse:collapse;max-width:520px;margin:16px auto 0;background:${HEADER_BG};border-radius:16px;overflow:hidden">
    <tr><td style="padding:0;line-height:0">
      <img src="${SITE}/assets/img/menu-launch/cajitas-collection.webp" alt="" width="520"
        style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none">
    </td></tr>
    <tr><td style="padding:24px 28px 28px">
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:11px;letter-spacing:.16em;
        text-transform:uppercase;color:${GOLD_LIGHT}">${escHtml(COPY[L].upsellEyebrow)}</p>
      <p style="margin:0 0 10px;font-family:Georgia,serif;font-size:27px;letter-spacing:.02em;color:${GOLD_LIGHT}">${escHtml(COPY[L].upsellHead)}</p>
      <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:14px;line-height:1.65;color:#ded9c8">${escHtml(COPY[L].upsellBody)}</p>
      <p style="margin:0 0 18px;font-family:Georgia,serif;font-size:12px;color:#9aa892">${escHtml(COPY[L].upsellPrice)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
        <tr><td align="center" style="border-radius:6px;border:1px solid ${GOLD_LIGHT}">
          <a href="${cajitaUrl}" style="display:block;padding:12px 24px;font-family:Georgia,serif;font-size:14px;
            line-height:1;color:${GOLD_LIGHT};text-decoration:none;letter-spacing:.03em">${escHtml(COPY[L].upsellCta)} →</a>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  const langLink = altLangUrl
    ? `<div style="text-align:center;padding:14px 0 0;font-family:Georgia,serif;font-size:12px">
        <a href="${escHtml(altLangUrl)}" style="color:${GOLD_LIGHT};text-decoration:underline">${escHtml(c.langSwitch)}</a></div>`
    : '';

  const html = `<div style="background:#0b1f0a;padding:32px 0;font-family:Georgia,serif">
  <div style="max-width:520px;margin:0 auto;background:${CREAM};border-radius:16px;overflow:hidden">
    <div style="background:${HEADER_BG};padding:16px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>
        <td width="53" style="vertical-align:middle;padding-right:13px;line-height:0"><img src="${SITE}/assets/img/email_emblem.png"
          alt="" width="40" height="38" style="display:block;border:0;outline:none"></td>
        <td style="vertical-align:middle;color:${GOLD_LIGHT};font-family:Georgia,serif;font-size:22px;letter-spacing:3px;white-space:nowrap;padding-right:16px">AÑEJO</td>
        <td align="right" style="vertical-align:middle;color:#8fa088;font-family:Georgia,serif;font-size:11px;letter-spacing:.08em">
          ${quoteId ? escHtml(`${c.quoteRef} ${quoteId}`) : ''}</td>
      </tr></table>
    </div>
    <div style="padding:28px;color:${INK};font-size:15px;line-height:1.6">${inner}</div>
    <div style="padding:18px 28px;color:#8a8a8a;font-size:12px;border-top:1px solid #eee;font-family:Georgia,serif">
      ${escHtml(c.footerAddr)}
    </div>
  </div>
  ${upsell}
  ${langLink}
</div>`;

  // Plain-text twin. Some clients show only this, and a quote that is unreadable there reads as
  // a scam — which is the one thing a payment link must never look like.
  const text = [
    c.hello(customerName),
    '',
    c.intro,
    '',
    `${c.eventFor}: ${dateLong}`,
    guests ? `${c.guests}: ${guests}` : null,
    eventTime ? `${c.serving}: ${clockTime(eventTime, L)}` : null,
    '',
    c.yourMenu.toUpperCase(),
    ...lines.map((l) => `  ${l.qty} × ${(L === 'es' ? (l.name_es || l.name) : l.name)} — ${money(l.cents)}`),
    '',
    discountCents > 0 ? `${c.subtotal}: ${money(subtotalCents)}` : null,
    discountCents > 0 ? `${c.discount}: −${money(discountCents)}` : null,
    `${c.total}: ${money(totalCents)}`,
    '',
    c.payNote(pctLabel),
    `${c.payDeposit(money(depositCents), pctLabel)}: ${depositUrl || ''}`,
    payFullUrl ? `${c.payFull(money(totalCents))}: ${payFullUrl}` : null,
    c.balanceNote(money(balanceCents), balanceDueDate || ''),
    '',
    `${c.modifyHead} ${modifyUrl || ''}`,
    '',
    `${c.themeHead} — ${c.themeBody}`,
    '',
    ...(termsLines.length ? [c.termsHead.toUpperCase(), ...termsLines.map((t) => `  · ${t}`), ''] : []),
    c.questions,
    '',
    `${COPY[L].upsellHead} — ${COPY[L].upsellBody} ${cajitaUrl}`,
    '',
    c.footerAddr,
  ].filter((x) => x !== null).join('\n');

  return { subject: c.subject(dateLong), html, text };
}

export { COPY as QUOTE_EMAIL_COPY };
