// Owner-typed quote lines: the prices Dayan sets by hand, printed to the customer exactly as he
// set them and charged exactly as printed.
//
// Dayan, 2026-09-10: "my decision should override whatever the hub has as a standing rule ... I
// want you to add the option to manually modify pricing directly from the catering section in the
// hub instead of having the hub override me."
//
// The concrete case behind every number below is Karina's quote. He priced her skewers at $60 when
// the ratified ladder says $80, and there was no way to say so in the Hub — the quote email
// printed the estimator's lines, so his number could only survive as a bare total with no
// itemisation. These tests pin that his lines now ARE the quote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuoteLines, MAX_LINES } from '../../functions/_lib/catering_quote_lines.js';

const line = (over = {}) => ({ name: 'Lechón asado', qty: '30', cents: 9500, ...over });

// ---------------------------------------------------------------- what is accepted

test('his lines come back exactly as typed, and they carry their own subtotal', () => {
  // Karina's quote, at the prices he dictated on 2026-09-10.
  const r = normalizeQuoteLines([
    { name: 'Lechón asado', qty: '30', cents: 9500 },
    { name: 'Congrí', qty: '30', cents: 7000 },
    { name: 'Tamales cubanos', qty: '30', cents: 7500 },
    { name: 'Yuca con cebolla y chicharrones', qty: '30', cents: 5000 },
    { name: 'Croquetas — 2 bandejas', detail: '2 trays of 30 at $35 each', qty: '60', cents: 7000 },
    { name: 'Ensalada fría de coditos', qty: '30', cents: 6500 },
    { name: 'Pinchos', qty: '30', cents: 6000 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.subtotal_cents, 48500, 'his seven lines, his seven prices — $485.00');
  assert.equal(r.lines.length, 7);
  // The skewer line is the whole point: the menu's ladder would price 30 at $80 and he sold them
  // at $60. Nothing in this path is allowed to reach for the menu.
  assert.equal(r.lines[6].cents, 6000);
  assert.equal(r.lines[4].detail, '2 trays of 30 at $35 each');
});

test('a line may be free — that is a real line on a real quote', () => {
  // The tres leches gifted to Karina is a $0 line, not an absent one: she has to SEE that it is
  // included, and that it cost her nothing.
  const r = normalizeQuoteLines([line(), { name: 'Tres leches de fresa — cortesía de la casa', qty: '1', cents: 0 }]);
  assert.equal(r.ok, true);
  assert.equal(r.lines[1].cents, 0);
  assert.equal(r.subtotal_cents, 9500, 'a free line adds nothing and removes nothing');
});

test('both languages survive, so the Spanish quote is not the English one with pesos', () => {
  const r = normalizeQuoteLines([{ name: 'Roast pork', name_es: 'Lechón asado', detail: 'For 30 guests', detail_es: 'Para 30 invitados', qty: '30', cents: 9500 }]);
  assert.equal(r.lines[0].name_es, 'Lechón asado');
  assert.equal(r.lines[0].detail_es, 'Para 30 invitados');
});

test('whitespace is tidied and nothing runaway reaches the email', () => {
  const r = normalizeQuoteLines([{ name: '  Lechón   asado \n', qty: ' 30 ', cents: 9500 }]);
  assert.equal(r.lines[0].name, 'Lechón asado');
  assert.equal(r.lines[0].qty, '30');
  const long = normalizeQuoteLines([{ name: 'x'.repeat(500), cents: 100 }]);
  assert.equal(long.ok, true);
  assert.ok(long.lines[0].name.length <= 120, 'a pasted paragraph is trimmed, not printed whole');
});

// ---------------------------------------------------------------- what is refused

test('an empty price is a refusal, never a zero', () => {
  // Number('') is 0 and Number(null) is 0. Either one silently prices a line at nothing, and the
  // customer is quoted for food she is not being charged for.
  for (const bad of ['', null, undefined]) {
    const r = normalizeQuoteLines([line({ cents: bad })]);
    assert.equal(r.ok, false, `cents: ${JSON.stringify(bad)} must refuse`);
    assert.match(r.error, /needs a price/);
    assert.match(r.error, /Lechón asado/, 'and it says WHICH line');
  }
});

test('a float price is refused rather than rounded — it means dollars in a cents field', () => {
  const r = normalizeQuoteLines([line({ cents: 95.5 })]);
  assert.equal(r.ok, false);
  assert.match(r.error, /whole number of cents/);
  // The dangerous one: 60 meaning "sixty dollars" would quietly become sixty cents.
  const dollars = normalizeQuoteLines([line({ cents: 60 })]);
  assert.equal(dollars.ok, true, '60 cents is legal — the UI multiplies by 100, this cannot guess');
  assert.equal(dollars.subtotal_cents, 60);
});

test('a nameless line is refused — she has to read what she is paying for', () => {
  const r = normalizeQuoteLines([line({ name: '   ' })]);
  assert.equal(r.ok, false);
  assert.match(r.error, /needs a name/);
});

test('negatives, absurd totals and non-lines are all refused by name', () => {
  assert.match(normalizeQuoteLines([line({ cents: -100 })]).error, /cannot be negative/);
  assert.match(normalizeQuoteLines([line({ cents: 10000001 })]).error, /over \$100,000/);
  assert.match(normalizeQuoteLines([line(), null]).error, /Line 2 is not a line/);
  assert.match(normalizeQuoteLines('lechon').error, /must be a list/);
  assert.match(normalizeQuoteLines([]).error, /at least one line/);
  assert.match(normalizeQuoteLines(new Array(MAX_LINES + 1).fill(line())).error, new RegExp(`more than ${MAX_LINES} lines`));
});

test('a quote of nothing is refused even when every line is individually legal', () => {
  // Each line is a valid $0 line; the quote is not, because it would mint a Square link for $0.00.
  const r = normalizeQuoteLines([{ name: 'Courtesy cake', cents: 0 }, { name: 'Courtesy delivery', cents: 0 }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /add up to \$0\.00/);
});

test('the sum ceiling catches dollars typed into every field at once', () => {
  // Seven lines that each look like a plausible price in DOLLARS but were entered as cents.
  const r = normalizeQuoteLines(new Array(7).fill({ name: 'Tray', cents: 9000000 }));
  assert.equal(r.ok, false);
  assert.match(r.error, /dollars typed into a cents field/);
});

test('an image may only ever name a file under /assets/img/', () => {
  assert.equal(normalizeQuoteLines([line({ image: 'menu-launch/food-lechon.webp' })]).ok, true);
  assert.equal(normalizeQuoteLines([line({ image: 'bowl_vida.jpg' })]).ok, true);
  for (const evil of ['../../etc/passwd.png', '/etc/passwd.png', 'https://evil.test/x.png', 'x.svg']) {
    const r = normalizeQuoteLines([line({ image: evil })]);
    assert.equal(r.ok, false, `${evil} must refuse`);
    assert.match(r.error, /under \/assets\/img\//);
  }
});

test('the returned lines are a fresh array — a caller cannot smuggle fields past validation', () => {
  const hostile = [{ name: 'Lechón', cents: 9500, deposit_cents: 1, total_cents: 1, ok: true }];
  const r = normalizeQuoteLines(hostile);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.lines[0]).sort(), ['cents', 'detail', 'detail_es', 'image', 'name', 'name_es', 'qty']);
  assert.equal(r.lines[0].deposit_cents, undefined, 'nothing but the known fields survives');
  assert.equal(r.subtotal_cents, 9500, 'and the subtotal is computed here, never read off the body');
});

// ---------------------------------------------------------------- through the real endpoint
//
// The unit tests above prove the validator. These prove the wiring: that the lines he typed reach
// the stored quote, and that Square is asked for the deposit on the SUM OF THOSE LINES and not on
// anything else. That is the only property that actually protects a customer.

import { onRequestPost } from '../../functions/api/hub/owner/catering-deposit.js';

function stubSquare() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok: true, status: 200, json: async () => ({ payment_link: { id: 'pl_1', order_id: 'sqo_1', long_url: 'https://sq.link/deposit' } }) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

function ownerEnv() {
  const kv = new Map([['session:tok-owner', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'owner@test', la: Date.now(), created: Date.now() })]]);
  const inserted = [];
  const env = {
    SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'loc', SQUARE_ENV: 'sandbox',
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put() {}, async delete() {} },
    DB: {
      prepare(sql) {
        const stmt = {
          bind: (...args) => { if (/INSERT INTO catering_quotes/i.test(sql)) inserted.push(args); return stmt; },
          all: async () => ({ results: [] }),
          first: async () => (sql.includes('FROM staff') ? { active: 1 } : null),
          run: async () => ({ meta: {} }),
        };
        return stmt;
      },
    },
  };
  return { env, inserted };
}

