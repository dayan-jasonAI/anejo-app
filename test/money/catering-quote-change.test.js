// "Modify my order" — the button that did nothing.
//
// Dayan, 2026-09-10: "the button to modify my order doesn't do anything." He was right, and it had
// been live in every quote since 2026-09-09. The email built the link as /q/<token>?edit=1 and
// NOTHING anywhere read `edit`, so the page re-served itself and the click looked like a dead app.
//
// The copy beside it was the worse half: "Adjust quantities, add a dish, or change your guest
// count. Your quote updates and we are notified straight away." None of that existed. A customer
// was being told a self-service editor was there.
//
// These tests hold both halves: the button reaches something real, and the promise matches it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/catering-quote-change.js';
import { onRequestGet as quotePage } from '../../functions/q/[token].js';
import { cateringQuoteEmail } from '../../functions/_lib/catering_quote_email.js';

const TOKEN = 'c40f9379fe49c015aa511c7fe5326765';
const QUOTE = {
  id: 'cq_test', customer_name: 'Karina', customer_email: 'k@example.test', customer_phone: null,
  event_date: '2026-09-26', guests: 30, total_cents: 48500, deposit_pct: 0.5, deposit_cents: 24250,
  balance_cents: 24250, deposit_status: 'unpaid', balance_due_date: '2026-09-25',
  payment_link_url: 'https://sq.link/deposit', access_token: TOKEN, lang: 'es',
  terms_json: JSON.stringify({ balance_due_date: '2026-09-25', lines: [], lines_es: [] }),
  quote_json: JSON.stringify({ lines: [{ name: 'Lechón asado', qty: '30', cents: 9500 }], subtotal_cents: 48500 }),
};

function makeEnv({ quote = QUOTE, ownerBcc = 'owner@anejo.test', failInsert = false } = {}) {
  const inserts = [];
  const updates = [];
  const env = {
    OWNER_BCC: ownerBcc,
    RESEND_API_KEY: 'test',
    DB: {
      prepare(sql) {
        const stmt = {
          bind: (...args) => {
            if (/INSERT INTO catering_quote_changes/i.test(sql)) {
              if (failInsert) throw new Error('disk full');
              inserts.push(args);
            }
            if (/UPDATE catering_quote_changes/i.test(sql)) updates.push({ sql, args });
            return stmt;
          },
          first: async () => (/FROM catering_quotes/i.test(sql) ? quote : null),
          run: async () => ({ meta: {} }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    },
  };
  return { env, inserts, updates };
}

const post = (env, body) => onRequestPost({
  env,
  request: new Request('https://anejocateringco.com/api/catering-quote-change', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
});

function stubEmail() {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init?.body || '{}') });
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  };
  return { sent, restore: () => { globalThis.fetch = real; } };
}

// ---------------------------------------------------------------- the button reaches something

test('a change request is recorded against the right quote', async () => {
  const m = stubEmail();
  const { env, inserts } = makeEnv();
  try {
    const res = await post(env, { token: TOKEN, guests: 35, message: 'Seríamos 35 y queremos una bandeja más.' });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.recorded, true);
    assert.match(data.message, /cotización actualizada/, 'answered in the language the quote was sent in');
    assert.equal(inserts.length, 1);
    const [, quoteId, guests, message] = inserts[0];
    assert.equal(quoteId, 'cq_test');
    assert.equal(guests, 35);
    assert.match(message, /35/);
  } finally { m.restore(); }
});

test('nothing about her quote is repriced — that is the owner\'s decision', async () => {
  // The endpoint may only ever INSERT into catering_quote_changes and stamp its own row. If it
  // ever learns to touch catering_quotes, a customer can move her own total.
  const m = stubEmail();
  const touched = [];
  const { env } = makeEnv();
  const realPrepare = env.DB.prepare;
  env.DB.prepare = (sql) => { touched.push(sql); return realPrepare(sql); };
  try {
    await post(env, { token: TOKEN, guests: 500, message: 'make it free' });
    const writesToQuotes = touched.filter((s) => /UPDATE\s+catering_quotes|INSERT INTO catering_quotes/i.test(s));
    assert.deepEqual(writesToQuotes, [], 'the quote itself must not be written by this endpoint');
  } finally { m.restore(); }
});

test('the owner is told, and a failure to tell him does not lose her request', async () => {
  const { env, inserts, updates } = makeEnv();
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('resend is down'); };
  try {
    const res = await post(env, { token: TOKEN, message: 'add a tray' });
    assert.equal(res.status, 200, 'she is still thanked — she did her part');
    assert.equal(inserts.length, 1, 'and the request is on record');
    assert.ok(updates.some((u) => /notify_error/.test(u.sql)), 'with the delivery failure noted');
  } finally { globalThis.fetch = real; }
});

