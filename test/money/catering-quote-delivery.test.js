// Getting the catering quote to the customer, by email and by text.
//
// Dayan, 2026-09-09: "the catering quote must be sent out via text and email — the text with the
// link to the HTML email or their account login where the quote will be sitting."
//
// This path TEXTS REAL PEOPLE and emails them a payment link, so the tests here are mostly about
// what must NOT happen: no text without consent, no link that can be guessed, no second copy of
// the quote in her inbox on a retry, and no lost booking because a provider was down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mintAccessToken, normalizePhone, quoteSms, quoteUrl, quoteEmailArgs, sendQuote }
  from '../../functions/_lib/catering_quote_delivery.js';
import { onRequestGet } from '../../functions/q/[token].js';

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const TERMS = { balance_due_date: '2026-09-14', final_count_due: '2026-09-09', deposit_cents: 40794,
                balance_cents: 40793, total_cents: 81587, cancellation_tiers: [] };
const BREAKDOWN = { subtotal_cents: 83250, discount_cents: 1663, event_time: '19:00',
                    lines: [{ name: 'Lechón asado — 30 servings', name_es: 'Lechón asado — 30 porciones',
                              qty: 30, cents: 30000, image: 'menu-launch/food-lechon-10.webp' }] };

const rowFor = (over = {}) => ({
  id: 'cq_A7F2K9', customer_name: 'Ana Reyes', customer_email: 'ana@example.test',
  customer_phone: '(561) 555-0142', sms_consent: 1, event_date: '2026-09-15', guests: 30,
  total_cents: 81587, deposit_pct: 0.5, deposit_cents: 40794, balance_cents: 40793,
  deposit_status: 'unpaid', balance_due_date: '2026-09-14',
  payment_link_url: 'https://square.link/u/DEP',
  terms_json: JSON.stringify(TERMS), quote_json: JSON.stringify(BREAKDOWN),
  access_token: TOKEN, lang: 'es', ...over,
});

// Providers stubbed at the module boundary via env: no network, no messages, ever.
function makeEnv({ emailOk = true, twilio = true, suppressed = false } = {}) {
  const sent = { emails: [], texts: [], updates: [] };
  return {
    sent,
    env: {
      RESEND_API_KEY: emailOk ? 'test' : '',
      TWILIO_ACCOUNT_SID: twilio ? 'AC_test' : '',
      TWILIO_AUTH_TOKEN: twilio ? 'tok' : '',
      TWILIO_FROM: twilio ? '+15615550100' : '',
      DB: {
        prepare: (sql) => ({
          bind: (...args) => ({
            run: async () => { sent.updates.push({ sql, args }); return { meta: { changes: 1 } }; },
            first: async () => (suppressed && /email_suppressions/i.test(sql) ? { email: 'ana@example.test' } : null),
            all: async () => ({ results: [] }),
          }),
          run: async () => ({ meta: { changes: 1 } }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      },
    },
  };
}

// fetch is what both providers reach for; intercepting it is how "nothing was sent" is provable.
function withFetch(handler, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = real; });
}

// ---------------------------------------------------------------- the link is a secret

test('the access token is unguessable and never repeats', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const t = mintAccessToken();
    assert.match(t, /^[a-f0-9]{32}$/, 'must be 128 bits of hex');
    assert.ok(!seen.has(t), 'a repeat would serve one customer another one\'s quote');
    seen.add(t);
  }
});

test('the quote page refuses anything that is not a well-formed token', async () => {
  const { env } = makeEnv();
  for (const bad of ['cq_A7F2K9', '1', '../../etc/passwd', 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
                     TOKEN.slice(0, 31), `${TOKEN}0`, '']) {
    const res = await onRequestGet({ params: { token: bad }, env, request: new Request(`https://anejocateringco.com/q/${bad}`) });
    assert.equal(res.status, 404, `${bad} must not be looked up at all`);
  }
});

test('a missing quote and a wrong token give the SAME answer', async () => {
  // Distinguishing them only helps somebody guessing.
  const { env } = makeEnv();
  const res = await onRequestGet({ params: { token: TOKEN }, env, request: new Request(`https://anejocateringco.com/q/${TOKEN}`) });
  assert.equal(res.status, 404);
  const body = await res.text();
  assert.ok(!body.includes('cq_'), 'must not leak whether the id exists');
  assert.match(body, /no longer available/);
});