const post = (env, body) => onRequestPost({
  env,
  request: new Request('https://anejocateringco.com/api/hub/owner/catering-deposit', {
    method: 'POST', headers: { Cookie: 'anejo_sess=tok-owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
});

const KARINA = {
  customer_name: 'Karina', customer_email: 'k@example.test', guests: 30, event_date: '2026-09-26',
  send: false,
  lines: [
    { name: 'Lechón asado', qty: '30', cents: 9500 },
    { name: 'Congrí', qty: '30', cents: 7000 },
    { name: 'Tamales cubanos', qty: '30', cents: 7500 },
    { name: 'Yuca', qty: '30', cents: 5000 },
    { name: 'Croquetas — 2 bandejas', qty: '60', cents: 7000 },
    { name: 'Ensalada fría', qty: '30', cents: 6500 },
    { name: 'Pinchos', qty: '30', cents: 6000 },
  ],
};

test('the card is charged the deposit on the sum of his lines, not on the menu', () => {
  // Deliberately not async-wrapped in a helper: the assertion that matters is what reached Square.
  const sq = stubSquare();
  const { env } = ownerEnv();
  return post(env, KARINA).then(async (res) => {
    try {
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.total_cents, 48500, '$485.00 — his seven prices, added up here');
      assert.equal(data.deposit_cents, 24250, '50% of $485.00');
      assert.equal(data.balance_cents, 24250);
      const order = sq.calls[0].body.order;
      assert.equal(order.line_items[0].base_price_money.amount, 24250,
        'Square is asked for the deposit on HIS total');
    } finally { sq.restore(); }
  });
});

test('the quote stores his lines verbatim, so the email prints what he typed', () => {
  const sq = stubSquare();
  const { env, inserted } = ownerEnv();
  return post(env, KARINA).then(async (res) => {
    try {
      assert.equal(res.status, 200);
      // terms_json also carries a `lines` key (the rendered terms copy), so pick the breakdown by
      // the field only it has rather than by a substring that matches both.
      const quote = inserted.flat()
        .filter((v) => typeof v === 'string' && v.startsWith('{'))
        .map((v) => { try { return JSON.parse(v); } catch { return null; } })
        .find((v) => v && v.source === 'manual');
      assert.ok(quote, 'the quote row must carry the owner-typed breakdown');
      assert.equal(quote.source, 'manual', 'recorded as priced by a person, not by the estimator');
      assert.equal(quote.lines.length, 7);
      assert.equal(quote.lines[6].name, 'Pinchos');
      assert.equal(quote.lines[6].cents, 6000, 'the $60 he chose, not the $80 the ladder would say');
      assert.equal(quote.total_cents, 48500);
    } finally { sq.restore(); }
  });
});

test('lines and a total that disagree are refused, never reconciled', () => {
  // The failure this prevents: she reads an itemisation adding to $485 and her card is charged the
  // deposit on $530. Picking either number silently is worse than refusing.
  const sq = stubSquare();
  const { env } = ownerEnv();
  return post(env, { ...KARINA, total_cents: 53000 }).then(async (res) => {
    try {
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /\$485\.00/, 'the error names what the lines say');
      assert.match(data.error, /\$530\.00/, 'and what the total says');
      assert.equal(sq.calls.length, 0, 'and nothing was minted');
    } finally { sq.restore(); }
  });
});

test('a line the owner has not finished refuses the whole quote', () => {
  const sq = stubSquare();
  const { env } = ownerEnv();
  return post(env, { ...KARINA, lines: [...KARINA.lines, { name: 'Themed boxes', qty: '30' }] }).then(async (res) => {
    try {
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /needs a price/);
      assert.equal(sq.calls.length, 0);
    } finally { sq.restore(); }
  });
});

