// The gift reveal, and the two gates that decide whether anybody ever sees it.
//
// Dayan, 2026-09-10: "no deposit means no gift animation, she is only getting this if she makes
// the payment."
//
// There are TWO conditions, not one, and the second is the one that protects the kitchen:
//
//   1. deposit_status === 'paid'. Only the Square webhook writes that.
//   2. the quote's own quote_json carries a `gift`.
//
// Without (2), the reveal would play for EVERY customer who pays a catering deposit — and it says
// a tres leches is included, on the house. That would be promising a free cake to every booking
// Añejo takes. A gift is a decision recorded on one quote, never a behaviour of the checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/q/[token].js';
import { cakeRevealHtml, GIFTS } from '../../functions/_lib/cake_reveal.js';

const TOKEN = 'c40f9379fe49c015aa511c7fe5326765';

const QUOTE = {
  id: 'cq_test', customer_name: 'Karina', customer_email: 'k@example.test', customer_phone: null,
  event_date: '2026-09-26', guests: 30,
  total_cents: 48500, deposit_pct: 0.5, deposit_cents: 24250, balance_cents: 24250,
  deposit_status: 'unpaid', balance_due_date: '2026-09-25',
  payment_link_url: 'https://sq.link/deposit', access_token: TOKEN, lang: 'es',
  terms_json: JSON.stringify({ version: 't', balance_due_date: '2026-09-25', lines: [], lines_es: [] }),
  quote_json: JSON.stringify({ source: 'manual', total_cents: 48500, lines: [{ name: 'Lechón', qty: '30', cents: 48500 }] }),
};

const envWith = (row) => ({ DB: { prepare: () => ({ bind: () => ({ first: async () => row }) }) } });
const get = async (row, path = `/q/${TOKEN}`) => {
  const res = await onRequestGet({
    env: envWith(row),
    params: { token: TOKEN },
    request: new Request(`https://anejocateringco.com${path}`),
  });
  return { status: res.status, html: await res.text() };
};

const withGift = (over = {}) => ({
  ...QUOTE, deposit_status: 'paid',
  quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  ...over,
});

// ---------------------------------------------------------------- the gate

test('an UNPAID quote gets no reveal, even when the gift is on the quote', async () => {
  // The exact shape of the mistake worth preventing: the gift is recorded, the customer opens her
  // link, and she has not paid. She must see her quote and a pay button, and no cake.
  const { status, html } = await get({
    ...QUOTE,
    quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  });
  assert.equal(status, 200);
  assert.doesNotMatch(html, /cr-root/, 'nothing of the reveal may be in the document at all');
  assert.doesNotMatch(html, /cake-reveal\.js/, 'and its script must not be fetched');
  assert.doesNotMatch(html, /tres leches de fresa va incluido/, 'and no free cake is promised');
});

test('a PAID quote with no gift on it gets no reveal — this is every other customer', async () => {
  // Every catering booking pays a deposit. If paid-alone were the gate, all of them would be told
  // a free cake is included.
  const { html } = await get({ ...QUOTE, deposit_status: 'paid' });
  assert.doesNotMatch(html, /cr-root/);
  assert.doesNotMatch(html, /cortesía de la casa/);
});

test('paid AND gifted is the only combination that reveals anything', async () => {
  const { status, html } = await get(withGift());
  assert.equal(status, 200);
  assert.match(html, /id="cr-root"/);
  assert.match(html, /cake-reveal\.js/);
  assert.match(html, /Feliz cumpleaños, Karina/, 'in her language, with her name');
  assert.match(html, /cortesía de la casa/);
});

test('an unrecognised gift key reveals nothing rather than an empty frame', async () => {
  const { html } = await get(withGift({
    quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'pony' }),
  }));
  assert.doesNotMatch(html, /cr-root/);
});

test('a corrupt quote_json is no gift, never a crash', async () => {
  const { status, html } = await get({ ...QUOTE, deposit_status: 'paid', quote_json: '{not json' });
  assert.equal(status, 200, 'the page still serves');
  assert.doesNotMatch(html, /cr-root/);
});

test('the gate cannot be reached from the URL', async () => {
  // ?paid=1 is only where Square sends her after checkout. It is a redirect target, not a claim
  // the page is allowed to believe.
  const { html } = await get({
    ...QUOTE,
    quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  }, `/q/${TOKEN}?paid=1&gift=tres-leches-fresa&deposit_status=paid`);
  assert.doesNotMatch(html, /cr-root/, 'the row says unpaid, so nothing else matters');
});

// ---------------------------------------------------------------- what it renders

test('the reveal speaks the language the quote was sold in', async () => {
  const es = await get(withGift({ lang: 'es' }));
  assert.match(es.html, /Feliz cumpleaños/);
  const en = await get(withGift({ lang: 'en', customer_name: 'Karina' }));
  assert.match(en.html, /Happy birthday, Karina/);
  assert.match(en.html, /on the house/);
});

test('only the first name is shown, and it is escaped', () => {
  // Asserted against the reveal itself, not the whole page: the quote below it greets her by the
  // full name she gave, which is correct there and would make a page-wide assertion lie.
  const block = cakeRevealHtml({ gift: 'tres-leches-fresa', name: 'Karina Juan', lang: 'es' });
  assert.match(block, /Feliz cumpleaños, Karina/);
  assert.doesNotMatch(block, /Karina Juan/, 'a surname on a birthday card reads as a form letter');

  const nasty = cakeRevealHtml({ gift: 'tres-leches-fresa', name: '<img src=x onerror=alert(1)>', lang: 'es' });
  assert.doesNotMatch(nasty, /<img[^>]*onerror/i, 'a name is text, never markup');
});

test('a missing name still produces a greeting rather than a dangling comma', async () => {
  const { html } = await get(withGift({ customer_name: null }));
  assert.match(html, /¡Feliz cumpleaños!/);
  assert.doesNotMatch(html, /cumpleaños, </);
});

test('the reveal pins itself to three.js r128 and uses nothing newer', () => {
  // CapsuleGeometry (r141) was used here once. It threw on load and left an attached canvas
  // painting solid black with no error shown anywhere — an outage with no symptom.
  const src = readFileSync(new URL('../../public/assets/js/cake-reveal.js', import.meta.url), 'utf8');
  const AFTER_R128 = ['CapsuleGeometry', 'BatchedMesh', 'ColorManagement', 'SRGBColorSpace', 'WebGPURenderer'];
  for (const sym of AFTER_R128) {
    assert.doesNotMatch(src, new RegExp(`THREE\\.${sym}\\b`), `${sym} does not exist in r128`);
  }
  assert.match(src, /const missing = NEEDS\.filter/, 'and it verifies its own symbols before running');
  assert.match(src, /could not start on this device/, 'so a failure is legible, not a black box');
});

test('the gift catalogue carries both languages for every entry', () => {
  for (const [key, g] of Object.entries(GIFTS)) {
    for (const lang of ['en', 'es']) {
      assert.ok(g[lang] && g[lang].eyebrow && g[lang].sub, `${key} is missing ${lang}`);
    }
  }
  assert.equal(cakeRevealHtml({ gift: Object.keys(GIFTS)[0], name: 'A', lang: 'zz' }).includes('cr-root'), true,
    'an unknown language falls back rather than refusing to render');
});
