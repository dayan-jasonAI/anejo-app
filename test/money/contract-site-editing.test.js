// Every value the contracts desk DISPLAYS must be a value the owner can CHANGE.
//
// The desk rendered price, delivery fee, cut-off — editable — right next to the delivery days and
// the delivery window, which were read-only pills. So "we're moving to Tue/Thu" or "they changed
// suites" required a SQL console, and a location could never be paused. That is the same
// withheld-control shape as the missing billing contact (see contract-billing-contact.test.js).
//
// Also pins the day-parsing bug this work uncovered: contract_sites.delivery_days is written as day
// NAMES, and admin/cutoff-check read it as NUMBERS. Number('mon') is NaN, so every site failed the
// "does it deliver today?" test and the pre-cutoff reminder never fired for anyone, reporting
// "0 missing" every morning — indistinguishable from "everybody submitted".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDeliveryDays } from '../../functions/_lib/contract.js';

const API = readFileSync(new URL('../../functions/api/hub/owner/contracts.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/contracts.html', import.meta.url), 'utf8');
const CUTOFF = readFileSync(new URL('../../functions/api/hub/admin/cutoff-check.js', import.meta.url), 'utf8');
const LIB = readFileSync(new URL('../../functions/_lib/contract.js', import.meta.url), 'utf8');

// ---------- the day parser ----------

test('day names parse to canonical names', () => {
  assert.deepEqual(parseDeliveryDays('mon,tue,wed'), ['mon', 'tue', 'wed']);
});

test('the NUMERIC form parses too — the shape cutoff-check assumed', () => {
  // 1..7 is Mon..Sun. Without this, a row written as '1,2,3' disables the site silently.
  assert.deepEqual(parseDeliveryDays('1,2,3'), ['mon', 'tue', 'wed']);
  assert.deepEqual(parseDeliveryDays('7'), ['sun']);
  assert.deepEqual(parseDeliveryDays('0'), ['sun'], '0 is Sunday in the JS getDay convention');
});

test('casing, long names and stray whitespace all resolve', () => {
  assert.deepEqual(parseDeliveryDays(' Monday , TUE ,Wednesday'), ['mon', 'tue', 'wed']);
});

test('output is deduped and always ordered Mon→Sun', () => {
  assert.deepEqual(parseDeliveryDays('fri,mon,fri,tue'), ['mon', 'tue', 'fri']);
});

test('garbage yields an EMPTY list rather than a wrong day', () => {
  // Empty is a rejectable state the caller can see; a wrong day silently delivers on the wrong day.
  assert.deepEqual(parseDeliveryDays('xyz,,9,'), []);
  assert.deepEqual(parseDeliveryDays(''), []);
  assert.deepEqual(parseDeliveryDays(null), []);
  assert.deepEqual(parseDeliveryDays(undefined), []);
});

test('cutoff-check no longer parses day names as numbers', () => {
  assert.ok(!/Number\(x\.trim\(\)\)/.test(CUTOFF), 'the Number() parse of delivery_days must be gone');
  assert.ok(/parseDeliveryDays/.test(CUTOFF), 'it must use the shared parser');
  assert.ok(/import \{ parseDeliveryDays \}/.test(CUTOFF), 'imported, not redefined');
});

test('every reader of delivery_days uses the one parser', () => {
  // A second hand-rolled split() is how the two formats drifted apart in the first place.
  const handRolled = LIB.match(/delivery_days[^\n]*\.split\(','\)/g) || [];
  assert.equal(handRolled.length, 0, 'no ad-hoc delivery_days splitting left in _lib/contract.js');
});

// ---------- the API accepts every field ----------