test('creating a quote contacts nobody, even if the body asks nicely', () => {
  // THE LAW, at the layer that actually enforces it. On 2026-09-10 a quote emailed itself to a
  // real client the instant Create was pressed, because `send` defaulted to true and the Hub sent
  // it checked. Sending is now opt-in: an absent flag, a truthy-looking string, anything short of
  // boolean true means silence.
  const sent = [];
  const realFetch = globalThis.fetch;
  const sq = stubSquare();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('resend') || String(url).includes('twilio')) sent.push(String(url));
    return sq.calls.length >= 0 ? { ok: true, status: 200, json: async () => ({ payment_link: { id: 'pl_1', order_id: 'sqo_1', long_url: 'https://sq.link/deposit' } }) } : null;
  };
  const { env } = ownerEnv();
  const bodies = [KARINA, { ...KARINA, send: undefined }, { ...KARINA, send: 'yes' }, { ...KARINA, send: 1 }];
  return bodies.reduce((chain, b) => chain.then(async () => {
    const res = await post(env, { ...b, op: 'create' });
    assert.equal(res.status, 200, `send: ${JSON.stringify(b.send)} must still create`);
    assert.deepEqual(sent, [], `send: ${JSON.stringify(b.send)} must not contact the customer`);
  }), Promise.resolve()).finally(() => { globalThis.fetch = realFetch; sq.restore(); });
});
