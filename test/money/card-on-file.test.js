// CARD ON FILE for a B2B contract account — the writer that never existed.
//
// THE DEAD END. migrations/0086 added contract_accounts.square_customer_id and .square_card_id,
// and _lib/autopay.js:188 refuses any charge without both. Nothing in the codebase ever WROTE
// either column, so the fourth gate of chargeContractInvoice refused every account there has ever
// been. Autopay could be switched on, an invoice approved to the exact cent, and the answer was
// still `no_card_on_file`. This file proves the door now exists, and that it is the right shape:
//
//   1. NOTHING IS CHARGED HERE, EVER. /v2/customers and /v2/cards, never /v2/payments.
//   2. THE PAN NEVER REACHES US, and a form that tries to send one is refused, not forwarded.
//   3. THE CONSENT IS STORED AS THE TEXT THEY READ, with who agreed and when.
//   4. THE SWITCH IS OFF UNTIL SOMEBODY TURNS IT ON.
//   5. AUTOPAY IS UNCHANGED. A card makes charging POSSIBLE; the switch and the per-amount
//      approval still decide whether it happens.
//
// Square is stubbed at `fetch` throughout — no live Cards-API round-trip is exercised here. See
// the note above the "faithful stub" section for exactly what that does and does not prove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import {
  saveCardOnFile, removeCardOnFile, looksLikeCardNumber,
  CARD_CONSENT_TEXT, CARD_CONSENT_VERSION,
} from '../../functions/_lib/card_on_file.js';
import { chargeContractInvoice, getAutopaySettings, AUTOPAY_KEYS } from '../../functions/_lib/autopay.js';
import { onRequestGet, onRequestPost } from '../../functions/api/contract/card.js';

const ENV = { SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox' };
const ACCOUNT = { id: 'acct_1', name: 'Delray Grand Prix', billing_email: 'ap@dgp.test' };

// A REAL-ENOUGH card number, for the one thing it is used for: proving we refuse it. It is the
// Square/Visa documented test PAN, it is not a live instrument, and it never leaves this file.
const TEST_PAN = '4111111111111111';

// ── the faithful stub ─────────────────────────────────────────────────────────
// WHAT THIS DOES NOT PROVE. No live Square Cards-API round-trip is exercised anywhere in this
// repo's test suite (there is no sandbox credential in CI, and reaching one would make the suite
// depend on a third party's uptime). So the stub answers with the SHAPE the Cards API documents —
// { card: { id, card_brand, last_4, … } } and { customer: { id } } — and every assertion below is
// about OUR behaviour given that shape: what we send, what we refuse to send, and what we write.
// A change in Square's response shape would not be caught here. It would be caught the first time
// a card is added in sandbox, which is the honest place for that check to live.
function stubSquare({ customer = { customer: { id: 'cus_new' } }, card = { card: { id: 'ccof_1', card_brand: 'VISA', last_4: '4242', exp_month: 12, exp_year: 2030 } }, ok = true } = {}) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = JSON.parse((init && init.body) || '{}');
    calls.push({ url: u, body });
    return { ok, status: ok ? 200 : 400, json: async () => (/\/v2\/customers/.test(u) ? customer : card) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

function cardDb({ settings = {}, onUpdate = () => 1 } = {}) {
  const rows = Object.entries(settings).map(([key, value]) => ({ key, value }));
  return makeD1([
    [/FROM app_settings WHERE key IN/i, () => rows],
    [/UPDATE contract_accounts SET/i, ({ args }) => onUpdate({ args })],
    [/INSERT INTO money_movements/i, () => 1],
  ]);
}
const ON = { [AUTOPAY_KEYS.card_capture]: '1' };

// Every STRING argument this module ever bound to a statement. The PAN hunt below reads this.
// String-typed on purpose: a card number arrives as a JSON string and would be bound as one, while
// the numeric binds here are epoch-millisecond timestamps — themselves 13 digits, and not cards.
const allArgs = (DB) => DB.calls.flatMap((c) => (c.args || []).filter((a) => typeof a === 'string'));

// ---------- 1. the switch ----------

test('THE CARD-CAPTURE SWITCH DEFAULTS OFF — shipping the page opens no door', async () => {
  const s = await getAutopaySettings({ DB: cardDb() });
  assert.equal(s.card_capture_enabled, false);
  // And it is a THIRD switch, not a rename of an existing one.
  assert.equal(s.contracts_enabled, false);
  assert.equal(s.payouts_enabled, false);
  assert.equal(AUTOPAY_KEYS.card_capture, 'autopay.card_capture_enabled');
});

test('switch OFF → no card stored, and Square is never contacted', async () => {
  const sq = stubSquare();
  const DB = cardDb();
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(r.stored, false);
  assert.equal(r.reason, 'card_capture_off');
  assert.equal(sq.calls.length, 0, 'a refusal after the request is in flight is not a refusal');
  assert.equal(DB.calls.some((c) => /UPDATE contract_accounts/.test(c.sql)), false);
});

test('an unreadable settings table FAILS CLOSED here too', async () => {
  const sq = stubSquare();
  const boom = makeD1([
    [/FROM app_settings/i, () => { throw new Error('D1 down'); }],
    [/INSERT INTO money_movements/i, () => 1],
  ]);
  const r = await saveCardOnFile({ ...ENV, DB: boom }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(r.reason, 'card_capture_off');
  assert.equal(sq.calls.length, 0);
});

// ---------- 2. consent ----------

test('NO TICKED BOX → NO CARD. Consent is an explicit true, not "truthy"', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  for (const consent of [undefined, null, false, 0, '', 'yes', 1, 'true']) {
    const r = await saveCardOnFile({ ...ENV, DB }, {
      account: ACCOUNT, sourceId: 'cnon:tok', consent, agreedName: 'Ana Prieto',
    });
    assert.equal(r.stored, false, `consent=${JSON.stringify(consent)}`);
    assert.equal(r.reason, 'no_consent');
  }
  sq.restore();
  assert.equal(sq.calls.length, 0, 'nothing reaches Square without an authorization');
});

test('consent with nobody’s name on it is not consent', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: '   ',
  });
  sq.restore();
  assert.equal(r.reason, 'no_signer');
  assert.equal(sq.calls.length, 0);
});

