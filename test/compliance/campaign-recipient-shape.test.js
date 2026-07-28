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
