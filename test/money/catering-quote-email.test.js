// The catering quote email.
//
// Before 2026-09-09 there was no quote email at all: createDepositCheckout() minted the Square
// link and handed the URL back to the Hub for Dayan to paste somewhere himself. This is that
// email, and these are the properties that make it safe to send to a paying customer.
//
// The one that bit us in the first render: the Spanish email printed its TERMS in English,
// because termsFor() only ever produced English copy. A payment link wrapped in a language the
// customer did not choose reads as a phishing attempt, which is the one thing a money email
// must never look like.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cateringQuoteEmail, imageUrl, longDate, clockTime } from '../../functions/_lib/catering_quote_email.js';
import { termsFor, renderLines, DEPOSIT_PCT } from '../../functions/_lib/catering_terms.js';

const LINES = [
  { name: 'Lechón asado — 30 servings', name_es: 'Lechón asado — 30 porciones',
    detail: '3 × 10-serving tray', detail_es: '3 bandejas de 10 porciones',
    qty: 30, cents: 30000, image: 'menu-launch/food-lechon-10.webp' },
  { name: 'Sausage croquetas — 50 pieces', name_es: 'Croquetas de salchicha — 50 unidades',
    qty: 50, cents: 7500, image: 'menu-launch/food-croq-pollo-50.webp' },
];

const terms = termsFor({ totalCents: 81587, depositCents: 40794, balanceCents: 40793,
                         eventDate: '2026-09-15', today: '2026-09-09' });

const build = (lang) => cateringQuoteEmail({
  lang, customerName: 'Ana', eventDate: '2026-09-15', eventTime: '19:00', guests: 30,
  quoteId: 'cq_A7F2K9', lines: LINES,
  subtotalCents: 83250, discountCents: 1663, totalCents: 81587,
  depositCents: 40794, depositPct: DEPOSIT_PCT, balanceCents: 40793,
  balanceDueDate: terms.balance_due_date,
  depositUrl: 'https://square.link/u/DEP',
  modifyUrl: 'https://anejocateringco.com/quote/cq_A7F2K9?t=TOK',
  termsLines: renderLines(terms, lang),
  altLangUrl: 'https://anejocateringco.com/quote/cq_A7F2K9?lang=en',
});

// ---------------------------------------------------------------- bilingual, all the way down

test('the Spanish email contains no English customer copy — terms included', () => {
  const { html, subject } = build('es');
  assert.match(subject, /Su cotización de catering/);
  // The exact phrases that leaked in the first render.
  for (const leak of ['Deposit:', 'Balance:', 'Changed your mind', 'Final guest count',
                      'Reserve your date', 'Modify my order', 'Need to change something',
                      'Your menu', 'Volume discount', 'See it in 3D']) {
    assert.ok(!html.includes(leak), `English leaked into the Spanish email: "${leak}"`);
  }
  for (const want of ['Depósito:', 'Saldo:', 'Su menú', 'Reserve su fecha',
                      'Modificar mi pedido', 'Descuento por volumen', 'Verla en 3D']) {
    assert.ok(html.includes(want), `missing Spanish copy: "${want}"`);
  }
});

test('the English email is the mirror image, with no Spanish left in it', () => {
  const { html, subject } = build('en');
  assert.match(subject, /Your Añejo catering quote/);
  for (const leak of ['Depósito:', 'Su menú', 'Modificar mi pedido', 'Reserve su fecha']) {
    assert.ok(!html.includes(leak), `Spanish leaked into the English email: "${leak}"`);
  }
  assert.ok(html.includes('Your menu') && html.includes('Modify my order'));
});

test('item names follow the language, falling back rather than blanking', () => {
  assert.ok(build('es').html.includes('Croquetas de salchicha'));
  assert.ok(build('en').html.includes('Sausage croquetas'));
  // A line with no Spanish name must still render its English one, never an empty row.
  const one = cateringQuoteEmail({ lang: 'es', lines: [{ name: 'Pan con lechón', qty: 2, cents: 500 }],
    depositUrl: 'https://x.test/d', modifyUrl: 'https://x.test/m' });
  assert.ok(one.html.includes('Pan con lechón'));
});

