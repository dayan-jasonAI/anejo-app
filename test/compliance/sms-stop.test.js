// STOP is the strongest opt-out signal a person can send, and it has to reach every list they
// are on — not just the transactional flag. Broadcast audiences read marketing_sms_consent and
// campaign_unsubscribes and DELIBERATELY ignore sms_consent, so an earlier version of the STOP
// handler (which set sms_consent only) left a STOP replier sitting in the next marketing audience.
// Twilio blocks delivery at the carrier level so nothing would actually have gone out, but our
// record of their wishes was wrong. These tests pin all three writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';

const { onRequestPost } = await import('../../functions/api/webhooks/twilio.js');

// Every table the STOP path must touch, plus the thread/message bookkeeping that follows it.
function harness() {
  const wrote = [];
  const capture = (label) => ({ sql, args }) => { wrote.push({ label, sql, args }); return 1; };
  const DB = makeD1([
    [/UPDATE clients SET sms_consent/i, capture('clients.sms_consent')],
    [/UPDATE clients SET marketing_sms_consent/i, capture('clients.marketing')],
    [/UPDATE leads SET marketing_sms_consent/i, capture('leads.marketing')],
    [/INSERT INTO campaign_unsubscribes/i, capture('campaign_unsubscribes')],
    [/UPDATE campaign_unsubscribes SET channel = 'email'/i, capture('unsub.downgrade')],
    [/DELETE FROM campaign_unsubscribes/i, capture('unsub.clear')],
    [/UPDATE leads SET marketing_email_consent/i, capture('leads.email')],
    // Downstream thread/message bookkeeping — not what we're asserting, just kept alive.
    [/SELECT id, name, role, team, phone FROM staff/i, () => ({ results: [] })],
    [/SELECT \* FROM threads/i, () => null],
    [/INSERT INTO threads/i, () => 1],
    [/INSERT INTO messages/i, () => 1],
    [/UPDATE threads SET last_message_at/i, () => 1],
    [/INSERT INTO sms_log/i, () => 1],
  ]);
  return { DB, wrote };
}

const post = (body, env) =>
  onRequestPost({
    request: new Request('https://anejocateringco.com/api/webhooks/twilio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+15615550143', To: '+15615550100', Body: body }),
    }),
    env,
  });

// No TWILIO_AUTH_TOKEN + non-production = the documented sandbox path, so these exercise the
// handler body rather than the signature check (which has its own coverage).
const envFor = (DB) => ({ DB, SQUARE_ENV: 'sandbox' });

for (const kw of ['STOP', 'stop', 'UNSUBSCRIBE', 'Quit', 'END', 'STOPALL', 'CANCEL']) {
  test(`"${kw}" clears marketing consent AND records a durable unsubscribe`, async () => {
    const { DB, wrote } = harness();
    const res = await post(kw, envFor(DB));
    assert.equal(res.status, 200, 'Twilio must always get TwiML back or it retry-storms');

    const labels = wrote.map((w) => w.label);
    assert.ok(labels.includes('clients.sms_consent'), 'transactional flag still cleared');
    assert.ok(labels.includes('clients.marketing'), 'marketing consent must be cleared');
    assert.ok(labels.includes('leads.marketing'), 'a lead who never ordered must be cleared too');
    assert.ok(
      labels.includes('campaign_unsubscribes'),
      'the durable record must survive any later consent-column write',
    );

    const flag = wrote.find((w) => w.label === 'clients.sms_consent');
    assert.equal(flag.args[0], 0, 'sms_consent set to 0');
  });
}

test('START re-subscribes the transactional flag and does NOT forge marketing consent', async () => {
  const { DB, wrote } = harness();
  await post('START', envFor(DB));

  const flag = wrote.find((w) => w.label === 'clients.sms_consent');
  assert.equal(flag.args[0], 1, 'START restores transactional SMS');

  // Texting START says "you may text me again" — it is NOT the express written consent that
  // marketing SMS requires. Re-opting them into marketing here would manufacture consent that
  // the person never gave, which is exactly what the TCPA penalizes.
  assert.ok(
    !wrote.some((w) => w.label === 'clients.marketing' || w.label === 'leads.marketing'),
    'START must never grant marketing consent',
  );
  assert.ok(
    !wrote.some((w) => w.label === 'campaign_unsubscribes'),
    'START is not an unsubscribe',
  );

  // /preferences refuses to clear a reply_stop row and tells the person, in as many words, to text
  // START instead. START must therefore lift the block — otherwise that on-page instruction is a
  // dead end and the person can never get back on the list by any route.
  assert.ok(wrote.some((w) => w.label === 'unsub.clear'), 'START lifts the sms reply_stop block');
  assert.ok(
    wrote.some((w) => w.label === 'unsub.downgrade'),
    "a channel='all' STOP row narrows to email rather than vanishing — the email opt-out survives",
  );

  const cleared = wrote.find((w) => w.label === 'unsub.clear');
  assert.match(cleared.sql, /source = 'reply_stop'/, 'only the texted STOP is lifted');
  assert.match(cleared.sql, /phone IS NOT NULL/, 'never matches rows that carry no phone');
});

test('an ordinary inbound message touches no consent record at all', async () => {
  const { DB, wrote } = harness();
  await post('what time is delivery today?', envFor(DB));
  assert.ok(
    !wrote.some((w) => w.label.includes('consent') || w.label.includes('marketing') || w.label === 'campaign_unsubscribes'),
    'a normal question is not an opt-out',
  );
});

test('STOP with a formatted number still matches on the last 10 digits', async () => {
  const { DB, wrote } = harness();
  await onRequestPost({
    request: new Request('https://anejocateringco.com/api/webhooks/twilio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+1 (561) 555-0143', To: '+15615550100', Body: 'STOP' }),
    }),
    env: envFor(DB),
  });
  const marketing = wrote.find((w) => w.label === 'clients.marketing');
  assert.ok(marketing, 'formatting must not defeat the opt-out');
  assert.equal(marketing.args[0], '%5615550143', 'normalized to bare last-10 digits');
});
