// THE 2026-08-25 INVOICE. Nothing malfunctioned when DGP-0004 ($1,668) was emailed to a live
// contract client — the owner clicked Send and the confirm dialog fired. Everything AROUND the
// send was wrong, and each of those is a regression that has already cost real money or
// credibility once:
//
//   1. The email carried a Square "Pay now" button to an account whose signed vendor agreement is
//      DIRECT DEPOSIT. There was no off switch: every unpaid invoice minted a card link.
//   2. The owner kept no copy of what went out, and had to open Resend to learn it had arrived.
//   3. Nothing was audited. Page views were captured; an invoice leaving the building was not.
//   4. Resend's message id — the delivery receipt — was returned by sendEmail and dropped.
//   5. It was numbered DGP-0004 for a client who had received two, because voided invoices
//      consumed numbers (COUNT(*) over a table that keeps void rows).
//
// These tests drive onRequestPost and sendEmail for real, with the network stubbed, so they fail
// if any of the five comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/hub/owner/contracts.js';
import { sendEmail } from '../../functions/_lib/email.js';
import { generateInvoice } from '../../functions/_lib/contract.js';

const MIG_CARD = readFileSync(new URL('../../migrations/0095_contract_account_card_payment.sql', import.meta.url), 'utf8');
const MIG_RESEND = readFileSync(new URL('../../migrations/0096_contract_invoice_resend_id.sql', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/contracts.html', import.meta.url), 'utf8');
const INVOICE_PAGE = readFileSync(new URL('../../public/hub/owner/invoice.html', import.meta.url), 'utf8');

const ACCOUNT = {
  id: 'acct_dgp', name: 'DGP Health & Wellness',
  billing_email: 'accounting@dgphealthandwellness.com', billing_contact: 'Ana',
  allow_card_payment: 0,
};
const INVOICE = {
  id: 'inv_4', account_id: 'acct_dgp', number: 'DGP-0004', status: 'open',
  period_from: '2026-08-10', period_to: '2026-08-19',
  lunches: 240, subtotal_cents: 154800, delivery_cents: 12000, rush_cents: 0, total_cents: 166800,
  line_items: JSON.stringify({ sites: [], delivery: { days: [], total_cents: 12000 } }),
  payment_link_url: null,
};

// Every request the code made, so "no Square link was minted" is an assertion about the network
// rather than about a return value that could be faked by any early return.
function stubFetch(calls) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, body: init && init.body ? JSON.parse(init.body) : null });
    if (u.includes('squareup')) {
      return new Response(JSON.stringify({ payment_link: { id: 'pl_1', order_id: 'ord_1', long_url: 'https://sq.link/dgp4' } }), { status: 200 });
    }
    if (u.includes('resend.com')) {
      return new Response(JSON.stringify({ id: 'msg_abc123' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  return () => { globalThis.fetch = real; };
}

// An UNROUTED query throws rather than returning null: every read here sits inside a try/catch
// that degrades silently, so a test whose SQL has drifted would keep passing while asserting
// nothing. See test/helpers/d1.js for the same rule.
function hubEnv(opts = {}) {
  const account = { ...ACCOUNT, ...(opts.account || {}) };
  const invoice = { ...INVOICE, ...(opts.invoice || {}) };
  const writes = { invoiceUpdates: [], activity: [], termsEvents: [], accountUpdates: [] };
  const sql = [];
  const kv = new Map([['session:tok-owner', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'owner@anejo', la: Date.now(), created: Date.now() })]]);

  const db = {
    prepare(raw) {
      const q = raw.replace(/\s+/g, ' ').trim();
      const stmt = (a) => ({
        async first() {
          sql.push(q);
          if (q.includes('SELECT active FROM staff')) return { active: 1 };
          if (q.includes('FROM contract_invoices WHERE id')) return a[0] === invoice.id ? { ...invoice } : null;
          if (q.includes('allow_card_payment FROM contract_accounts')) {
            // migrations/0095 not applied yet on this env → D1 throws on the unknown column.
            if (opts.noCardColumn) throw new Error('no such column: allow_card_payment');
            return { ...account };
          }
          if (q.includes('SELECT id, name, billing_email, billing_contact FROM contract_accounts')) {
            const { allow_card_payment, ...rest } = account;  // eslint-disable-line no-unused-vars
            return { ...rest };
          }
          if (q.includes('SELECT name FROM contract_accounts')) return { name: account.name };
          if (q.includes('FROM email_suppressions')) return opts.suppressed ? { email: a[0], reason: opts.suppressed } : null;
          throw new Error('Unrouted first() SQL: ' + q);
        },
        async all() {
          sql.push(q);
          throw new Error('Unrouted all() SQL: ' + q);
        },
        async run() {
          sql.push(q);
          if (q.startsWith('UPDATE contract_invoices')) { writes.invoiceUpdates.push({ sql: q, args: a }); return { meta: { changes: 1 } }; }
          if (q.startsWith('UPDATE contract_accounts')) {
            if (q.includes('allow_card_payment') && opts.noCardColumn) throw new Error('no such column: allow_card_payment');
            writes.accountUpdates.push({ sql: q, args: a });
            return { meta: { changes: opts.unknownAccount ? 0 : 1 } };
          }
          if (q.startsWith('INSERT INTO activity_log')) { writes.activity.push({ event: a[1], properties: JSON.parse(a[6] || 'null') }); return { meta: { changes: 1 } }; }
          if (q.startsWith('INSERT INTO contract_terms_events')) { writes.termsEvents.push({ event: a[3], before: JSON.parse(a[6] || '{}'), after: JSON.parse(a[7] || '{}') }); return { meta: { changes: 1 } }; }
          throw new Error('Unrouted run() SQL: ' + q);
        },
      });
      return { bind: (...a) => stmt(a), ...stmt([]) };
    },
  };

  return {
    DB: db, _writes: writes, _sql: sql, _account: account,
    RESEND_API_KEY: 'rk_test',
    SQUARE_ACCESS_TOKEN: 'sq_test', SQUARE_LOCATION_ID: 'loc_1',   // Square IS configured
    ...(opts.env || {}),
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
  };
}

const post = (env, body) => onRequestPost({
  env,
  request: new Request('https://anejocateringco.com/api/hub/owner/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'anejo_sess=tok-owner' },
    body: JSON.stringify(body),
  }),
});