test('if the request cannot be recorded she is told, not thanked', async () => {
  const m = stubEmail();
  const { env } = makeEnv({ failInsert: true });
  try {
    const res = await post(env, { token: TOKEN, message: 'add a tray' });
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /reply to the email/);
    assert.equal(m.sent.length, 0, 'and nobody is emailed about a request that was not stored');
  } finally { m.restore(); }
});

// ---------------------------------------------------------------- what it refuses

test('a bad token is refused exactly like an unknown one', async () => {
  const m = stubEmail();
  try {
    for (const t of ['', 'nope', 'REVIEWCOPYREVIEWCOPYREVIEWCOPY01', 'c40f9379fe49c015aa511c7fe532676']) {
      const { env } = makeEnv();
      const res = await post(env, { token: t, message: 'hello' });
      assert.equal(res.status, 404, `${t} must 404`);
      assert.match((await res.json()).error, /not valid/);
    }
    // An unknown but well-formed token gets the identical answer, so this cannot be used to learn
    // which tokens exist.
    const { env } = makeEnv({ quote: null });
    const res = await post(env, { token: 'a'.repeat(32), message: 'hello' });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /not valid/);
  } finally { m.restore(); }
});

test('an empty message and an absurd guest count are refused', async () => {
  const m = stubEmail();
  try {
    for (const body of [{ message: '   ' }, { message: '' }, {}]) {
      const { env } = makeEnv();
      const res = await post(env, { token: TOKEN, ...body });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /what you would like to change/i);
    }
    for (const g of [0, -3, 'many', 1e9]) {
      const { env } = makeEnv();
      const res = await post(env, { token: TOKEN, guests: g, message: 'more people' });
      assert.equal(res.status, 400, `guests: ${g} must refuse`);
      assert.match((await res.json()).error, /guest count/);
    }
  } finally { m.restore(); }
});

test('a runaway message is truncated rather than stored whole', async () => {
  const m = stubEmail();
  const { env, inserts } = makeEnv();
  try {
    await post(env, { token: TOKEN, message: 'x'.repeat(50000) });
    assert.ok(inserts[0][3].length <= 1200);
  } finally { m.restore(); }
});

// ---------------------------------------------------------------- the page and the promise

test('?edit=1 renders a real form; without it the quote is just the quote', async () => {
  const { env } = makeEnv();
  const get = (qs) => quotePage({ env, params: { token: TOKEN }, request: new Request(`https://anejocateringco.com/q/${TOKEN}${qs}`) });

  const plain = await (await get('')).text();
  assert.ok(!plain.includes('id="cqc"'), 'the form only appears when it was asked for');

  const edit = await (await get('?edit=1')).text();
  assert.ok(edit.includes('id="cqc"'), 'the button must land on something');
  assert.ok(edit.includes('/api/catering-quote-change'), 'and it must post somewhere real');
  assert.ok(edit.includes('¿Necesita cambiar algo?'), 'in the language the quote was sent in');
});

test('a paid quote does not invite changes it cannot honour', async () => {
  const { env } = makeEnv({ quote: { ...QUOTE, deposit_status: 'paid' } });
  const res = await quotePage({ env, params: { token: TOKEN }, request: new Request(`https://anejocateringco.com/q/${TOKEN}?edit=1`) });
  assert.ok(!(await res.text()).includes('id="cqc"'));
});

test('the email no longer promises a quote that reprices itself', async () => {
  for (const lang of ['en', 'es']) {
    const { html } = cateringQuoteEmail({
      lang, customerName: 'Karina', eventDate: '2026-09-26', guests: 30, quoteId: 'q',
      lines: [], subtotalCents: 48500, discountCents: 0, totalCents: 48500,
      depositCents: 24250, depositPct: 0.5, balanceCents: 24250, balanceDueDate: '2026-09-25',
      depositUrl: 'https://sq.link/d', modifyUrl: `https://anejocateringco.com/q/${TOKEN}?edit=1`,
      termsLines: [],
    });
    assert.ok(!/quote updates and we are notified/i.test(html), 'the old claim must not come back');
    assert.ok(!/cotización se actualiza y nos avisa/i.test(html));
    assert.ok(/updated quote|cotización actualizada/i.test(html), 'it says a person will send a new one');
    assert.ok(html.includes('?edit=1'), 'and the button still points at the form');
  }
});
