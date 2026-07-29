// Founding Legacy Members — the launch-list benefit and how it is earned.
//
// The launch page promises, in writing and in the welcome email: "Double rewards points for life
// — on every order, forever", to the first 100 who join. That is a LIFETIME ENTITLEMENT made in
// public, so the code that delivers it has to be at least as durable as the promise.
//
// It was not. The benefit was minted inside sendLaunchWelcome(), which is called fire-and-forget
// (`.catch(() => {})`), making a permanent entitlement a side effect of a BEST-EFFORT EMAIL.
// Founding members #1, #2 and #3 signed up before that code existed and had nothing on their
// accounts for a week — the page told them they were founders and the system disagreed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { foundingStatus, grantMissingFoundingCodes, FOUNDING_CAP } from '../../functions/_lib/promo.js';

const LEADS = readFileSync(new URL('../../functions/api/leads.js', import.meta.url), 'utf8');
const PROMO = readFileSync(new URL('../../functions/_lib/promo.js', import.meta.url), 'utf8');
const CUSTOMERS = readFileSync(new URL('../../functions/api/hub/owner/customers.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/customers.html', import.meta.url), 'utf8');

const EM = 'founder@example.com';
function db({ lead = { id: 'ld1', created_at: 1000 }, rank = 3, paid = 0, code = 'FOUND-ABC123' } = {}) {
  return makeD1([
    [/FROM leads WHERE kind='launch' AND LOWER\(TRIM\(email\)\)/, () => lead],
    [/SELECT COUNT\(\*\) AS n FROM leads WHERE kind='launch' AND created_at/, () => ({ n: rank })],
    [/FROM orders WHERE LOWER\(TRIM\(customer_email\)\)/, () => ({ n: paid })],
    [/SELECT code FROM promo_codes WHERE kind='customer'/, () => (code ? { code } : null)],
  ]);
}

test('someone who never signed up at /launch is not a founder', async () => {
  const d1 = makeD1([[/FROM leads WHERE kind='launch' AND LOWER\(TRIM\(email\)\)/, () => null]]);
  const s = await foundingStatus({ DB: d1 }, EM);
  assert.equal(s.on_launch_list, false);
  assert.equal(s.is_legacy, false);
});

test('on the list but NOT yet purchased is not a Legacy Member', async () => {
  // The whole point of Dayan's rule: the badge is EARNED at the first paid order.
  const s = await foundingStatus({ DB: db({ paid: 0 }) }, EM);
  assert.equal(s.on_launch_list, true);
  assert.equal(s.is_legacy, false);
});

test('the first PAID order makes them a Legacy Member', async () => {
  const s = await foundingStatus({ DB: db({ paid: 1 }) }, EM);
  assert.equal(s.is_legacy, true);
});

test('their founding NUMBER is their place in the queue', async () => {
  const s = await foundingStatus({ DB: db({ rank: 3 }) }, EM);
  assert.equal(s.member_no, 3);
  assert.equal(s.within_cap, true);
});

test('past the Founding Hundred they are on the list but not one of the Hundred', async () => {
  const s = await foundingStatus({ DB: db({ rank: FOUNDING_CAP + 1 }) }, EM);
  assert.equal(s.on_launch_list, true);
  assert.equal(s.within_cap, false, 'the page promised the first 100 — the 101st is not one of them');
});

test('"is owed the benefit" and "actually HAS it" are reported separately', async () => {
  // Collapsing these is what hid the bug: three founders looked fine because they were on the
  // list, while nothing on their account delivered the 2x.
  const missing = await foundingStatus({ DB: db({ paid: 1, code: null }) }, EM);
  assert.equal(missing.is_legacy, true, 'they earned it');
  assert.equal(missing.benefit_active, false, 'but they do not have it');
  const ok = await foundingStatus({ DB: db({ paid: 1, code: 'FOUND-XYZ789' }) }, EM);
  assert.equal(ok.benefit_active, true);
  assert.equal(ok.code, 'FOUND-XYZ789');
});

test('status is DERIVED, never stored — so it cannot drift', async () => {
  // Same rule the spend tiers follow. Nothing to migrate, nothing to keep in sync.
  const sql = PROMO.slice(PROMO.indexOf('export async function foundingStatus'));
  assert.ok(!/INSERT INTO|UPDATE /.test(sql.slice(0, sql.indexOf('export async function autoCustomerCodeFor'))),
    'reading someone\'s standing must not write anything');
});