const emailHtml = (calls) => {
  const c = calls.find((x) => x.url.includes('resend.com'));
  return c ? c.body.html : '';
};

// ---------------------------------------------------------------------------------------------
// TASK 1 — the card payment link is OPT-IN per account
// ---------------------------------------------------------------------------------------------

test('an account on direct deposit gets NO pay button and NO Square link is minted', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ account: { allow_card_payment: 0 } });
    const out = await (await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(calls.filter((c) => c.url.includes('squareup')).length, 0,
      'THE 8/25 DEFECT: a card link was minted for a client whose agreement is direct deposit');
    assert.ok(!/Pay \$1,?668\.00 now|>Pay /.test(emailHtml(calls)), 'and the email must carry no pay button');
    assert.ok(emailHtml(calls).includes('DGP-0004'), 'the invoice itself still goes out — the figures are the bill');
  } finally { restore(); }
});

test('an account that asked to pay by card behaves exactly as before', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ account: { allow_card_payment: 1 } });
    const out = await (await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
    assert.equal(out.ok, true, JSON.stringify(out));
    const sq = calls.filter((c) => c.url.includes('squareup'));
    assert.equal(sq.length, 1, 'one payment link, minted once');
    assert.equal(sq[0].body.order.line_items[0].base_price_money.amount, 166800, 'for the invoice total, to the cent');
    assert.ok(emailHtml(calls).includes('https://sq.link/dgp4'), 'and the email carries the button');
  } finally { restore(); }
});

test('a payment link already stored on the row is still not shown once card is off', async () => {
  // The migration deliberately does NOT null payment_link_url on existing rows — those links are
  // real and may already be in a client's hands. The gate has to hold at render time too.
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ account: { allow_card_payment: 0 }, invoice: { payment_link_url: 'https://sq.link/old' } });
    await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' });
    assert.ok(!emailHtml(calls).includes('sq.link/old'), 'a stored link must not resurface the button');
  } finally { restore(); }
});

test('on a schema without the flag, card checkout degrades to OFF — never to on', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ noCardColumn: true, account: { allow_card_payment: 1 } });
    const out = await (await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
    assert.equal(out.ok, true, 'the billing email still resolves — the invoice must not be blocked by a missing column');
    assert.equal(calls.filter((c) => c.url.includes('squareup')).length, 0,
      'the safe direction is fewer ways to pay, never one the client did not agree to');
  } finally { restore(); }
});