test('the quote page is never cached or indexed', async () => {
  const { env } = makeEnv();
  const db = { ...env.DB, prepare: () => ({ bind: () => ({ first: async () => rowFor() }) }) };
  const res = await onRequestGet({ params: { token: TOKEN }, env: { ...env, DB: db },
    request: new Request(`https://anejocateringco.com/q/${TOKEN}`) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.match(res.headers.get('X-Robots-Tag'), /noindex/);
});

// ---------------------------------------------------------------- one artifact, two surfaces

test('the page renders the SAME quote the email does, in the language it was sent in', async () => {
  const { env } = makeEnv();
  const db = { prepare: () => ({ bind: () => ({ first: async () => rowFor() }) }) };
  const res = await onRequestGet({ params: { token: TOKEN }, env: { ...env, DB: db },
    request: new Request(`https://anejocateringco.com/q/${TOKEN}`) });
  const body = await res.text();
  // Sent in Spanish → shown in Spanish, whatever the browser prefers.
  assert.ok(body.includes('Su menú'), 'the stored language wins');
  assert.ok(body.includes('Lechón asado — 30 porciones'), 'the same lines');
  assert.ok(body.includes('$815.87'), 'the same total');
  assert.ok(body.includes('https://square.link/u/DEP'), 'the same payment link');
});

test('a visitor can switch language, and only that', async () => {
  const { env } = makeEnv();
  const db = { prepare: () => ({ bind: () => ({ first: async () => rowFor() }) }) };
  const res = await onRequestGet({ params: { token: TOKEN }, env: { ...env, DB: db },
    request: new Request(`https://anejocateringco.com/q/${TOKEN}?lang=en`) });
  const body = await res.text();
  assert.ok(body.includes('Your menu'), 'the override applies');
  assert.ok(!body.includes('Su menú'));
});

test('once the deposit is paid the page stops asking for it again', async () => {
  const { env } = makeEnv();
  const db = { prepare: () => ({ bind: () => ({ first: async () => rowFor({ deposit_status: 'paid' }) }) }) };
  const res = await onRequestGet({ params: { token: TOKEN }, env: { ...env, DB: db },
    request: new Request(`https://anejocateringco.com/q/${TOKEN}`) });
  const body = await res.text();
  assert.match(body, /Depósito recibido/, 'it says so');
  assert.ok(body.includes('$407.93'), 'and names the balance still to come');
});

// ---------------------------------------------------------------- the text

test('the text is short, names the money, and carries the link', () => {
  const url = quoteUrl(TOKEN);
  const en = quoteSms({ customerName: 'Ana Reyes', totalCents: 81587, eventDate: '2026-09-15', url, lang: 'en' });
  assert.ok(en.includes(url), 'the link is the point of the message');
  assert.ok(en.includes('$815.87'));
  assert.ok(en.includes('Ana'), 'first name only');
  assert.ok(!en.includes('Reyes'), 'a surname in an SMS reads like a database, not a person');
  assert.ok(en.length < 320, `an SMS this long fragments and looks like spam (${en.length})`);
  const es = quoteSms({ customerName: 'Ana', totalCents: 81587, url, lang: 'es' });
  assert.match(es, /cotización de Añejo/);
  assert.ok(es.includes(url));
});

test('phone numbers are normalised, and unusable ones are refused rather than guessed', () => {
  assert.equal(normalizePhone('(561) 555-0142'), '+15615550142');
  assert.equal(normalizePhone('561-555-0142'), '+15615550142');
  assert.equal(normalizePhone('15615550142'), '+15615550142');
  assert.equal(normalizePhone('+445555550142'), '+445555550142');
  for (const bad of ['', null, undefined, '555-0142', 'call me', '+', '+1', '12345678901234567890']) {
    assert.equal(normalizePhone(bad), null, `${bad} must not become a number we text`);
  }
});

test('NO TEXT WITHOUT CONSENT — and the email still goes', async () => {
  const { env, sent } = makeEnv();
  await withFetch(async (url) => {
    if (String(url).includes('twilio')) { sent.texts.push(url); return new Response('{}', { status: 200 }); }
    sent.emails.push(url);
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }, async () => {
    const r = await sendQuote(env, rowFor({ sms_consent: 0 }));
    assert.equal(r.sms.sent, false);
    assert.match(r.sms.skipped, /consent/);
    assert.equal(sent.texts.length, 0, 'not one request may reach Twilio');
    assert.equal(r.email.sent, true, 'the email is not punished for the missing consent');
    assert.equal(r.ok, true);
  });
});

test('a number that is not textable is skipped, not mangled into one that is', async () => {
  const { env, sent } = makeEnv();
  await withFetch(async (url) => {
    if (String(url).includes('twilio')) { sent.texts.push(url); }
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }, async () => {
    const r = await sendQuote(env, rowFor({ customer_phone: '555-0142' }));
    assert.equal(r.sms.sent, false);
    assert.match(r.sms.skipped, /not textable/);
    assert.equal(sent.texts.length, 0);
  });
});

// ---------------------------------------------------------------- failures must not cost a booking

test('a provider outage is reported, never thrown, and the other channel still lands', async () => {
  const { env } = makeEnv();
  await withFetch(async (url) => {
    if (String(url).includes('twilio')) return new Response(JSON.stringify({ message: 'Twilio is down' }), { status: 500 });
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }, async () => {
    const r = await sendQuote(env, rowFor());
    assert.equal(r.email.sent, true);
    assert.equal(r.sms.sent, false);
    assert.ok(r.sms.error, 'the failure is named');
    assert.equal(r.ok, true, 'one channel landing is a success');
  });
});

test('both channels failing reports ok:false without throwing', async () => {
  const { env } = makeEnv();
  await withFetch(async () => new Response(JSON.stringify({ message: 'nope' }), { status: 500 }), async () => {
    const r = await sendQuote(env, rowFor());
    assert.equal(r.ok, false);
    assert.ok(r.error, 'and says what went wrong');
  });
});

test('a suppressed address is not emailed — a bounce list exists to be honoured', async () => {
  const { env, sent } = makeEnv({ suppressed: true });
  await withFetch(async (url) => { sent.emails.push(String(url)); return new Response('{}', { status: 200 }); }, async () => {
    const r = await sendQuote(env, rowFor({ sms_consent: 0 }));
    assert.equal(r.email.sent, false);
    assert.match(r.email.skipped, /suppress/);
    assert.equal(sent.emails.filter((u) => u.includes('resend')).length, 0);
  });
});

test('a re-send does not put a second copy of the quote in her inbox', async () => {
  const { env, sent } = makeEnv();
  await withFetch(async (url) => { sent.emails.push(String(url)); return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }); }, async () => {
    const already = rowFor({ email_sent_at: Date.now(), sms_sent_at: Date.now() });
    const r = await sendQuote(env, already);
    assert.equal(r.email.sent, false);
    assert.match(r.email.skipped, /already/);
    assert.equal(r.sms.sent, false);
    // force is the deliberate override, for "she says it never arrived".
    const forced = await sendQuote(env, already, { force: true });
    assert.equal(forced.email.sent, true);
  });
});