test('the repair grants the benefit ONLY to those missing it', async () => {
  const granted = [];
  const d1 = makeD1([
    [/SELECT DISTINCT LOWER\(TRIM\(email\)\) AS em FROM leads/, () => ([{ em: 'a@x.test' }, { em: 'b@x.test' }])],
    [/SELECT code, expires_at FROM promo_codes/, () => null],
    [/INSERT INTO promo_codes/, ({ args }) => { granted.push(args[2]); return 1; }],
  ]);
  const r = await grantMissingFoundingCodes({ DB: d1 });
  assert.equal(r.checked, 2);
  assert.equal(r.granted, 2);
  assert.deepEqual(granted, ['a@x.test', 'b@x.test']);
});

test('the repair is idempotent — an existing benefit is returned, not duplicated', async () => {
  // It runs on every signup and on demand; issuing a second lifetime code would be a real mess.
  const d1 = makeD1([
    [/SELECT DISTINCT LOWER\(TRIM\(email\)\) AS em FROM leads/, () => ([{ em: 'a@x.test' }])],
    [/SELECT code, expires_at FROM promo_codes/, () => ({ code: 'FOUND-EXIST', expires_at: null })],
    [/INSERT INTO promo_codes/, () => { throw new Error('must not mint a second code'); }],
  ]);
  const r = await grantMissingFoundingCodes({ DB: d1 });
  assert.equal(r.granted, 1, 'reported as covered');
});

test('THE ROOT CAUSE: the benefit is granted by the signup, not by the email', async () => {
  // If this regresses, a mail outage silently costs someone a lifetime perk again.
  const grantIdx = LEADS.indexOf("issueCustomerCode(env, { email: rec.email, note: 'launch signup' })");
  // The CALL site, not the function definition (which naturally appears earlier in the file).
  const mailIdx = LEADS.indexOf('sendLaunchWelcome(env, rec, member, promo).catch');
  assert.ok(grantIdx > -1 && mailIdx > -1, 'both steps must exist');
  assert.ok(grantIdx < mailIdx, 'the grant must happen BEFORE the welcome is sent');
  assert.match(LEADS, /await issueCustomerCode/, 'and it must be AWAITED, not fired and forgotten');

  // Check the mail function's BODY, not the whole file — a prose mention of the old design in a
  // comment is not a regression, and a regex over the file happily matched one.
  const bodyStart = LEADS.indexOf('async function sendLaunchWelcome');
  const bodyEnd = LEADS.indexOf('\n// Powers the live counter', bodyStart);
  const mailBody = LEADS.slice(bodyStart, bodyEnd > -1 ? bodyEnd : bodyStart + 6000);
  assert.ok(!/issueCustomerCode\(/.test(mailBody),
    'the mail function must no longer mint the entitlement itself');
});

test('the benefit is 2x FOR LIFE — no discount, no expiry', async () => {
  // The email says "on every order, forever". An expiry here would make that a lie.
  assert.match(PROMO, /VALUES \(\?,\?,\?,0,2,NULL,'active',\?,\?\)/);
});

test('the owner can see and fix a missing benefit from the profile card', () => {
  assert.match(CUSTOMERS, /action === 'grant_founding'/);
  assert.match(CUSTOMERS, /action === 'repair_founding'/);
  assert.match(PAGE, /Benefit MISSING/);
  assert.match(PAGE, /id="grant-founding"/);
});

// ---------- editing the profile ----------

test('a guest cannot be edited — they are told to onboard, not failed silently', () => {
  assert.match(CUSTOMERS, /This is a guest customer — onboard them first/);
  assert.match(PAGE, /onboard them below to edit this profile/);
});

test('changing the email moves their history with them', () => {
  // Orders, points and the founding benefit are ALL email-keyed. Renaming the client row alone
  // would orphan a lifetime entitlement.
  for (const t of ['orders', 'points_ledger', 'promo_codes']) {
    assert.ok(CUSTOMERS.includes(`['${t}'`), `${t} must be re-pointed`);
  }
  assert.match(PAGE, /their orders, points and founding benefit move with them/i);
});

test('an email already in use is refused rather than merging two people', () => {
  assert.match(CUSTOMERS, /Another customer already uses that email/);
});

test('an address change clears the stored coordinates', () => {
  assert.match(CUSTOMERS, /delivery_lat = NULL/);
});

test('a marketing consent change records who and when', () => {
  // Consent needs an audit trail; a bare boolean is not defensible later.
  assert.match(CUSTOMERS, /marketing_sms_consent_at/);
  assert.match(CUSTOMERS, /hub:owner:\$\{ctx\.distinct_id/);
});
