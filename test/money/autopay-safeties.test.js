// B2B autopay + payouts, and the two safeties in front of them — Decision #13.
//
// WHAT WAS TRUE BEFORE. `weekly_autopay` was a string in a list (_lib/contract.js:7-8). Invoices
// were generated and emailed; nothing in the codebase had ever charged a card. Payouts were the
// mirror image — rows could be flipped to 'paid' with no record that anyone had agreed to the
// number.
//
// Dayan's requirement was "an on/off switch button to the hub that is visible and properly wired
// so I can turn it on and off as I please, OR leave it on with the rule that it doesn't send
// unless Dayan approves the number." Both are built, because they answer different questions, and
// this file is mostly about proving that NEITHER can be bypassed:
//
//     OFF                    → no charge, and Square is never contacted
//     ON  + unapproved       → no charge, and Square is never contacted
//     ON  + approved a DIFFERENT amount → no charge, and Square is never contacted
//     ON  + approved this exact amount  → the charge path runs
//
// The "Square is never contacted" half matters as much as "no charge": a refusal that happens
// after the request is in flight is not a refusal.
//
// Square is stubbed at `fetch`. Nothing in this file can touch live money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import {
  getAutopaySettings, setAutopaySetting, approveInvoiceCharge, revokeInvoiceApproval,
  chargeContractInvoice, approvePayout, consumePayoutApproval, authorizePayout, AUTOPAY_KEYS,
} from '../../functions/_lib/autopay.js';

const ENV = { SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox' };

const ACCOUNT = {
  id: 'acct_1', name: 'Delray Grand Prix', square_customer_id: 'cus_1', square_card_id: 'card_1',
  card_brand: 'VISA', card_last4: '4242',
};
const INVOICE = {
  id: 'inv_1', account_id: 'acct_1', number: 'DGP-0007', total_cents: 120000, status: 'sent',
  autopay_approved_at: null, autopay_approved_cents: null,
};

// Records every Square request. Any call at all during a refusal is a test failure.
function stubSquare(payment = { payment: { id: 'sqpay_1', status: 'COMPLETED' } }, ok = true) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok, status: ok ? 200 : 402, json: async () => payment };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

function db({ settings = {}, invoice = INVOICE, account = ACCOUNT, extra = [] } = {}) {
  const writes = [];
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
  return makeD1([
    [/FROM app_settings WHERE key IN/i, () => rows],
    [/INSERT INTO app_settings/i, ({ args }) => { writes.push(args); return 1; }],
    [/FROM contract_invoices WHERE id/i, () => invoice],
    [/FROM contract_accounts WHERE id/i, () => account],
    [/UPDATE contract_invoices/i, ({ args, sql }) => { writes.push({ sql, args }); return 1; }],
    [/INSERT INTO money_movements/i, ({ args }) => { writes.push({ movement: args }); return 1; }],
    ...extra,
  ]);
}
const movements = (DB) => DB.calls.filter((c) => /INSERT INTO money_movements/.test(c.sql)).map((c) => ({
  kind: c.args[1], ref_id: c.args[3], amount: c.args[4], outcome: c.args[5], reason: c.args[6],
}));

// ---------- the switches ----------

test('BOTH SWITCHES DEFAULT OFF — an unset key is off, not "assume yes"', async () => {
  const s = await getAutopaySettings({ DB: db() });
  assert.equal(s.contracts_enabled, false);
  assert.equal(s.payouts_enabled, false);
});

test('an unreadable settings table FAILS CLOSED', async () => {
  // The failure mode of a broken settings read must be "no money moves", never
  // "money moves on last-known-good".
  const boom = makeD1([[/FROM app_settings/i, () => { throw new Error('D1 down'); }]]);
  const s = await getAutopaySettings({ DB: boom });
  assert.equal(s.contracts_enabled, false);
  assert.equal(s.payouts_enabled, false);
  assert.equal(s.degraded, true, 'and it says so, rather than looking like a deliberate OFF');
});

test('the switches live in app_settings, so flipping one needs no deploy', async () => {
  const DB = db();
  const r = await setAutopaySetting({ DB }, 'contracts', true, 'dayan@example.test');
  assert.equal(r.ok, true);
  assert.equal(r.key, AUTOPAY_KEYS.contracts);
  const w = DB.calls.find((c) => /INSERT INTO app_settings/.test(c.sql));
  assert.equal(w.args[1], '1');
  assert.equal(w.args[2], 'dayan@example.test', 'who flipped it is recorded');
  assert.equal((await setAutopaySetting({ DB }, 'nonsense', true)).ok, false);
});

// ---------- OFF ----------