test('the consent text says the five things it has to say', () => {
  const t = CARD_CONSENT_TEXT;
  assert.match(t, /authorize/i, 'it is an authorization, in those words');
  assert.match(t, /automatically/i, 'and it says the charging is automatic');
  assert.match(t, /Nothing is charged right now/i, 'that today is not a charge');
  assert.match(t, /refused rather than adjusted/i, 'that a changed amount refuses rather than charging the new one');
  assert.match(t, /never sees or stores my card number/i, 'who holds the card');
  assert.match(t, /remove this card or withdraw this authorization at any time/i, 'and how to get out');
  assert.ok(CARD_CONSENT_VERSION, 'and it is versioned');
});

// ---------- 3. the PAN never reaches us ----------

test('A RAW CARD NUMBER IS REFUSED, NOT FORWARDED — and is never echoed back', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: TEST_PAN, consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();

  assert.equal(r.stored, false);
  assert.equal(r.reason, 'pan_rejected');
  assert.equal(sq.calls.length, 0, 'a PAN must not be relayed to Square as a "token" either');
  assert.doesNotMatch(JSON.stringify(r), /4111/, 'the refusal does not quote the number back');
  assert.equal(allArgs(DB).some((a) => a.includes('4111')), false,
    'and not one digit of it is bound to any statement — including the audit row');
});

test('the PAN check is about shape, not about a checksum a typo could fail', () => {
  assert.equal(looksLikeCardNumber(TEST_PAN), true);
  assert.equal(looksLikeCardNumber('4111 1111 1111 1111'), true, 'spaces are how a human types it');
  assert.equal(looksLikeCardNumber('4111-1111-1111-1112'), true, 'a mistyped PAN is still a PAN');
  assert.equal(looksLikeCardNumber('378282246310005'), true, 'amex is 15 digits');
  assert.equal(looksLikeCardNumber('cnon:CBASE-abc123'), false, 'a Square nonce is not a PAN');
  assert.equal(looksLikeCardNumber('ccof:customer-card-id'), false);
  assert.equal(looksLikeCardNumber(''), false);
  assert.equal(looksLikeCardNumber('12345'), false, 'a short number is not a card');
});

test('NO PAN IS EVER STORED — the happy path binds a token-shaped id and a last four, nothing else', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:CBASE-abc123', consent: true,
    agreedName: 'Ana Prieto', agreedEmail: 'ana@dgp.test', ip: '203.0.113.9',
  });
  sq.restore();
  assert.equal(r.stored, true);

  const bound = allArgs(DB);
  // Nothing 12-19 digits long is written anywhere. This is the assertion that would fail the day
  // somebody "helpfully" passes the raw number through for the owner's convenience.
  for (const a of bound) {
    assert.equal(/\b\d{12,19}\b/.test(a.replace(/[\s-]/g, '')), false, `a card-shaped number was bound: ${a.slice(0, 24)}…`);
  }
  // The single-use token is not stored either — it is used once, at Square, and dropped.
  assert.equal(bound.some((a) => a.includes('cnon:')), false, 'the tokenization nonce is not persisted');
  assert.ok(bound.includes('ccof_1'), 'the opaque Square card id IS stored');
  assert.ok(bound.includes('cus_new'), 'and the Square customer id');
  assert.ok(bound.includes('4242'), 'plus the last four, so the owner can tell which card it is');
});