test('dates and times are localised, not printed raw', () => {
  assert.match(longDate('2026-09-15', 'es'), /septiembre/);
  assert.match(longDate('2026-09-15', 'en'), /September/);
  assert.equal(clockTime('19:00', 'en'), '7:00 PM');
  assert.equal(clockTime('19:00', 'es'), '7:00 p. m.');
  assert.equal(clockTime('09:30', 'en'), '9:30 AM');
  // Garbage in stays garbage out rather than becoming a wrong date.
  assert.equal(longDate('not a date', 'en'), 'not a date');
  assert.equal(clockTime('brunch', 'en'), 'brunch');
});

// ---------------------------------------------------------------- it has to survive an inbox

test('every asset and link is absolute — a relative one is always broken in mail', () => {
  const { html } = build('es');
  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 6, 'expected images and links to assert over');
  for (const u of srcs) {
    assert.match(u, /^https:\/\//, `relative or insecure URL in an email: ${u}`);
  }
});

test('layout is tables — no flex, grid or float reaches Outlook', () => {
  const { html } = build('en');
  for (const banned of ['display:flex', 'display:grid', 'float:', 'position:absolute']) {
    assert.ok(!html.includes(banned), `${banned} does not render in Word-based Outlook`);
  }
  assert.ok(html.includes('role="presentation"'), 'layout tables must be hidden from screen readers');
});

test('a menu image path becomes a full URL, and nothing becomes nothing', () => {
  assert.equal(imageUrl('menu-launch/food-lechon.webp'), 'https://anejocateringco.com/assets/img/menu-launch/food-lechon.webp');
  assert.equal(imageUrl('/assets/img/x.png'), 'https://anejocateringco.com/assets/img/x.png');
  assert.equal(imageUrl('https://cdn.example.com/x.png'), 'https://cdn.example.com/x.png');
  for (const empty of ['', null, undefined, '   ']) assert.equal(imageUrl(empty), null);
});

test('a line with no photo still renders a row, not a broken image', () => {
  const { html } = cateringQuoteEmail({ lang: 'en', lines: [{ name: 'Custom platter', qty: 1, cents: 4200 }],
    depositUrl: 'https://x.test/d', modifyUrl: 'https://x.test/m' });
  assert.ok(html.includes('Custom platter'));
  assert.ok(!html.includes('src=""'), 'an empty src is a broken-image icon in every client');
});

test('there is a plain-text twin carrying the payment link', () => {
  const { text } = build('es');
  assert.ok(text.includes('https://square.link/u/DEP'));
  assert.ok(!text.includes('pay=full'), 'no dead pay-in-full link in the text part');
  assert.ok(text.includes('anejocateringco.com/quote/cq_A7F2K9'));
  assert.match(text, /Depósito/, 'the text twin is bilingual too');
  assert.ok(text.length > 400, 'a stub text part makes the HTML look like spam');
});

// ---------------------------------------------------------------- the money

test('the deposit is the ONLY way to pay, and there is no dead button beside it', () => {
  // Pay-in-full pointed at /order?quote=<token>&pay=full and NOTHING read that parameter: the
  // customer landed on an empty shop and had to rebuild her order. A quote carrying a button that
  // dead-ends is worse than a quote with one button, so it is gone until a real full-payment
  // Square link exists (Dayan, 2026-09-09).
  const { html, text } = build('es');
  assert.ok(html.includes('https://square.link/u/DEP'), 'deposit link');
  assert.ok(html.includes('Pagar depósito del 50% · $407.94'));
  assert.ok(!/Pagar el total/.test(html), 'no pay-in-full button');
  assert.ok(!/pay=full/.test(html), 'and no link to the route that does not read it');
  assert.ok(!/pay=full/.test(text), 'not in the text part either');
  assert.ok(!/Dos formas/.test(html), 'and the heading no longer promises two');
});