test('AUTOPAY OFF → NO CHARGE, and Square is never even contacted', async () => {
  const sq = stubSquare();
  const DB = db();   // both switches unset → off
  const r = await chargeContractInvoice({ ...ENV, DB },
    { ...INVOICE, autopay_approved_at: 1, autopay_approved_cents: 120000 });
  sq.restore();

  assert.equal(r.charged, false);
  assert.equal(r.reason, 'autopay_off');
  assert.equal(sq.calls.length, 0, 'a refusal after the request is in flight is not a refusal');
  const m = movements(DB).find((x) => x.reason === 'autopay_off');
  assert.ok(m, 'the refusal is on the record — that is how you answer "why was this not charged?"');
  assert.equal(m.outcome, 'refused');
});

// ---------- ON, but unapproved ----------

test('ON + NEVER APPROVED → NO CHARGE, and Square is never contacted', async () => {
  const sq = stubSquare();
  const DB = db({ settings: { [AUTOPAY_KEYS.contracts]: '1' } });
  const r = await chargeContractInvoice({ ...ENV, DB }, INVOICE);
  sq.restore();

  assert.equal(r.charged, false);
  assert.equal(r.reason, 'not_approved');
  assert.equal(sq.calls.length, 0);
});

test('ON + APPROVED A DIFFERENT AMOUNT → NO CHARGE. Approving $1,200 never authorises $2,400', async () => {
  // The exact failure this exists to prevent: a late headcount or a corrected rate moves the
  // invoice total after somebody approved it, and the old approval silently covers the new number.
  const sq = stubSquare();
  const DB = db({ settings: { [AUTOPAY_KEYS.contracts]: '1' } });
  const r = await chargeContractInvoice({ ...ENV, DB },
    { ...INVOICE, total_cents: 240000, autopay_approved_at: 1, autopay_approved_cents: 120000 });
  sq.restore();

  assert.equal(r.charged, false);
  assert.equal(r.reason, 'amount_changed');
  assert.equal(sq.calls.length, 0);
  assert.ok(movements(DB).some((m) => m.reason === 'amount_changed'));
});

test('ON + APPROVED but NO CARD ON FILE → NO CHARGE, and Square is never contacted', async () => {
  const sq = stubSquare();
  const DB = db({
    settings: { [AUTOPAY_KEYS.contracts]: '1' },
    account: { ...ACCOUNT, square_card_id: null, square_customer_id: null },
  });
  const r = await chargeContractInvoice({ ...ENV, DB },
    { ...INVOICE, autopay_approved_at: 1, autopay_approved_cents: 120000 });
  sq.restore();
  assert.equal(r.charged, false);
  assert.equal(r.reason, 'no_card_on_file');
  assert.equal(sq.calls.length, 0);
});

test('a paid or void invoice is never charged again, switch or no switch', async () => {
  const sq = stubSquare();
  const DB = db({ settings: { [AUTOPAY_KEYS.contracts]: '1' } });
  for (const status of ['paid', 'void']) {
    const r = await chargeContractInvoice({ ...ENV, DB },
      { ...INVOICE, status, autopay_approved_at: 1, autopay_approved_cents: 120000 });
    assert.equal(r.charged, false, status);
  }
  sq.restore();
  assert.equal(sq.calls.length, 0);
});

// ---------- ON + approved ----------

test('ON + APPROVED THIS EXACT AMOUNT → the charge path runs, for exactly that amount', async () => {
  const sq = stubSquare();
  const DB = db({ settings: { [AUTOPAY_KEYS.contracts]: '1' } });
  const r = await chargeContractInvoice({ ...ENV, DB },
    { ...INVOICE, autopay_approved_at: 1, autopay_approved_cents: 120000 }, { actor: 'cron' });
  sq.restore();

  assert.equal(r.charged, true);
  assert.equal(r.payment_id, 'sqpay_1');
  assert.equal(sq.calls.length, 1);
  assert.match(sq.calls[0].url, /\/v2\/payments$/);
  const body = sq.calls[0].body;
  assert.equal(body.amount_money.amount, 120000, 'the approved number, nothing else');
  assert.equal(body.source_id, 'card_1');
  assert.equal(body.customer_id, 'cus_1');
  assert.equal(body.idempotency_key, 'ctinv_inv_1',
    'derived from the invoice, not the moment — a retried tick reuses it instead of charging twice');

  const upd = DB.calls.find((c) => /UPDATE contract_invoices SET status='paid'/.test(c.sql));
  assert.ok(upd, 'the invoice closes');
  assert.match(upd.sql, /autopay_approved_at=NULL/,
    'THE APPROVAL IS CONSUMED — a second charge would have to be approved all over again');
  assert.ok(movements(DB).some((m) => m.outcome === 'charged' && m.amount === 120000));
});

