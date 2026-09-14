// The gift reveal, and the two gates that decide whether anybody ever sees it.
//
// Dayan, 2026-09-14: "once she pays for the remaining balance, she can receive the cake gift ...
// this gift is not for every quote and for every client, this is only when I decide who to send
// it to ... it is never a default setting."
//
// There are TWO conditions, not one, and the second is the one that protects the kitchen:
//
//   1. balance_status === 'paid' — the BALANCE, not the deposit. Only markBalancePaid() writes
//      it, and only from a Square webhook. A WAIVED balance is not a paid one.
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
  deposit_status: 'paid', balance_status: 'due', balance_due_date: '2026-09-25',
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
  ...QUOTE, deposit_status: 'paid', balance_status: 'paid',
  quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  ...over,
});

// ---------------------------------------------------------------- the gate

test('a paid DEPOSIT is not enough — the balance decides', async () => {
  // This is Karina exactly: deposit captured 2026-09-10, balance still due. The gift is recorded
  // on her quote and she must still see nothing until the balance is settled.
  const { status, html } = await get({
    ...QUOTE,
    quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  });
  assert.equal(status, 200);
  assert.doesNotMatch(html, /cr-root/, 'nothing of the reveal may be in the document at all');
  assert.doesNotMatch(html, /cake-reveal\.js/, 'and its script must not be fetched');
  assert.doesNotMatch(html, /tres leches de fresa va incluido/, 'and no free cake is promised');
});

test('a fully PAID quote with no gift gets no reveal — this is every other customer', async () => {
  // Every catering booking settles its balance eventually. If payment alone were the gate, all of
  // them would be told a free cake is included.
  const { html } = await get({ ...QUOTE, balance_status: 'paid' });
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

test('a WAIVED balance is not a paid one and earns nothing', async () => {
  // 'waived' is how a quote gets written off. Money did not arrive, so a gift is not owed.
  const { html } = await get(withGift({ balance_status: 'waived' }));
  assert.doesNotMatch(html, /cr-root/);
});

test('a corrupt quote_json is no gift, never a crash', async () => {
  const { status, html } = await get({ ...QUOTE, balance_status: 'paid', quote_json: '{not json' });
  assert.equal(status, 200, 'the page still serves');
  assert.doesNotMatch(html, /cr-root/);
});

test('the gate cannot be reached from the URL', async () => {
  // ?paid=1 is only where Square sends her after checkout. It is a redirect target, not a claim
  // the page is allowed to believe.
  const { html } = await get({
    ...QUOTE,
    quote_json: JSON.stringify({ ...JSON.parse(QUOTE.quote_json), gift: 'tres-leches-fresa' }),
  }, `/q/${TOKEN}?paid=1&gift=tres-leches-fresa&balance_status=paid`);
  assert.doesNotMatch(html, /cr-root/, 'the row says the balance is due, so nothing else matters');
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

test('the reveal is read off the row, so balance_status has to be selected', () => {
  // It was not, at first. The gate compared undefined to 'paid', which is false forever — the
  // reveal would simply never have fired and nothing would have said why.
  const src = readFileSync(new URL('../../functions/q/[token].js', import.meta.url), 'utf8');
  const select = src.slice(src.indexOf('SELECT id, customer_name'), src.indexOf('FROM catering_quotes'));
  for (const col of ['balance_status', 'deposit_status', 'quote_json']) {
    assert.ok(select.includes(col), `${col} must be selected or the gate reads undefined`);
  }
});

test('NOTHING but the owner switch ever writes a gift', () => {
  // "free cakes is not a rule that applies for everyone." There is no default, no config value
  // and no code path that sets one — creating a quote must never produce a gift.
  const files = [
    'functions/_lib/catering_deposit.js',
    'functions/api/hub/owner/catering-deposit.js',
    'functions/_lib/catering_quote_lines.js',
  ].map((f) => [f, readFileSync(new URL('../../' + f, import.meta.url), 'utf8')]);

  for (const [name, src] of files) {
    const writes = src.match(/\bgift\s*[:=]/g) || [];
    if (name.endsWith('hub/owner/catering-deposit.js')) {
      assert.ok(src.includes("op === 'set_gift'"), 'the switch lives here');
      continue;
    }
    assert.equal(writes.length, 0, `${name} must not set a gift — only the Hub switch may`);
  }
});

test('the switch refuses a gift that does not exist', () => {
  // A typo would save silently, render nothing, and leave the owner believing a cake was promised.
  const src = readFileSync(new URL('../../functions/api/hub/owner/catering-deposit.js', import.meta.url), 'utf8');
  assert.match(src, /if \(wanted !== null && !GIFTS\[wanted\]\)/);
  assert.match(src, /There is no gift called/);
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