test('the API validates and persists all the previously-fixed fields', () => {
  for (const col of ['name', 'street', 'unit', 'city', 'state', 'zip', 'delivery_days', 'window_label', 'delivery_window', 'active']) {
    assert.ok(new RegExp(`'${col}'`).test(API) || new RegExp(`\\b${col}:`).test(API), `${col} must be editable`);
  }
  assert.ok(/SITE_COLS = \[/.test(API), 'the per-site column set is declared');
});

test('address and schedule edits REQUIRE a site id', () => {
  // edit_terms without site_id fans out across every site on the account. That is right for one
  // negotiated rate and catastrophic for a street address.
  assert.ok(/touchedSiteCols\.length && !siteId/.test(API));
  assert.ok(/Pick a location first/.test(API));
});

test('an empty delivery-day list is rejected, not stored', () => {
  // A site with no delivery days accepts no head counts — indistinguishable from a broken link.
  assert.ok(/Pick at least one delivery day/.test(API));
});

test('the kitchen window is a closed set', () => {
  assert.ok(/v !== 'lunch' && v !== 'dinner'/.test(API), 'anything else lands in a bucket no prep list reads');
});

test('state and ZIP are format-checked', () => {
  assert.ok(/\^\[A-Z\]\{2\}\$/.test(API), 'state must be a 2-letter code');
  assert.ok(/\^\\d\{5\}\(-\\d\{4\}\)\?\$/.test(API), 'ZIP must be 5 or ZIP+4');
});

test('moving a location clears its stored coordinates', () => {
  // Otherwise the router keeps driving to the old building.
  assert.ok(/delivery_lat = NULL/.test(API) && /delivery_lng = NULL/.test(API));
  assert.ok(/ADDRESS_COLS\.some/.test(API), 'only when the address actually changed');
});

test('the audit trail covers the new columns too', () => {
  assert.ok(/termsOf = \(s\) => \[\.\.\.TERM_COLS, \.\.\.SITE_COLS\]/.test(API),
    'a schedule change must be as auditable as a price change');
});

// ---------- onboarding ----------

test('a new account can be created from the HUB', () => {
  assert.ok(/op === 'create_account'/.test(API));
  assert.ok(/registerAccount\(env/.test(API), 'reuses the tested signup path');
});

test('create_account is handled BEFORE the account_id guard', () => {
  // It is the one op with no account to name yet; ordering it after the guard rejects the very
  // request that creates the account.
  const create = API.indexOf("op === 'create_account'");
  const guard = API.indexOf("if (!b || !b.account_id) return bad('Missing account_id.')");
  assert.ok(create > -1 && guard > -1 && create < guard, 'create_account must precede the guard');
});

test('a new account lands PENDING, never live at $0', () => {
  assert.ok(/Set the negotiated terms, then Activate/.test(API));
});

test('a location can be added to an account that already exists', () => {
  assert.ok(/op === 'add_site'/.test(API));
  assert.ok(/export async function addSite/.test(LIB));
});

test('an added location inherits the account terms instead of opening at zero', () => {
  assert.ok(/ORDER BY created_at ASC/.test(LIB), 'reads a sibling site for its terms');
  assert.ok(/inherited_terms/.test(LIB));
});

test('an added location must have a name, street and city', () => {
  assert.ok(/needs a street and a city/.test(LIB));
  assert.ok(/Give the location a name/.test(LIB));
});

test('adding a location writes an audit row', () => {
  assert.ok(/event: 'site_added'/.test(API));
});

// ---------- the page renders the controls ----------

test('the edit form exposes days, window, address and the pause switch', () => {
  assert.ok(/function dayPicker/.test(PAGE), 'a day picker must render');
  assert.ok(/id="ek_/.test(PAGE), 'kitchen window select');
  assert.ok(/id="est_/.test(PAGE) || /txt\('est', 'Street'/.test(PAGE), 'street input');
  assert.ok(/id="eac_/.test(PAGE), 'active toggle');
});

test('the day chips reflect the checkbox live, not a stale class', () => {
  assert.ok(/input:checked\+span/.test(PAGE), 'CSS must key off :checked');
  assert.ok(!/\.daychip\.on span\{/.test(PAGE), 'a static .on class would survive an uncheck');
});

test('edits are sent as a DIFF against what is stored', () => {
  // Re-sending untouched fields turns every audit row into a restatement of the whole row, and
  // makes "blank means unchanged" collide with "blank means clear it".
  assert.ok(/var SITES = \{\}/.test(PAGE), 'the stored rows are kept for comparison');
  assert.ok(/SITES\[sid\] \|\| \{\}/.test(PAGE));
  assert.ok(/Nothing changed yet/.test(PAGE));
});

test('pausing a location asks first', () => {
  assert.ok(/body\.active === 0 && !window\.confirm/.test(PAGE),
    'it stops their intake link — worth a beat');
});

test('a paused location is visibly paused on the card', () => {
  assert.ok(/pill paused/.test(PAGE));
  assert.ok(/Number\(s\.active\) === 0/.test(PAGE));
});

test('the onboarding form is reachable — including from the EMPTY state', () => {
  // The empty state was a dead end: "No contract accounts yet." and no way to add one.
  assert.ok(/function newAccountForm/.test(PAGE));
  assert.ok(/No contract accounts yet — onboard one above/.test(PAGE));
  assert.ok(/head \+ '<div class="card">/.test(PAGE), 'the form renders above the empty message');
});

test('the add-location form is on every account', () => {
  assert.ok(/function addSiteForm/.test(PAGE));
  assert.ok(/addSiteForm\(acc\.id\)/.test(PAGE));
});

test('onboarding refuses to create an account with no billing email', () => {
  // With no billing email the account cannot be invoiced, and the only people reachable are the
  // office staff who count heads — who must never see pricing.
  assert.ok(/invoices have nowhere to go without one/.test(PAGE));
});

test('the unit line shows in the address the desk displays', () => {
  assert.ok(/\[s\.street, s\.unit, s\.city, s\.state, s\.zip\]/.test(PAGE),
    'a suite number is the difference between delivered and lost');
});

// ---------- the reminder must never invent a delivery day ----------
//
// Dayan: "DGP is set for monday through wednesday, idk where you get monday through friday from."
// He was right to push. Three different things carried a week shape and only one was DGP's:
//   · DGP's config in D1        → mon,tue,wed  (correct)
//   · the cron wake-up schedule → Mon–Fri      (deliberate: wake broadly, let each site decide)
//   · a fallback default here   → Mon–Fri      (WRONG — this one could text a real clinic)
// A reminder sent on a day a client does not order is worse than a missing one: it teaches them
// to distrust every reminder after it.

test('a site with no delivery days is SKIPPED, never assumed', () => {
  const src = readFileSync(new URL('../../functions/api/hub/admin/cutoff-check.js', import.meta.url), 'utf8');
  assert.match(src, /const days = parseDeliveryDays\(s\.delivery_days\);/, 'no fallback week');
  assert.ok(!/parseDeliveryDays\(s\.delivery_days \|\|/.test(src), 'the Mon–Fri default is gone');
  assert.match(src, /if \(!days\.length\) \{ unconfigured\.push/);
});

test('an unconfigured site is reported, not silently dropped', () => {
  // Skipping quietly means that site is never reminded and nobody ever learns why.
  const src = readFileSync(new URL('../../functions/api/hub/admin/cutoff-check.js', import.meta.url), 'utf8');
  assert.match(src, /have no delivery days set and were skipped/);
});

test('parseDeliveryDays gives an empty list for blank input, which is what triggers the skip', () => {
  assert.deepEqual(parseDeliveryDays(''), []);
  assert.deepEqual(parseDeliveryDays(null), []);
  assert.deepEqual(parseDeliveryDays('mon,tue,wed'), ['mon', 'tue', 'wed'], "DGP's real shape");
});

test('the file no longer claims DGP orders five days a week', () => {
  const src = readFileSync(new URL('../../functions/api/hub/admin/cutoff-check.js', import.meta.url), 'utf8');
  assert.ok(!/09:15 cutoff, five days a week/.test(src));
});