// ---------- 4. what gets written ----------

test('the card, the consent TEXT, who agreed and when all land on the account row', async () => {
  const sq = stubSquare();
  let bound = null;
  const DB = cardDb({ settings: ON, onUpdate: ({ args }) => { bound = args; return 1; } });
  const before = Date.now();
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true,
    agreedName: 'Ana Prieto', agreedEmail: 'ana@dgp.test', ip: '203.0.113.9',
  });
  sq.restore();

  assert.equal(r.ok, true);
  assert.equal(r.brand, 'VISA');
  assert.equal(r.last4, '4242');
  assert.ok(bound, 'the account row was updated');
  assert.ok(bound.includes(CARD_CONSENT_TEXT),
    'THE FULL TEXT, not a boolean — an argument about what was authorised is settled by the row');
  assert.ok(bound.includes(CARD_CONSENT_VERSION));
  assert.ok(bound.includes('Ana Prieto'), 'who agreed');
  assert.ok(bound.includes('ana@dgp.test'));
  assert.ok(bound.includes('203.0.113.9'), 'where from');
  assert.ok(bound.includes('contract_card_page'), 'and which surface collected it');
  const consentAt = bound[5];
  assert.ok(consentAt >= before && consentAt <= Date.now(), 'and when — a real timestamp');
  assert.equal(bound[bound.length - 1], 'acct_1', 'scoped to this account');
});

test('an existing Square customer is REUSED — a second customer would split the cards in two', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  await saveCardOnFile({ ...ENV, DB }, {
    account: { ...ACCOUNT, square_customer_id: 'cus_existing' },
    sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(sq.calls.filter((c) => /\/v2\/customers/.test(c.url)).length, 0, 'no new customer minted');
  const cardCall = sq.calls.find((c) => /\/v2\/cards/.test(c.url));
  assert.equal(cardCall.body.card.customer_id, 'cus_existing');
});

test('THIS PATH CANNOT CHARGE. /v2/payments is never called, and no amount is ever recorded', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON });
  await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(sq.calls.some((c) => /\/v2\/payments/.test(c.url)), false, 'storing a card is not charging one');
  const move = DB.calls.find((c) => /INSERT INTO money_movements/.test(c.sql));
  assert.equal(move.args[4], null, 'the movement row carries no amount, because no money moved');
  assert.equal(move.args[5], 'stored');
});

test('a card Square accepted but we could not save is reported as a FAILURE, not as ok', async () => {
  const sq = stubSquare();
  const DB = cardDb({ settings: ON, onUpdate: () => { throw new Error('no such column: card_consent_at'); } });
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_saved');
  assert.match(r.error, /Nothing will be charged/, 'and it says the safe thing out loud');
});

test('a Square error refuses without pretending a card is on file', async () => {
  const sq = stubSquare({ ok: false, card: { errors: [{ detail: 'INVALID_CARD_DATA' }] }, customer: { errors: [{ detail: 'INVALID_CARD_DATA' }] } });
  const DB = cardDb({ settings: ON });
  const r = await saveCardOnFile({ ...ENV, DB }, {
    account: ACCOUNT, sourceId: 'cnon:tok', consent: true, agreedName: 'Ana Prieto',
  });
  sq.restore();
  assert.equal(r.stored, false);
  assert.equal(r.reason, 'square_error');
  assert.equal(DB.calls.some((c) => /UPDATE contract_accounts/.test(c.sql)), false);
});

test('removing the card withdraws the consent WITH it', async () => {
  const DB = cardDb({ settings: ON });
  const r = await removeCardOnFile({ DB }, { accountId: 'acct_1', actor: 'owner@test' });
  assert.equal(r.ok, true);
  const upd = DB.calls.find((c) => /UPDATE contract_accounts/.test(c.sql));
  assert.match(upd.sql, /square_card_id=NULL/);
  assert.match(upd.sql, /square_customer_id=NULL/);
  assert.match(upd.sql, /card_consent_at=NULL/, 'a consent with no card behind it misstates what they agreed to');
  assert.match(upd.sql, /card_consent_text=NULL/);
});

// ---------- 5. autopay is unchanged: the card unblocks ONE gate ----------

