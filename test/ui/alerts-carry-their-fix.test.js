// Standing rule: an alert must carry its fix.
//
// The recurring defect in this HUB is "state a problem, withhold the control": the billing-contact
// banner that could not set a billing contact, the contracts desk that displayed delivery days it
// would not let you change, the empty contract list with no way to add an account, the signed-out
// HUB that rendered eight empty panels and never said "sign in". Each was found the same way —
// the screen knew exactly what was wrong and made the owner go and find the fix.
//
// This file pins the ones that have been retrofitted so they cannot regress. It is deliberately
// specific: "no orders today" is NOT this pattern — it is a fact about a quiet day, with nothing
// to fix. The pattern is a problem the HUB can name AND resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SCHEDULE = read('../../public/hub/owner/schedule.html');
const DELIVERIES = read('../../public/hub/owner/deliveries.html');
const CONTRACTS = read('../../public/hub/owner/contracts.html');
const HUB = read('../../public/hub/assets/hub.js');

test('"no drivers" links to the page that adds one — schedule', () => {
  // It already NAMED Staff. Naming the destination and not linking to it is the same withholding
  // in a politer voice.
  assert.match(SCHEDULE, /href="\/hub\/owner\/staff\.html"/);
  assert.match(SCHEDULE, /Add a driver in Staff/);
  assert.ok(!/No active drivers yet\. Add drivers in Staff\.<\/div>/.test(SCHEDULE), 'the dead-end copy is gone');
});

test('"no drivers" links to the page that adds one — deliveries', () => {
  // A <select> cannot contain a link, so the control sits beside it.
  assert.match(DELIVERIES, /id="rdriver-fix"/);
  assert.match(DELIVERIES, /href="\/hub\/owner\/staff\.html"/);
  assert.ok(!/No drivers yet\. Add drivers in Staff\./.test(DELIVERIES), 'the dead-end copy is gone');
});

test('the driver fix hides again once drivers exist', () => {
  // A permanent "add a driver" prompt under a working dropdown is noise, and noise is how real
  // alerts stop being read.
  assert.match(DELIVERIES, /dfix\.style\.display = 'none'/);
});

test('the missing billing contact still carries its input', () => {
  assert.match(CONTRACTS, /No billing contact/);
  assert.match(CONTRACTS, /id="be_/);
  assert.match(CONTRACTS, /__setBilling/);
});

test('the empty contracts list still carries the way to create one', () => {
  assert.match(CONTRACTS, /No contract accounts yet — onboard one above/);
  assert.match(CONTRACTS, /function newAccountForm/);
});

test('a signed-out HUB carries the way back in', () => {
  assert.match(HUB, /Hub\.sessionLost = function/);
  assert.match(HUB, /a\.href = '\/login'/);
});
