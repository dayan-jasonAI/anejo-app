// The catering customer's own account.
//
// Dayan, 2026-09-25: "she has to see all of the catering details, the orders, like option to add
// more ... add more items, add additional counts, request cajita, make changes."
//
// THE RULE EVERYTHING HERE PROTECTS: a customer can ASK, never CHANGE. By the day before an event
// the kitchen is cooking from a production plan and the money is settled; a self-service edit would
// silently contradict both. So every control writes a request the owner answers, and these tests
// exist to stop that boundary eroding into "well, guests is only a number".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/catering-quote-change.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const TOKEN = 'c40f9379fe49c015aa511c7fe5326765';

const QUOTE = {
  id: 'cq_test', customer_name: 'Karina', customer_email: 'karinajuan2702@gmail.com',
  event_date: '2026-09-26', guests: 30, total_cents: 48500, lang: 'es',
};

function fakeEnv({ quote = QUOTE } = {}) {
  const writes = [];
  const env = {
    DB: {
      prepare(sql) {
        const stmt = {
          bind: (...args) => { writes.push({ sql, args }); return stmt; },
          first: async () => (/FROM catering_quotes/.test(sql) ? quote : null),
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    },
  };
  return { env, writes };
}

const call = (body, env) => onRequestPost({
  env,
  request: new Request('https://anejocateringco.com/api/catering-quote-change', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
});

// ---------------------------------------------------------------- ask, never change

test('NOTHING a customer sends can write to her quote', async () => {
  // The single most important property in this file. If a request ever UPDATEs catering_quotes,
  // a customer can move her own guest count — and therefore her own price — after paying.
  const f = fakeEnv();
  await call({ token: TOKEN, kind: 'guests', guests: 500, message: 'more people' }, f.env);
  const touched = f.writes.filter((w) => /UPDATE\s+catering_quotes/i.test(w.sql));
  assert.equal(touched.length, 0, 'a change request must never edit the quote it is about');

  const src = read('functions/api/catering-quote-change.js');
  assert.doesNotMatch(src, /UPDATE\s+catering_quotes/i, 'nor anywhere in this endpoint at all');
});

test('the request is recorded before anybody is told', async () => {
  // A notification that fails must not lose the request; she has still been heard.
  const f = fakeEnv();
  const res = await call({ token: TOKEN, message: 'can we start at 8?' }, f.env);
  assert.equal(res.status, 200);
  const insert = f.writes.findIndex((w) => /INSERT INTO catering_quote_changes/i.test(w.sql));
  assert.ok(insert >= 0, 'it is written');
});

// ---------------------------------------------------------------- structured asks

test('she can ask for named items at a quantity', async () => {
  const f = fakeEnv();
  const res = await call({
    token: TOKEN, kind: 'add_items',
    items: [{ id: 'croquetas', name: 'Sausage croquetas', qty: 20 }, { name: 'Yuca', qty: 2 }],
  }, f.env);
  assert.equal(res.status, 200);
  const row = f.writes.find((w) => /INSERT INTO catering_quote_changes/i.test(w.sql));
  const items = JSON.parse(row.args[9]);
  assert.deepEqual(items, [
    { id: 'croquetas', name: 'Sausage croquetas', qty: 20 },
    { id: null, name: 'Yuca', qty: 2 },
  ]);
  assert.equal(row.args[8], 'add_items', 'and the kind is recorded');
  assert.match(row.args[3], /20 × Sausage croquetas/, 'with a readable sentence for the email and the Hub');
});

test('NO PRICE crosses this boundary', async () => {
  // Pricing is the owner's, in the line editor. A customer who could send cents could name her own.
  const f = fakeEnv();
  await call({
    token: TOKEN, kind: 'add_items',
    items: [{ name: 'Lechón', qty: 1, unit_cents: 1, cents: 1, price: 0 }],
  }, f.env);
  const row = f.writes.find((w) => /INSERT INTO catering_quote_changes/i.test(w.sql));
  const stored = JSON.parse(row.args[9])[0];
  assert.deepEqual(Object.keys(stored).sort(), ['id', 'name', 'qty'], 'only what she picked, never money');
});

test('nonsense quantities are dropped rather than stored', async () => {
  const f = fakeEnv();
  const res = await call({
    token: TOKEN, kind: 'add_items',
    items: [{ name: 'A', qty: 0 }, { name: 'B', qty: -5 }, { name: 'C', qty: 99999 }, { name: '', qty: 3 }],
    message: 'see note',
  }, f.env);
  assert.equal(res.status, 200);
  const row = f.writes.find((w) => /INSERT INTO catering_quote_changes/i.test(w.sql));
  assert.equal(row.args[9], null, 'nothing survived, so no items are claimed');
});

test('an empty ask is refused rather than recorded as a blank request', async () => {
  const f = fakeEnv();
  const res = await call({ token: TOKEN, kind: 'add_items', items: [] }, f.env);
  assert.equal(res.status, 400);
  const res2 = await call({ token: TOKEN, kind: 'guests' }, f.env);
  assert.equal(res2.status, 400, 'a guest-count change with no count is not a request');
});

test('an impossible guest count is refused, never silently dropped', async () => {
  const f = fakeEnv();
  const res = await call({ token: TOKEN, kind: 'guests', guests: 0 }, f.env);
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------- who is allowed in

test('a bad token is refused exactly like an unknown one', async () => {
  const f = fakeEnv();
  const res = await call({ token: 'not-a-token', message: 'hello' }, f.env);
  assert.equal(res.status, 404);
});

test('a quote id with NO SESSION cannot reach anybody’s event', async () => {
  // The account page passes quote_id instead of a token. Without a matching session that must be
  // as dead as a forged token, or a signed-in customer could walk other people's quote ids.
  const f = fakeEnv();
  const res = await call({ quote_id: 'cq_test', message: 'let me in' }, f.env);
  assert.equal(res.status, 404);
  assert.equal(f.writes.filter((w) => /INSERT INTO/i.test(w.sql)).length, 0, 'and nothing was written');
});

test('the session is matched against the quote’s own email, never a supplied one', () => {
  const src = read('functions/api/catering-quote-change.js');
  assert.match(src, /currentUser\(env, request\)/, 'the session is read from the request');
  assert.match(src, /sess\.email[\s\S]{0,140}quote\.customer_email/,
    'and compared with the address on the quote');
  assert.doesNotMatch(src, /b\?\.email|b\.email/, 'a caller-supplied email must never be trusted');
});

// ---------------------------------------------------------------- the owner can answer

test('the HUB reads the requests, which nothing did before', () => {
  // catering_quote_changes was written from 2026-09-14 and read by nothing: a missed email was an
  // invisible request.
  const api = read('functions/api/hub/owner/catering-deposit.js');
  assert.match(api, /FROM catering_quote_changes/, 'the desk loads them');
  assert.match(api, /op === 'decide_change'/, 'and can answer one');
  const page = read('public/hub/owner/catering.html');
  assert.match(page, /Customer requests/, 'and they are on the screen');
  assert.match(page, /decide_change/);
});

test('answering records what she will be told', () => {
  const api = read('functions/api/hub/owner/catering-deposit.js');
  assert.match(api, /owner_note/, 'the reply is stored');
  assert.match(api, /handled_at/, 'and the pre-existing handled_at is kept in step with status');
  // Accepting must not quietly reprice: that is the line editor's job.
  const decide = api.slice(api.indexOf("op === 'decide_change'"), api.indexOf("op === 'create_balance_link'"));
  assert.doesNotMatch(decide, /UPDATE catering_quotes/i, 'accepting a request must not edit the quote');
});

// ---------------------------------------------------------------- her account

test('her account shows her events, her requests, and what she was told', () => {
  const api = read('functions/api/client/me.js');
  assert.match(api, /FROM catering_quote_changes/, 'her history is loaded');
  assert.match(api, /owner_note/, 'including the answer');

  const ui = read('public/assets/js/client-catering.js');
  for (const control of ['add_items', 'guests', 'cajita', 'dietary', 'message']) {
    assert.ok(ui.includes(`'${control}'`), `she can ask about ${control}`);
  }
  assert.match(ui, /tel:5617787474/, 'and reach a person');
});

test('her account speaks the language she was sold in', () => {
  const ui = read('public/assets/js/client-catering.js');
  const es = ui.slice(ui.indexOf('es: {'), ui.indexOf('};', ui.indexOf('es: {')));
  assert.match(es, /saldo pendiente/);
  assert.match(es, /Agregar más comida/);
  assert.ok(!/undefined/.test(es));
});

test('the account never offers the owner-only gift', () => {
  // "free cakes is not a rule that applies for everyone ... it is never a default setting." A gift
  // is a decision recorded on one quote by the owner. Putting it on a customer's menu of requests
  // would both spoil the surprise and invite everybody to ask for one.
  const ui = read('public/assets/js/client-catering.js');
  assert.doesNotMatch(ui, /tres.?leches|free cake|regalo sorpresa/i);
});