function chargeDb({ settings = {}, account }) {
  return makeD1([
    [/FROM app_settings WHERE key IN/i, () => Object.entries(settings).map(([key, value]) => ({ key, value }))],
    [/FROM contract_accounts WHERE id/i, () => account],
    [/INSERT INTO money_movements/i, () => 1],
    [/UPDATE contract_invoices/i, () => 1],
  ]);
}
const APPROVED_INVOICE = {
  id: 'inv_1', account_id: 'acct_1', number: 'DGP-0007', total_cents: 120000, status: 'sent',
  autopay_approved_at: 1, autopay_approved_cents: 120000,
};

test('STILL REFUSES with no card on file — that is the gate this whole file exists to unblock', async () => {
  const sq = stubSquare();
  const DB = chargeDb({
    settings: { [AUTOPAY_KEYS.contracts]: '1' },
    account: { ...ACCOUNT, square_card_id: null, square_customer_id: null },
  });
  const r = await chargeContractInvoice({ ...ENV, DB }, APPROVED_INVOICE);
  sq.restore();
  assert.equal(r.charged, false);
  assert.equal(r.reason, 'no_card_on_file');
  assert.equal(sq.calls.length, 0);
});

test('WITH a card on file the charge path gets PAST that check — and is still stopped by the rest', async () => {
  // Same invoice, same approval, same switch. The only difference is the two columns this module
  // now writes. Square has no credentials here, so the very next gate stops it: proof the card
  // check was passed and proof that passing it is not permission to charge.
  const sq = stubSquare();
  const DB = chargeDb({
    settings: { [AUTOPAY_KEYS.contracts]: '1' },
    account: { ...ACCOUNT, square_card_id: 'ccof_1', square_customer_id: 'cus_new' },
  });
  const r = await chargeContractInvoice({ DB }, APPROVED_INVOICE);   // no SQUARE_* credentials
  sq.restore();
  assert.equal(r.charged, false);
  assert.notEqual(r.reason, 'no_card_on_file', 'the card check is behind us now');
  assert.equal(r.reason, 'square_not_configured', 'and the NEXT gate is what stops it');
  assert.equal(sq.calls.length, 0);
});

test('A CARD IS NOT PERMISSION. Switch off, or amount unapproved, and it still refuses', async () => {
  const sq = stubSquare();
  const withCard = { ...ACCOUNT, square_card_id: 'ccof_1', square_customer_id: 'cus_new' };

  const off = await chargeContractInvoice({ ...ENV, DB: chargeDb({ account: withCard }) }, APPROVED_INVOICE);
  assert.equal(off.reason, 'autopay_off');

  const unapproved = await chargeContractInvoice(
    { ...ENV, DB: chargeDb({ settings: { [AUTOPAY_KEYS.contracts]: '1' }, account: withCard }) },
    { ...APPROVED_INVOICE, autopay_approved_at: null, autopay_approved_cents: null },
  );
  assert.equal(unapproved.reason, 'not_approved');

  const moved = await chargeContractInvoice(
    { ...ENV, DB: chargeDb({ settings: { [AUTOPAY_KEYS.contracts]: '1' }, account: withCard }) },
    { ...APPROVED_INVOICE, total_cents: 240000 },
  );
  assert.equal(moved.reason, 'amount_changed');

  sq.restore();
  assert.equal(sq.calls.length, 0, 'and none of the three reached Square');
});

// ---------- 6. the endpoint the customer's page actually calls ----------

function endpointEnv({ settings = {}, site = { id: 'site_1', account_id: 'acct_1', name: 'Delray Beach' }, account = ACCOUNT, onUpdate = () => 1 } = {}) {
  const DB = makeD1([
    [/FROM contract_sites WHERE intake_token/i, ({ args }) => (args[0] === 'tok_good' ? site : null)],
    [/FROM contract_accounts WHERE id/i, () => account],
    [/FROM app_settings WHERE key IN/i, () => Object.entries(settings).map(([key, value]) => ({ key, value }))],
    [/UPDATE contract_accounts SET/i, ({ args }) => onUpdate({ args })],
    [/INSERT INTO money_movements/i, () => 1],
  ]);
  return { ...ENV, DB, SESSIONS: null };
}
const cardGet = (env, t) => onRequestGet({ env, request: new Request(`https://x.test/api/contract/card?t=${t}`) });
const cardPost = (env, body) => onRequestPost({
  env,
  request: new Request('https://x.test/api/contract/card', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body),
  }),
});