test('the email formats the figures it is given and never derives its own', () => {
  // Deliberately inconsistent numbers: if the template did arithmetic it would "correct" them,
  // and then the email and the card would disagree. It must print exactly what it was handed.
  const { html } = cateringQuoteEmail({ lang: 'en', lines: LINES,
    subtotalCents: 100000, discountCents: 5000, totalCents: 11111,
    depositCents: 22222, balanceCents: 33333, depositPct: 0.5,
    depositUrl: 'https://x.test/d', modifyUrl: 'https://x.test/m' });
  assert.ok(html.includes('$111.11'), 'the total as given');
  assert.ok(html.includes('$222.22'), 'the deposit as given');
  assert.ok(html.includes('$333.33'), 'the balance as given');
});

test('the subtotal and discount rows appear only when there is a discount', () => {
  const withD = build('en').html;
  assert.ok(withD.includes('Subtotal') && withD.includes('Volume discount'));
  const noD = cateringQuoteEmail({ lang: 'en', lines: LINES, subtotalCents: 37500,
    discountCents: 0, totalCents: 37500, depositCents: 18750, balanceCents: 18750,
    depositUrl: 'https://x.test/d', modifyUrl: 'https://x.test/m' }).html;
  assert.ok(!noD.includes('Volume discount'), 'never show "you saved $0.00"');
});

// ---------------------------------------------------------------- what Dayan asked to be in it

test('the theme-design promise is in both languages', () => {
  assert.ok(build('es').html.includes('El diseño de su tema llega por separado'));
  assert.ok(build('en').html.includes('Your theme design is coming separately'));
});

test('the cajita upsell closes the email and links to the 3D builder', () => {
  for (const lang of ['es', 'en']) {
    const { html } = build(lang);
    assert.ok(html.includes('https://anejocateringco.com/cajita-builder.html'), `${lang}: 3D link`);
    assert.ok(html.includes('La Cajita'), `${lang}: the product name`);
    assert.ok(html.includes('cajitas-collection.webp'), `${lang}: shown, not just described`);
    // It must sit AFTER the quote card closes, so it reads as a postscript, not a line item.
    assert.ok(html.indexOf('La Cajita') > html.indexOf('Modif'), `${lang}: upsell must come last`);
  }
});

test('a language switch is offered when the caller supplies one', () => {
  assert.ok(build('es').html.includes('View in English'));
  assert.ok(build('en').html.includes('Ver en español'));
});

// ---------------------------------------------------------------- untrusted input

test("a customer's own name cannot inject markup", () => {
  const { html } = cateringQuoteEmail({ lang: 'en', customerName: '<script>alert(1)</script>',
    lines: [{ name: '<img onerror=alert(1)>', qty: 1, cents: 100 }],
    depositUrl: 'https://x.test/"><script>bad()</script>', modifyUrl: 'https://x.test/m' });
  // What matters is that no user string ever opens a TAG — the escaped text may still contain
  // the words "onerror" or "script", and that is harmless because the angle bracket is gone.
  assert.ok(!html.includes('<script>'), 'script tag survived escaping');
  assert.ok(!/<img[^>]*onerror/i.test(html), 'a live tag was built from user input');
  assert.ok(!html.includes('"><script'), 'the url broke out of its attribute');
  assert.ok(html.includes('&lt;script&gt;'), 'and it is shown as text instead');
  assert.ok(html.includes('&lt;img onerror'), 'the item name is shown, escaped');
});

test('an empty quote still produces a sendable email rather than throwing', () => {
  const { html, text, subject } = cateringQuoteEmail({});
  assert.ok(subject && html && text);
  assert.ok(html.includes('AÑEJO'), 'the shell survives with no data at all');
});
