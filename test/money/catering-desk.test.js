// The catering deposit DESK — the screen that was missing.
//
// THE MISS. /api/hub/owner/catering-deposit shipped GET + POST, fully tested at the library level
// (catering-deposit.test.js), and no page in the entire app called it. The quote engine could
// price an event, the deposit module could mint a payable Square link, the terms module could
// snapshot what the customer agreed to — and the owner had no way to reach any of it. An endpoint
// with no screen is not a feature, it is a well-tested dead end, which is precisely the failure
// mode /_lib/catering_deposit.js was written to remove one layer down.
//
// These tests drive the endpoint the way the desk drives it, and pin the one property that is
// easy to lose and expensive to lose: an already-booked customer's terms come off THEIR row, not
// off today's constants.
//
// Square is stubbed at `fetch`. Nothing here can reach live money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/owner/catering-deposit.js';
import { DEPOSIT_PCT, TERMS_VERSION } from '../../functions/_lib/catering_terms.js';

const DESK = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');

const ENV_SQUARE = { SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox' };

function stubSquare(response = { payment_link: { id: 'pl_1', order_id: 'sqo_1', long_url: 'https://sq.link/deposit' } }, ok = true) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse((init && init.body) || '{}') });
    return { ok, status: ok ? 200 : 400, json: async () => response };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

// A quote booked under terms that are NOT today's: a 20% deposit and an older version string.
// If anything in the read path recomputes instead of reading, this row is what catches it.
const OLD_TERMS = {
  version: '2025-01-v0',
  deposit_pct: 0.20,
  final_count_due: '2025-03-01',
  balance_due_date: '2025-03-11',
  deposit_cents: 20000,
  balance_cents: 80000,
  cancellation_tiers: [{ min_days_before: 0, refund_pct_of_total: 1, deposit_refunded: true, label: 'anytime, in full' }],
  lines: [
    'Deposit: $200.00 — 20% of your $1000.00 quote.',
    'Cancel any time before the event and everything, deposit included, comes back to you.',
  ],
};
const OLD_ROW = {
  id: 'cq_old', customer_name: 'Beatriz Salas', customer_email: 'bea@example.test',
  event_date: '2025-03-11', guests: 40, total_cents: 100000, deposit_pct: 0.20,
  deposit_cents: 20000, balance_cents: 80000, deposit_status: 'paid', deposit_paid_at: 1741000000000,
  deposit_paid_cents: 20000, balance_status: 'due', balance_paid_at: null,
  balance_due_date: '2025-03-11', final_count_due: '2025-03-01',
  payment_link_url: 'https://sq.link/old', terms_version: '2025-01-v0',
  terms_json: JSON.stringify(OLD_TERMS), note: null, created_at: 1740000000000,
};

function ownerEnv({ quotes = [OLD_ROW], onWrite = () => ({ meta: { changes: 1 } }) } = {}) {
  const kv = new Map([['session:tok-owner', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'owner@test', la: Date.now(), created: Date.now() })]]);
  const sql = [];
  const db = {
    prepare(q) {
      const flat = q.replace(/\s+/g, ' ').trim();
      const stmt = (args) => ({
        async first() {
          if (flat.includes('SELECT active FROM staff')) return { active: 1 };
          return null;
        },
        async all() {
          if (/FROM catering_quotes/i.test(flat)) return { results: quotes.map((r) => ({ ...r })) };
          return { results: [] };
        },
        async run() { sql.push({ flat, args }); return onWrite({ flat, args }); },
      });
      return { bind: (...args) => stmt(args), ...stmt([]) };
    },
  };
  return {
    DB: db, _sql: sql,
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
  };
}