test('the page is served THE consent text from the server — one copy, so it cannot drift', async () => {
  const out = await (await cardGet(endpointEnv({ settings: ON }), 'tok_good')).json();
  assert.equal(out.ok, true);
  assert.equal(out.enabled, true);
  assert.equal(out.consent_text, CARD_CONSENT_TEXT, 'what they read IS what gets stored');
  assert.equal(out.consent_version, CARD_CONSENT_VERSION);
  assert.equal(out.account_name, 'Delray Grand Prix');
});

test('the customer-facing view never carries the Square handles', async () => {
  const account = { ...ACCOUNT, square_card_id: 'ccof_1', square_customer_id: 'cus_new', card_brand: 'VISA', card_last4: '4242' };
  const out = await (await cardGet(endpointEnv({ settings: ON, account }), 'tok_good')).json();
  assert.equal(out.has_card, true);
  assert.equal(out.card_last4, '4242', 'the last four is the only card fact that leaves');
  assert.equal(JSON.stringify(out).includes('ccof_1'), false);
  assert.equal(JSON.stringify(out).includes('cus_new'), false);
});

test('an unknown or retired site token attaches nothing to anybody', async () => {
  const env = endpointEnv({ settings: ON });
  assert.equal((await cardGet(env, 'tok_wrong')).status, 404);
  const res = await cardPost(env, { t: 'tok_wrong', source_id: 'cnon:tok', consent: true, agreed_name: 'Ana' });
  assert.equal(res.status, 404);
  assert.equal(env.DB.calls.some((c) => /UPDATE contract_accounts/.test(c.sql)), false);
});

test('the endpoint stores the card and reports back only the brand and last four', async () => {
  const sq = stubSquare();
  const env = endpointEnv({ settings: ON });
  const out = await (await cardPost(env, {
    t: 'tok_good', source_id: 'cnon:tok', consent: true, agreed_name: 'Ana Prieto', agreed_email: 'ana@dgp.test',
  })).json();
  sq.restore();
  assert.equal(out.ok, true);
  assert.equal(out.brand, 'VISA');
  assert.equal(out.last4, '4242');
  assert.equal(out.square_card_id, undefined);
  assert.ok(env.DB.calls.some((c) => /UPDATE contract_accounts/.test(c.sql)));
});

test('the endpoint will not soften consent on the way in', async () => {
  const sq = stubSquare();
  const env = endpointEnv({ settings: ON });
  const out = await (await cardPost(env, { t: 'tok_good', source_id: 'cnon:tok', consent: 'yes', agreed_name: 'Ana' })).json();
  sq.restore();
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'no_consent');
  assert.equal(sq.calls.length, 0);
});

// ---------- 7. the surfaces ----------

test('the customer page renders the SERVER’s consent text and gates its own button on the tick', () => {
  const page = readFileSync(new URL('../../public/lunch-card.html', import.meta.url), 'utf8');
  assert.match(page, /d\.consent_text/, 'the authorization shown is the one the server serves');
  assert.match(page, /id="consent"/, 'there is a tick box');
  assert.match(page, /consent: document\.getElementById\('consent'\)\.checked === true/, 'and it is sent as a strict true');
  assert.match(page, /cardField\.tokenize\(\)/, 'the card goes to Square, not to us');
  assert.match(page, /\/api\/contract\/card/);
  assert.match(page, /Nothing is charged today/i, 'and the page says so in its own voice too');
  // The page must not contain a second, hand-written copy of the authorization.
  assert.equal(page.includes('I authorize Añejo Catering Co.'), false,
    'a second copy of the consent copy is a copy that will drift');
});

test('the owner can see who has a card and who does not, and can withdraw one', () => {
  const api = readFileSync(new URL('../../functions/api/hub/owner/autopay.js', import.meta.url), 'utf8');
  assert.match(api, /has_card/, 'the owner API answers the question for every account');
  assert.match(api, /FROM contract_accounts a/);
  assert.match(api, /ORDER BY has_card ASC/, 'accounts with no card come FIRST — those are the actionable ones');
  assert.match(api, /op === 'remove_card'/);

  const fin = readFileSync(new URL('../../public/hub/owner/finance.html', import.meta.url), 'utf8');
  assert.match(fin, /Cards on file/, 'and there is a visible section for it');
  assert.match(fin, /no card on file/, 'which names the accounts that cannot be charged');
  assert.match(fin, /which: which, on: next/, 'the new switch rides the same wiring as the other two');
  assert.match(fin, /card_capture_enabled/, 'and the third switch is rendered');
  assert.match(fin, /op: 'remove_card'/);
  // Card facts the owner sees are the recognisable ones only.
  assert.equal(/square_card_id/.test(fin), false, 'the Square handle has no business on a screen');
});
