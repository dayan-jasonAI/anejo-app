// Every segment must return recipients shaped { address, name, source }.
//
// The first real test campaign failed exactly here. The test segment returned {name, email, phone}
// with no `address`. The send path binds `r.address` into campaign_sends, so it bound undefined,
// INSERT OR IGNORE swallowed the row, and the campaign claimed 1 recipient then sat at 'sending'
// with an empty roster — no email, no error, nothing in any log. A silent failure in the one
// subsystem whose whole job is "did this actually go out?".
//
// Two guards, because either alone is insufficient: the shape is asserted here, and the send path
// now refuses a malformed roster instead of writing nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveAudience, SEGMENTS } from '../../functions/_lib/audience.js';

// Minimal D1 stand-in: the test segment reads app_settings, everything else queries customer tables.
function db(testList) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          return /campaign\.test_recipients/.test(sql) ? { value: testList } : null;
        },
        async all() { return { results: [] }; },
      };
    },
  };
}

test('the test segment returns address, not email/phone', async () => {
  const a = await resolveAudience({ DB: db('owner@example.com') }, { segment: 'test', channel: 'email' });
  assert.equal(a.recipients.length, 1);
  const r = a.recipients[0];
  assert.equal(typeof r.address, 'string', 'address is what the send path binds');
  assert.equal(r.address, 'owner@example.com');
  assert.equal(r.source, 'test');
});

test('multiple test recipients all carry an address', async () => {
  const a = await resolveAudience({ DB: db('a@x.com, b@y.com') }, { segment: 'test', channel: 'email' });
  assert.equal(a.recipients.length, 2);
  for (const r of a.recipients) assert.ok(r.address && r.address.includes('@'));
});

test('a malformed test address is skipped, not passed through as undefined', async () => {
  const a = await resolveAudience({ DB: db('not-an-email, good@x.com') }, { segment: 'test', channel: 'email' });
  assert.equal(a.recipients.length, 1, 'only the valid one survives');
  assert.equal(a.recipients[0].address, 'good@x.com');
  assert.equal(a.skipped.no_address, 1, 'and the skip is counted, not hidden');
});

test('an empty test list yields nobody rather than a broken recipient', async () => {
  const a = await resolveAudience({ DB: db('') }, { segment: 'test', channel: 'email' });
  assert.equal(a.recipients.length, 0);
});

test('the SMS channel uses the phone as the address', async () => {
  const a = await resolveAudience({ DB: db('+15615550143') }, { segment: 'test', channel: 'sms' });
  assert.equal(a.recipients.length, 1);
  assert.equal(a.recipients[0].address, '+15615550143', 'one field, whichever channel');
});

test('the send path refuses a roster with any addressless recipient', () => {
  // The second guard: even if a segment regresses, nothing is written and the campaign returns
  // to draft rather than hanging at "sending" forever.
  const src = readFileSync(new URL('../../functions/api/hub/owner/campaigns.js', import.meta.url), 'utf8');
  assert.match(src, /typeof r\.address !== 'string'/, 'validates the shape before inserting');
  assert.match(src, /status='draft'[\s\S]{0,200}Internal error/, 'reverts to draft and says so');
});

test('the contract is documented where segments are written', () => {
  const src = readFileSync(new URL('../../functions/_lib/audience.js', import.meta.url), 'utf8');
  assert.match(src, /\{address,\s*name,\s*source\}/, 'the shape is stated in the file, not just implied');
  assert.ok(Object.keys(SEGMENTS).length >= 5, 'all segments still registered');
});

// ---- the compliance footer ----
// A real campaign landed in an inbox showing the SAME address line twice — once from the shared
// email shell and once from the marketing footer. Cosmetic, but it is the footer a regulator reads.
//
// The address itself is a bigger issue: CAN-SPAM requires a valid PHYSICAL POSTAL ADDRESS, and
// "Palm Beach County, FL" is a service area, not an address. It is now a setting so a real one can
// be supplied without a deploy.

test('the shell footer can be suppressed so the address appears once', async () => {
  const { emailShell } = await import('../../functions/_lib/email.js');
  const withFooter = emailShell('<p>hi</p>');
  const without = emailShell('<p>hi</p>', { footer: false });
  const count = (h) => (h.match(/Palm Beach County/g) || []).length;
  assert.equal(count(withFooter), 1, 'transactional mail keeps its footer — unchanged');
  assert.equal(count(without), 0, 'marketing mail prints its own, so the shell must not');
});

test('suppressing the footer does not damage the rest of the shell', async () => {
  const { emailShell } = await import('../../functions/_lib/email.js');
  const h = emailShell('<p>body copy</p>', { footer: false });
  assert.match(h, /AÑEJO/, 'branding intact');
  assert.match(h, /body copy/, 'content intact');
});

test('the campaign send resolves the postal address before using it', () => {
  // `postal` was referenced in the send loop before it was declared — a ReferenceError at send
  // time that node --check cannot see and no test exercised. Pin the ordering.
  const src = readFileSync(new URL('../../functions/api/hub/owner/campaigns.js', import.meta.url), 'utf8');
  const decl = src.indexOf('const postal = await addressLine(env)');
  const use = src.indexOf('marketingFooter(unsub, postal)');
  assert.ok(decl !== -1, 'postal is declared');
  assert.ok(use !== -1, 'postal is used');
  assert.ok(decl < use, 'and declared BEFORE it is used');
});

test('the postal address is settable, with the service area only as a fallback', () => {
  const src = readFileSync(new URL('../../functions/api/hub/owner/campaigns.js', import.meta.url), 'utf8');
  assert.match(src, /campaign\.postal_address/, 'read from settings');
  assert.match(src, /op === 'set_postal_address'/, 'and writable from the HUB');
  assert.match(src, /ADDRESS_FALLBACK/, 'with a fallback rather than an empty footer');
});