const get = (env) => onRequestGet({
  env,
  request: new Request('https://x.test/api/hub/owner/catering-deposit', { headers: { Cookie: 'anejo_sess=tok-owner' } }),
});
const post = (env, body, cookie = 'anejo_sess=tok-owner') => onRequestPost({
  env,
  request: new Request('https://x.test/api/hub/owner/catering-deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }),
});

// ---------- the list the desk renders ----------

test('the desk gets the quotes with their split — and deposit + balance still sum to the total', async () => {
  const out = await (await get(ownerEnv())).json();
  assert.equal(out.ok, true);
  assert.equal(out.quotes.length, 1);
  const q = out.quotes[0];
  assert.equal(q.deposit_cents, 20000);
  assert.equal(q.balance_cents, 80000);
  assert.equal(q.deposit_cents + q.balance_cents, q.total_cents);
  assert.equal(q.deposit_status, 'paid');
  assert.equal(q.deposit_paid_at, 1741000000000, 'and WHEN it was paid, not just that it was');
  assert.equal(q.balance_due_date, '2025-03-11');
  assert.equal(q.final_count_due, '2025-03-01');
});

test('THE TERMS COME OFF THE ROW. A booked customer keeps the deal they actually agreed to', async () => {
  // This row was sold at 20% under terms version 2025-01-v0, with a cancellation policy today's
  // constants no longer offer. Every one of those has to survive the read.
  const out = await (await get(ownerEnv())).json();
  const q = out.quotes[0];

  assert.equal(q.deposit_pct, 0.20, 'the ROW’s rate');
  assert.notEqual(q.deposit_pct, DEPOSIT_PCT, 'sanity: today’s constant is a different number');
  assert.equal(q.terms.version, '2025-01-v0');
  assert.notEqual(q.terms.version, TERMS_VERSION, 'sanity: today’s version has moved on');
  assert.deepEqual(q.terms.lines, OLD_TERMS.lines, 'the copy is the snapshot, verbatim');
  assert.match(q.terms.lines.join(' '), /deposit included, comes back/,
    'a term today’s constants do not offer at all — proof nothing was re-derived');
  assert.equal(q.terms.cancellation_tiers[0].deposit_refunded, true);

  // The top-level figures describe what a NEW quote would be sold under, and are clearly separate
  // from any row's own.
  assert.equal(out.deposit_pct, DEPOSIT_PCT);
  assert.equal(out.terms_version, TERMS_VERSION);
});

test('a row with no readable terms snapshot yields null, never a fabricated one', async () => {
  const env = ownerEnv({ quotes: [{ ...OLD_ROW, terms_json: 'not json' }] });
  const q = (await (await get(env)).json()).quotes[0];
  assert.equal(q.terms, null, 'better a blank than terms this customer never saw');
  assert.equal(q.terms_json, undefined, 'the raw column is not shipped alongside the parsed one');
});

// ---------- the preview: the split, before anything is minted ----------

test('preview returns the depositSplit math and touches NOTHING — no Square, no row', async () => {
  const sq = stubSquare();
  const env = ownerEnv();
  const out = await (await post(env, { op: 'preview', total_cents: 120000, event_date: '2026-09-20' })).json();
  sq.restore();

  assert.equal(out.ok, true);
  assert.equal(out.deposit_cents, 30000);
  assert.equal(out.balance_cents, 90000);
  assert.equal(out.total_cents, 120000);
  assert.equal(out.deposit_cents + out.balance_cents, out.total_cents);
  assert.equal(out.terms.final_count_due, '2026-09-10');
  assert.equal(out.terms.balance_due_date, '2026-09-20');

  assert.equal(sq.calls.length, 0, 'a preview that contacts Square is not a preview');
  assert.equal(env._sql.length, 0, 'and it writes no row');
});

test('preview refuses the same junk the create path refuses, without a Square call', async () => {
  const sq = stubSquare();
  const env = ownerEnv();
  for (const total of [0, -100, 'abc', 10000001]) {
    const res = await post(env, { op: 'preview', total_cents: total });
    assert.equal(res.status, 400, `total_cents=${total}`);
  }
  sq.restore();
  assert.equal(sq.calls.length, 0);
  assert.equal(env._sql.length, 0);
});

// ---------- the create button ----------

test('the desk’s create button mints the deposit link for the DEPOSIT, not the total', async () => {
  const sq = stubSquare();
  const env = { ...ENV_SQUARE, ...ownerEnv() };
  const out = await (await post(env, {
    op: 'create', total_cents: 120000, guests: 60, event_date: '2026-09-20',
    customer_name: 'Marisol Reyes', customer_email: 'marisol@example.test',
  })).json();
  sq.restore();

  assert.equal(out.ok, true);
  assert.equal(out.deposit_cents, 30000);
  assert.equal(out.balance_cents, 90000);
  assert.equal(out.url, 'https://sq.link/deposit');
  assert.equal(sq.calls[0].body.order.line_items[0].base_price_money.amount, 30000);
  assert.ok(env._sql.some((s) => /INSERT INTO catering_quotes/i.test(s.flat)), 'and the quote is recorded');
});

test('a stranger reaches none of it — not the list, not the preview, not the link', async () => {
  const env = ownerEnv();
  assert.equal((await get({ ...env, SESSIONS: { async get() { return null; } } })).status, 401);
  const res = await post(env, { op: 'create', total_cents: 120000, guests: 60 }, null);
  assert.equal(res.status, 401);
  assert.equal(env._sql.length, 0);
});

// ---------- the desk itself ----------

test('the desk calls the real endpoint, for the list and for the create', () => {
  assert.match(DESK, /ENDPOINT = '\/api\/hub\/owner\/catering-deposit'/, 'one endpoint constant, not scattered strings');
  assert.match(DESK, /Owner\.get\(ENDPOINT\)/, 'the list is fetched');
  assert.match(DESK, /id="q-create"/, 'there is a create button');
  assert.match(DESK, /b\.op = 'create'/, 'and it posts the create op');
  assert.match(DESK, /op: 'preview'/, 'the split is previewed before a payable link exists');
  assert.match(DESK, /op: 'mark_balance_paid'/, 'and the balance can be closed after the event');
  assert.match(DESK, /Owner\.init\('catering'/, 'it renders the owner nav, so it is not a floating page');
});

test('the desk renders the SNAPSHOT and cannot re-derive the terms', () => {
  assert.match(DESK, /q\.terms/, 'the terms come from the row');
  assert.match(DESK, /t\.lines\.map/, 'and the customer-facing copy is the stored lines, verbatim');
  assert.match(DESK, /Number\(row && row\.deposit_pct\)/, 'the percentage shown is the row’s own');

  // The failure this guards: someone "tidying up" by hardcoding 25% or 0.25 into the desk. The
  // moment that happens, a quote sold at another rate displays a rate its customer never agreed to.
  // Comments are stripped first — the file is allowed to NAME the functions it refuses to call.
  const code = DESK.slice(DESK.indexOf('<script>', DESK.indexOf('owner.js')))
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code, /0\.25/, 'no hardcoded deposit rate in the desk');
  assert.doesNotMatch(code, /'25%'|"25%"/, 'not as a label either');
  assert.doesNotMatch(code, /termsFor|TERMS_VERSION|DEPOSIT_PCT/, 'and no attempt to rebuild the terms client-side');
});

test('every figure the owner needs to run the booking is on the card', () => {
  assert.match(DESK, />Deposit /, 'the deposit');
  assert.match(DESK, />Balance</, 'the balance');
  assert.match(DESK, />Total</, 'and the total they add up to');
  assert.match(DESK, /q\.deposit_status/, 'paid or not');
  assert.match(DESK, /q\.deposit_paid_at/, 'and when it was paid');
  assert.match(DESK, /q\.balance_due_date/, 'when the balance is due');
  assert.match(DESK, /q\.final_count_due/, 'and when the headcount locks');
  assert.match(DESK, /q\.payment_link_url/, 'plus the link to send');
});