// The statements only — the header comment names the tables it deliberately leaves alone.
const statements = (sqlText) => sqlText.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('existing accounts default to OFF — no account silently keeps the button', () => {
  const stmts = statements(MIG_CARD);
  assert.match(stmts, /ALTER TABLE contract_accounts ADD COLUMN allow_card_payment INTEGER DEFAULT 0/);
  assert.ok(!/UPDATE|DELETE|INSERT/i.test(stmts), 'additive only — no backfill, no data rewrite');
  assert.ok(!/contract_invoices/i.test(stmts), 'and it does not touch already-sent invoices');
});

test('the owner can turn it on from the HUB, and it is off by default there too', async () => {
  assert.ok(PAGE.includes("id=\"card_' + aid + '\""), 'a checkbox on the billing block');
  assert.ok(/allow_card_payment: card \? 1 : 0/.test(PAGE), 'wired into set_billing');
  assert.ok(/acc\.allow_card_payment \? ' checked' : ''/.test(PAGE), 'ticked only when the account has it on');
  const env = hubEnv();
  const out = await (await post(env, { op: 'set_billing', account_id: 'acct_dgp', billing_email: 'ap@dgp.test', allow_card_payment: 1 })).json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.allow_card_payment, 1);
  assert.ok(env._writes.accountUpdates[0].sql.includes('allow_card_payment'), 'persisted');
});

test('a save that never mentions the flag cannot flip it in either direction', async () => {
  const env = hubEnv();
  await post(env, { op: 'set_billing', account_id: 'acct_dgp', billing_email: 'ap@dgp.test' });
  assert.ok(!env._writes.accountUpdates[0].sql.includes('allow_card_payment'),
    'an older page body must not write the column at all');
});

// ---------------------------------------------------------------------------------------------
// TASK 2 — the owner gets a copy of his own outbound customer mail
// ---------------------------------------------------------------------------------------------

test('with OWNER_BCC set, the invoice send carries it', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ env: { OWNER_BCC: 'dayan@anejocateringco.com' } });
    await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' });
    const body = calls.find((c) => c.url.includes('resend.com')).body;
    assert.deepEqual(body.bcc, ['dayan@anejocateringco.com']);
    assert.deepEqual(body.to, ['accounting@dgphealthandwellness.com'], 'and the client is still the recipient');
  } finally { restore(); }
});

test('with OWNER_BCC unset, the request body is what it has always been', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv();
    await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' });
    const body = calls.find((c) => c.url.includes('resend.com')).body;
    assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'to'],
      'no new key appears when the var is absent');
  } finally { restore(); }
});

test('the owner is not bcc-ed a copy of an email addressed to himself', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ env: { OWNER_BCC: 'dayan@anejocateringco.com' } });
    await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4', to: 'Dayan@AnejoCateringCo.com' });
    const body = calls.find((c) => c.url.includes('resend.com')).body;
    assert.equal(body.bcc, undefined, 'DGP-0002 really was sent to the owner’s own address');
  } finally { restore(); }
});

test('nothing else starts copying the owner — bcc is per call, never global', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    // A magic link / order confirmation goes through the same sendEmail with no bcc argument.
    await sendEmail({ RESEND_API_KEY: 'rk', OWNER_BCC: 'dayan@anejocateringco.com' },
      { to: 'client@example.com', subject: 'Sign in', html: '<p>hi</p>' });
    const body = calls.find((c) => c.url.includes('resend.com')).body;
    assert.equal(body.bcc, undefined, 'sendEmail must not read OWNER_BCC on its own');
  } finally { restore(); }
});

test('a suppressed primary recipient still short-circuits before any send', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv({ suppressed: 'bounced' });
    const out = await (await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
    assert.equal(out.ok, undefined, 'a silent no-op send must never be reported as sent');
    assert.match(out.error, /suppressed/);
    assert.equal(calls.filter((c) => c.url.includes('resend.com')).length, 0, 'and nothing left the building');
    assert.equal(env._writes.invoiceUpdates.length, 0, 'the invoice is not moved to sent either');
  } finally { restore(); }
});

// ---------------------------------------------------------------------------------------------
// TASK 3 — the four money events are audited
// ---------------------------------------------------------------------------------------------

