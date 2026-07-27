// An account must be able to HAVE a billing contact, and the HUB must be able to set one.
//
// This was missing entirely: contract_accounts.billing_email was READ by send_invoice but never
// WRITTEN anywhere, so every invoice failed with "No billing email on this account" and no screen
// existed to fix it. That is the recurring shape in this codebase — the UI surfaces a problem and
// withholds the control that resolves it.
//
// It also matters for disclosure: with no billing contact, the only people the system can reach at
// an account are the site contacts who submit headcounts, and those are exactly the people the
// lunch-count page deliberately shows no pricing to. See contract-no-pricing.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = readFileSync(new URL('../../functions/api/hub/owner/contracts.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/contracts.html', import.meta.url), 'utf8');

test('the API exposes a way to set the billing contact', () => {
  assert.ok(API.includes("op === 'set_billing'"), 'set_billing op must exist');
  assert.ok(/UPDATE contract_accounts SET billing_email/.test(API), 'it must actually persist');
});

test('a malformed billing email is rejected', () => {
  // A typo means invoices bounce and the owner waits on a payment that was never asked for.
  assert.ok(/if \(email && !isEmail\(email\)\)/.test(API), 'must validate before saving');
});

test('the billing contact can be deliberately cleared', () => {
  assert.ok(/billing_email = \?/.test(API) && /email \|\| null/.test(API),
    'an empty value stores NULL rather than being silently ignored');
});

test('an unknown account id fails loudly instead of reporting success', () => {
  assert.ok(/changes !== 1\) return bad\('Account not found\.'/.test(API));
});

test('the HUB renders the control, not just the value', () => {
  assert.ok(PAGE.includes('function billingBlock'), 'a billing block must render');
  assert.ok(PAGE.includes('id="be_'), 'with an input for the email');
  assert.ok(PAGE.includes('__setBilling'), 'wired to a save action');
  assert.ok(/op: 'set_billing'/.test(PAGE), 'which calls the API op');
});

test('a missing billing contact is flagged, not left silent', () => {
  assert.ok(/No billing contact/i.test(PAGE),
    'you only discover this at the moment you are trying to get paid — say it before then');
});

test('the block is rendered for active accounts', () => {
  assert.ok(/pending \? activateForm\(acc\) : billingBlock\(acc\)/.test(PAGE),
    'pending accounts set terms first; active ones need the billing contact');
});