test('a Square failure is recorded as failed, not as paid', async () => {
  const sq = stubSquare({ errors: [{ detail: 'CARD_DECLINED' }] }, false);
  const DB = db({ settings: { [AUTOPAY_KEYS.contracts]: '1' } });
  const r = await chargeContractInvoice({ ...ENV, DB },
    { ...INVOICE, autopay_approved_at: 1, autopay_approved_cents: 120000 });
  sq.restore();
  assert.equal(r.charged, false);
  assert.equal(r.reason, 'square_error');
  assert.match(r.error, /CARD_DECLINED/);
  assert.equal(DB.calls.some((c) => /status='paid'/.test(c.sql)), false, 'a declined card is not a paid invoice');
  assert.ok(movements(DB).some((m) => m.outcome === 'failed'));
});

// ---------- the approval itself ----------

test('an approval must NAME the amount, and it must match the invoice', async () => {
  const DB = db();
  const wrong = await approveInvoiceCharge({ DB }, { invoiceId: 'inv_1', amountCents: 60000, actor: 'd@x.test' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /\$1200\.00.*not.*\$600\.00/, 'it tells you what the invoice actually is');

  const right = await approveInvoiceCharge({ DB }, { invoiceId: 'inv_1', amountCents: 120000, actor: 'd@x.test' });
  assert.equal(right.ok, true);
  assert.equal(right.approved_cents, 120000);
  const upd = DB.calls.find((c) => /autopay_approved_cents=\?/.test(c.sql));
  assert.equal(upd.args[1], 'd@x.test', 'who approved it is recorded');
});

test('the approval endpoint refuses to read the amount off the row it is approving', () => {
  // An approval that derives its own number is a rubber stamp, not an approval.
  const src = readFileSync(new URL('../../functions/api/hub/owner/autopay.js', import.meta.url), 'utf8');
  assert.match(src, /if \(b\.amount_cents == null\) return bad/,
    'the caller must state the number a human read');
});

test('an approval can be withdrawn, which is why the switch is not the only brake', async () => {
  const DB = db();
  const r = await revokeInvoiceApproval({ DB }, { invoiceId: 'inv_1', actor: 'd@x.test' });
  assert.equal(r.ok, true);
  assert.match(DB.calls.find((c) => /autopay_approved_at=NULL/.test(c.sql)).sql, /autopay_approved_cents=NULL/);
});

test('an already-paid or void invoice cannot be approved for charging', async () => {
  for (const status of ['paid', 'void']) {
    const r = await approveInvoiceCharge({ DB: db({ invoice: { ...INVOICE, status } }) },
      { invoiceId: 'inv_1', amountCents: 120000 });
    assert.equal(r.ok, false, status);
  }
});

// ---------- payouts ----------

function payoutDb({ settings = {}, approval = null, consume = 1 } = {}) {
  return makeD1([
    [/FROM app_settings WHERE key IN/i, () => Object.entries(settings).map(([key, value]) => ({ key, value }))],
    [/INSERT INTO payout_approvals/i, () => 1],
    [/FROM payout_approvals/i, () => approval],
    [/UPDATE payout_approvals SET consumed_at/i, () => consume],
    [/INSERT INTO money_movements/i, () => 1],
  ]);
}

test('PAYOUTS OFF → refused, and no approval is even consumed', async () => {
  const DB = payoutDb({ approval: { id: 'pa_1' } });
  const r = await authorizePayout({ DB }, { kind: 'driver', subjectId: 'stf_1', amountCents: 9500 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'payouts_off');
  assert.match(r.error, /Finance → Automatic payments/, 'it says where the switch is');
  assert.equal(DB.calls.some((c) => /UPDATE payout_approvals/.test(c.sql)), false,
    'a refused payout must not burn the approval it did not use');
});

test('PAYOUTS ON + UNAPPROVED → refused', async () => {
  const DB = payoutDb({ settings: { [AUTOPAY_KEYS.payouts]: '1' }, approval: null });
  const r = await authorizePayout({ DB }, { kind: 'driver', subjectId: 'stf_1', amountCents: 9500 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_approved');
  assert.match(r.error, /\$95\.00/, 'it names the amount that needs approving');
});

test('PAYOUTS ON + APPROVED THIS EXACT AMOUNT → authorised, and the approval is spent', async () => {
  const DB = payoutDb({ settings: { [AUTOPAY_KEYS.payouts]: '1' }, approval: { id: 'pa_1' } });
  const r = await authorizePayout({ DB }, { kind: 'driver', subjectId: 'stf_1', amountCents: 9500, ref: 'days:14' });
  assert.equal(r.ok, true);
  assert.equal(r.approval_id, 'pa_1');
  const sel = DB.calls.find((c) => /FROM payout_approvals/.test(c.sql));
  assert.match(sel.sql, /amount_cents=\?/, 'matched on the EXACT cents');
  assert.match(sel.sql, /consumed_at IS NULL/, 'and only an unused one');
  assert.equal(sel.args[2], 9500);
});

test('one approval can never pay twice — the consume is a conditional UPDATE', async () => {
  // Two concurrent mark-paid calls both find the row; only the one whose UPDATE changes a row wins.
  const DB = payoutDb({ settings: { [AUTOPAY_KEYS.payouts]: '1' }, approval: { id: 'pa_1' }, consume: 0 });
  const r = await authorizePayout({ DB }, { kind: 'driver', subjectId: 'stf_1', amountCents: 9500 });
  assert.equal(r.ok, false, 'the loser of the race is refused');
  assert.equal(r.reason, 'not_approved');
});

test('an approval for a different amount does not cover this payout', async () => {
  // The SELECT is amount-bound, so a $50 approval simply does not match a $95 payout.
  const DB = payoutDb({ settings: { [AUTOPAY_KEYS.payouts]: '1' }, approval: null });
  assert.equal(await consumePayoutApproval({ DB }, { kind: 'driver', subjectId: 'stf_1', amountCents: 9500 }), null);
});

test('a payout approval refuses junk rather than approving something vague', async () => {
  const DB = payoutDb();
  assert.equal((await approvePayout({ DB }, { kind: 'nobody', subjectId: 's', amountCents: 100 })).ok, false);
  assert.equal((await approvePayout({ DB }, { kind: 'driver', subjectId: '', amountCents: 100 })).ok, false);
  assert.equal((await approvePayout({ DB }, { kind: 'driver', subjectId: 's', amountCents: 0 })).ok, false);
  assert.equal((await approvePayout({ DB }, { kind: 'driver', subjectId: 's', amountCents: -5 })).ok, false);
});

// ---------- the wiring ----------

test('the payout endpoints compute the amount THEMSELVES and gate before touching a row', () => {
  // "Approve $500, mark $5,000" must be impossible: the approval is checked against the number the
  // endpoint computed from the ledger, never against one the caller sent.
  const pay = readFileSync(new URL('../../functions/api/hub/owner/payouts.js', import.meta.url), 'utf8');
  const authIdx = pay.indexOf('authorizePayout(env');
  const updIdx = pay.indexOf("UPDATE routes SET pay_status='paid'");
  assert.ok(authIdx > -1 && updIdx > authIdx, 'the gate comes before the UPDATE');
  assert.match(pay, /amountCents: total/, 'the computed total, not a body field');

  const partners = readFileSync(new URL('../../functions/api/hub/owner/partners.js', import.meta.url), 'utf8');
  const pAuth = partners.indexOf('authorizePayout(env');
  const pUpd = partners.indexOf("UPDATE rev_share_events SET payout_status='paid'");
  assert.ok(pAuth > -1 && pUpd > pAuth, 'affiliate payouts are gated the same way');
});

test('the tick short-circuits on OFF before it enumerates anything', () => {
  const src = readFileSync(new URL('../../functions/api/hub/admin/autopay-tick.js', import.meta.url), 'utf8');
  const offIdx = src.indexOf('if (!settings.contracts_enabled)');
  const queryIdx = src.indexOf('FROM contract_invoices');
  assert.ok(offIdx > -1 && queryIdx > offIdx, '"off" has to mean off at the top of the function');
});

test('the toggle is actually IN the owner hub and wired to a real endpoint', () => {
  const html = readFileSync(new URL('../../public/hub/owner/finance.html', import.meta.url), 'utf8');
  assert.match(html, /Automatic payments/, 'visible section');
  assert.match(html, /op: 'set', which: which, on: next/, 'wired to the real switch endpoint');
  assert.match(html, /\/api\/hub\/owner\/autopay/);
  assert.match(html, /op: 'approve_invoice'/, 'and the per-amount approval is there too');
  assert.match(html, /Turn OFF|Turn ON/, 'a button, not a status line');

  const payouts = readFileSync(new URL('../../public/hub/owner/payouts.html', import.meta.url), 'utf8');
  assert.match(payouts, /op: 'approve_payout'/, 'the payouts page carries the approve step');
  assert.match(payouts, /payouts_off/, 'and explains the refusal rather than showing a bare error');
});