test('sending an invoice writes exactly one audit event, with no client address in it', async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv();
    await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' });
    const ev = env._writes.activity.filter((e) => e.event === 'contract.invoice_sent');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].properties.number, 'DGP-0004');
    assert.equal(ev[0].properties.total_cents, 166800);
    assert.equal(ev[0].properties.sent_to_domain, 'dgphealthandwellness.com');
    const props = JSON.stringify(ev[0].properties);
    assert.ok(!props.includes('accounting@'), 'the full AP address must never reach analytics');
  } finally { restore(); }
});

test('marking paid and voiding are each audited once', async () => {
  const paidEnv = hubEnv();
  await post(paidEnv, { op: 'mark_paid', account_id: 'acct_dgp', invoice_id: 'inv_4', paid_ref: 'ACH 8821' });
  assert.equal(paidEnv._writes.activity.filter((e) => e.event === 'contract.invoice_paid').length, 1);

  const voidEnv = hubEnv();
  await post(voidEnv, { op: 'void_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' });
  assert.equal(voidEnv._writes.activity.filter((e) => e.event === 'contract.invoice_voided').length, 1);
});

test('a refused operation emits nothing', async () => {
  const env = hubEnv({ invoice: { status: 'void' } });
  const out = await (await post(env, { op: 'mark_paid', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
  assert.equal(out.ok, undefined);
  assert.equal(env._writes.activity.length, 0, 'a failed close must not read as money received');
});

test('changing who receives an invoice is recorded before-and-after', async () => {
  const env = hubEnv();
  await post(env, { op: 'set_billing', account_id: 'acct_dgp', billing_email: 'newap@dgp.test', allow_card_payment: 1 });
  const ev = env._writes.termsEvents.find((e) => e.event === 'billing_changed');
  assert.ok(ev, 'an append-only row, the same shape the terms history uses');
  assert.equal(ev.before.billing_email, 'accounting@dgphealthandwellness.com');
  assert.equal(ev.after.billing_email, 'newap@dgp.test');
  assert.equal(ev.before.allow_card_payment, 0);
  assert.equal(ev.after.allow_card_payment, 1);
  const analytics = env._writes.activity.find((e) => e.event === 'contract.billing_contact_set');
  assert.equal(analytics.properties.email_domain, 'dgp.test', 'analytics gets the domain only');
  assert.ok(!JSON.stringify(analytics.properties).includes('newap@'));
});

// ---------------------------------------------------------------------------------------------
// TASK 4 — Resend's message id is kept
// ---------------------------------------------------------------------------------------------

test("the send stores Resend's message id alongside sent_at", async () => {
  const calls = [];
  const restore = stubFetch(calls);
  try {
    const env = hubEnv();
    const out = await (await post(env, { op: 'send_invoice', account_id: 'acct_dgp', invoice_id: 'inv_4' })).json();
    assert.equal(out.resend_message_id, 'msg_abc123');
    const upd = env._writes.invoiceUpdates.find((u) => u.sql.includes('resend_message_id'));
    assert.ok(upd, 'in the same UPDATE that writes sent_at/sent_to — one row answers the whole question');
    assert.ok(upd.args.includes('msg_abc123'));
    assert.ok(upd.args.includes('accounting@dgphealthandwellness.com'));
  } finally { restore(); }
});

test('the owner can see the receipt without leaving the product', () => {
  assert.match(statements(MIG_RESEND), /ALTER TABLE contract_invoices ADD COLUMN resend_message_id TEXT/);
  assert.ok(INVOICE_PAGE.includes('inv.resend_message_id'), 'surfaced on the invoice page');
});

// ---------------------------------------------------------------------------------------------
// TASK 5 — a void no longer burns an invoice number
// ---------------------------------------------------------------------------------------------

test('with 0001 void, 0002 void, 0003 and 0004 issued, the next number is DGP-0005', async () => {
  // The real DGP row set on 2026-08-25. Under COUNT(*) this produced DGP-0005 too — but only
  // because the voids were counted; the client had received two invoices and the third read 0004.
  // What this pins is the rule going forward: the sequence follows the HIGHEST number issued.
  const numbers = ['DGP-0001', 'DGP-0002', 'DGP-0003', 'DGP-0004'];
  const seen = [];
  const env = {
    DB: {
      prepare(raw) {
        const q = raw.replace(/\s+/g, ' ').trim();
        const stmt = () => ({
          async first() {
            seen.push(q);
            if (q.includes('FROM contract_accounts')) return { id: 'acct_dgp', name: 'DGP Health & Wellness' };
            if (q.includes('MAX(CAST(substr(number')) {
              const max = numbers.reduce((m, n) => Math.max(m, Number(n.split('-')[1])), 0);
              return { n: max };
            }
            if (q.includes('COUNT(*)')) throw new Error('COUNT(*) counts voided rows — that is the bug');
            throw new Error('Unrouted first() SQL: ' + q);
          },
          async all() {
            seen.push(q);
            if (q.includes('FROM contract_orders')) {
              return { results: [{ id: 'co_1', site_id: 's1', service_date: '2026-08-20', headcount: 20, price_per_lunch_cents: 600, rush_fee_cents: 0, delivery_fee_cents: 2000, total_cents: 14000, is_rush: 0 }] };
            }
            if (q.includes('FROM contract_sites')) return { results: [{ id: 's1', name: 'Boynton' }] };
            throw new Error('Unrouted all() SQL: ' + q);
          },
          async run() { seen.push(q); return { meta: { changes: 1 } }; },
        });
        return { bind: () => stmt(), ...stmt() };
      },
    },
  };
  const r = await generateInvoice(env, { accountId: 'acct_dgp' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.number, 'DGP-0005', 'the sequence steps OVER the voids rather than reusing a number');
  assert.ok(seen.some((q) => q.includes('MAX(CAST(substr(number')), 'and it asks for the highest number, not a row count');
});

test('a gap is acceptable; a reused number is not', async () => {
  // Only 0004 survives (0001-0003 were deleted or never numbered). The next invoice is 0005, NOT
  // 0002 — DGP-0004 is in a customer's payables system and two bills sharing a number is worse
  // than a hole in the sequence.
  const env = {
    DB: {
      prepare(raw) {
        const q = raw.replace(/\s+/g, ' ').trim();
        const stmt = () => ({
          async first() {
            if (q.includes('FROM contract_accounts')) return { id: 'acct_dgp', name: 'DGP Health & Wellness' };
            if (q.includes('MAX(CAST(substr(number')) return { n: 4 };
            throw new Error('Unrouted first() SQL: ' + q);
          },
          async all() {
            if (q.includes('FROM contract_orders')) return { results: [{ id: 'co_1', site_id: 's1', service_date: '2026-08-20', headcount: 20, price_per_lunch_cents: 600, rush_fee_cents: 0, delivery_fee_cents: 2000, total_cents: 14000, is_rush: 0 }] };
            if (q.includes('FROM contract_sites')) return { results: [] };
            throw new Error('Unrouted all() SQL: ' + q);
          },
          async run() { return { meta: { changes: 1 } }; },
        });
        return { bind: () => stmt(), ...stmt() };
      },
    },
  };
  assert.equal((await generateInvoice(env, { accountId: 'acct_dgp' })).number, 'DGP-0005');
});

test('an account with no invoices yet still starts at 0001', async () => {
  const env = {
    DB: {
      prepare(raw) {
        const q = raw.replace(/\s+/g, ' ').trim();
        const stmt = () => ({
          async first() {
            if (q.includes('FROM contract_accounts')) return { id: 'acct_new', name: 'Coastal Family Medicine' };
            if (q.includes('MAX(CAST(substr(number')) return { n: null };   // MAX over no rows
            throw new Error('Unrouted first() SQL: ' + q);
          },
          async all() {
            if (q.includes('FROM contract_orders')) return { results: [{ id: 'co_1', site_id: 's1', service_date: '2026-08-20', headcount: 10, price_per_lunch_cents: 600, rush_fee_cents: 0, delivery_fee_cents: 2000, total_cents: 8000, is_rush: 0 }] };
            if (q.includes('FROM contract_sites')) return { results: [] };
            throw new Error('Unrouted all() SQL: ' + q);
          },
          async run() { return { meta: { changes: 1 } }; },
        });
        return { bind: () => stmt(), ...stmt() };
      },
    },
  };
  assert.equal((await generateInvoice(env, { accountId: 'acct_new' })).number, 'COASTAL-0001');
});

// ---------------------------------------------------------------------------------------------
// TASK 6 — a FIRST send to an address gets a second look; a routine re-send does not
// ---------------------------------------------------------------------------------------------

// Two shapes of D1 for getInvoice: one that can answer "who have we invoiced here before", and
// one on an older schema that cannot.
function invoiceReadEnv({ sentTo, throwOnHistory } = {}) {
  return {
    DB: {
      prepare(raw) {
        const q = raw.replace(/\s+/g, ' ').trim();
        const stmt = () => ({
          async first() {
            if (q.includes('FROM contract_invoices WHERE id')) return { ...INVOICE };
            if (q.includes('FROM contract_accounts')) return { name: ACCOUNT.name, billing_email: ACCOUNT.billing_email, billing_contact: 'Ana' };
            throw new Error('Unrouted first() SQL: ' + q);
          },
          async all() {
            if (q.includes('DISTINCT sent_to')) {
              if (throwOnHistory) throw new Error('no such column: sent_to');
              return { results: (sentTo || []).map((e) => ({ sent_to: e })) };
            }
            throw new Error('Unrouted all() SQL: ' + q);
          },
          async run() { return { meta: { changes: 1 } }; },
        });
        return { bind: () => stmt(), ...stmt() };
      },
    },
  };
}

test('the invoice page is told which addresses this account has been invoiced at', async () => {
  const { getInvoice } = await import('../../functions/_lib/contract.js');
  const r = await getInvoice(invoiceReadEnv({ sentTo: ['Accounting@DGPhealthandwellness.com', 'dayan@dayanrealtyhub.com'] }), 'inv_4');
  assert.equal(r.ok, true);
  assert.deepEqual(r.known_recipients, ['accounting@dgphealthandwellness.com', 'dayan@dayanrealtyhub.com'],
    'normalised, so a capitalisation difference is not read as a new company');
});

test("when the schema can't answer, every send stays routine — unknown is not a warning", async () => {
  const { getInvoice } = await import('../../functions/_lib/contract.js');
  const r = await getInvoice(invoiceReadEnv({ throwOnHistory: true }), 'inv_4');
  assert.equal(r.known_recipients, null, 'null, not [] — [] would put a warning in front of every send');
  assert.ok(/if\(!Array\.isArray\(known\)\) return false;/.test(INVOICE_PAGE), 'and the page treats null as "known"');
});

test('the escalation is an inline panel with its own deliberate second click', () => {
  assert.ok(INVOICE_PAGE.includes("id='first-contact'") || INVOICE_PAGE.includes('first-contact'), 'a panel, not another confirm dialog');
  assert.ok(INVOICE_PAGE.includes('btn-send-anyway'), 'which requires its own click to actually send');
  assert.ok(/never been invoiced at/.test(INVOICE_PAGE), 'and says what is unusual about this send');
  assert.ok(/window\.confirm\('Email invoice '/.test(INVOICE_PAGE),
    'a routine re-send keeps the one-tap confirm it already had — no new friction there');
});

// ---------------------------------------------------------------------------------------------
// TASK 7 — a voided invoice reads as cancelled, not as money owed
// ---------------------------------------------------------------------------------------------

test('a void row is chipped and struck through in the desk list', () => {
  assert.ok(/var isVoid = v\.status === 'void'/.test(PAGE));
  assert.ok(/>VOID</.test(PAGE), 'a chip up front');
  assert.ok(/text-decoration:line-through/.test(PAGE), 'and the amount struck through');
});

test('the printable page stamps VOID instead of quoting a total due', () => {
  assert.ok(/<span class="stamp">VOID<\/span>/.test(INVOICE_PAGE));
  assert.ok(/Void — nothing due/.test(INVOICE_PAGE), 'a cancelled document must not read "Total due $1,668"');
});

test('autopay never charges a voided invoice', () => {
  // The one place a total IS computed across an account's invoices. It already filters — this
  // pins it, because a void row keeps its total_cents and would otherwise be chargeable.
  const AUTOPAY = readFileSync(new URL('../../functions/api/hub/owner/autopay.js', import.meta.url), 'utf8');
  const TICK = readFileSync(new URL('../../functions/api/hub/admin/autopay-tick.js', import.meta.url), 'utf8');
  assert.ok(/status IN \('open','sent'\)/.test(AUTOPAY));
  assert.ok(/status IN \('open','sent'\)/.test(TICK));
});