test('a quote with no token cannot be sent at all', async () => {
  const { env } = makeEnv();
  const r = await sendQuote(env, rowFor({ access_token: null }));
  assert.equal(r.ok, false);
  assert.match(r.error, /no access token/);
});

// ---------------------------------------------------------------- what the email is built from

test('the email arguments come off the stored row, so the page and the email agree', () => {
  const args = quoteEmailArgs(rowFor(), { lang: 'es' });
  assert.equal(args.totalCents, 81587);
  assert.equal(args.depositCents, 40794);
  assert.equal(args.balanceDueDate, '2026-09-14', 'from the stored terms snapshot, not recomputed');
  assert.equal(args.lines.length, 1);
  assert.match(args.modifyUrl, new RegExp(`/q/${TOKEN}`));
  assert.match(args.depositUrl, /square\.link/);
  assert.ok(args.termsLines.length > 3, 'the terms she agreed to travel with it');
  assert.match(args.termsLines[0], /Depósito/, 'in the language it was sent in');
});

test('a corrupt stored blob degrades to an empty quote rather than a crash', () => {
  const args = quoteEmailArgs(rowFor({ quote_json: '{not json', terms_json: 'also not' }));
  assert.deepEqual(args.lines, []);
  assert.deepEqual(args.termsLines, []);
  assert.equal(args.totalCents, 81587, 'the money still comes off the row itself');
});

// ---------------------------------------------------------------- it is actually wired up

test('creating a quote mints a token and sends it', () => {
  const src = readFileSync(new URL('../../functions/_lib/catering_deposit.js', import.meta.url), 'utf8');
  assert.match(src, /const accessToken = mintAccessToken\(\);/);
  assert.match(src, /access_token, lang\)/, 'the token is stored with the quote');
  assert.match(src, /await sendQuote\(env, \{/, 'and the quote is sent');
  // Order matters: Square link and row first, sending last.
  assert.ok(src.indexOf('INSERT INTO catering_quotes') < src.indexOf('await sendQuote'),
    'a provider outage must never cost a booking Square already accepted');
  assert.match(src, /smsConsent \? 1 : 0/, 'consent is passed through, never assumed');
});
