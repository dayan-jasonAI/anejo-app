// The failed delivery finally tells the CUSTOMER — Decision #11.
//
// Before this, functions/api/hub/driver/delivery/fail.js recorded the failure, flipped the stop
// and raised an OWNER alert. The person who paid for lunch and is standing by the door was told
// nothing at all. Every other step of the journey texts them; the one step where something went
// wrong was the only silent one.
//
// What these tests hold in place:
//   · IT ACTUALLY GOES OUT, on the consent-gated SMS→email chain the other notices use.
//   · IT GOES OUT ONCE. The claim on the order row is the lock, so a double-tapped Fail button
//     or a retried request cannot text somebody twice about the same failure.
//   · IT NEVER TEXTS WITHOUT CONSENT. No opt-in → email; neither → nothing, quietly.
//   · IT NEVER BREAKS THE DRIVER. Every failure inside it is swallowed.
//   · THE COPY IS HONEST AND ACTIONABLE — what happened, what we're doing, how to reach a human.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { notifyDeliveryFailed } from '../../functions/_lib/notify.js';

const ORDER = {
  id: 'ord_1', customer_name: 'Marisol Reyes', customer_email: 'marisol@example.test',
  customer_phone: '+15615550100', sms_consent: 1,
};

// Twilio and Resend are both unconfigured in these envs, so sendSms/sendEmail no-op instead of
// reaching a network. What we assert on is the ROUTING decision, which is where the bugs live.
function harness({ claim = 1, order = ORDER } = {}) {
  const claims = [];
  const texts = [];
  const routes = [
    [/UPDATE orders SET delivery_failed_notified_at/i, ({ args }) => { claims.push(args); return claim; }],
    [/SELECT id, phone FROM clients/i, () => null],
    // sendSms no-ops without Twilio credentials but still logs the body it WOULD have sent —
    // which is exactly the text a real customer would have received.
    [/INSERT INTO sms_log/i, ({ args }) => { texts.push({ to: args[3], body: args[5] }); return 1; }],
  ];
  return { env: { DB: makeD1(routes) }, claims, texts, order };
}

test('a failed delivery notifies the customer, on the consented channel', async () => {
  const h = harness();
  const r = await notifyDeliveryFailed(h.env, h.order, { reason: 'no_answer' });
  assert.equal(h.claims.length, 1, 'the claim is taken');
  assert.equal(r.sent, true);
  assert.equal(r.channel, 'sms', 'a consented number gets the text');
  assert.equal(h.texts.length, 1);
  assert.equal(h.texts[0].to, '+15615550100');
  assert.match(h.texts[0].body, /could not complete your delivery/i);
  assert.match(h.texts[0].body, /couldn’t reach anyone at the delivery address/i, 'the real reason');
  assert.match(h.texts[0].body, /nothing more will be charged/i);
  assert.match(h.texts[0].body, /Reply STOP to opt out/, 'A2P 10DLC');
});

test('IT FIRES EXACTLY ONCE — a second Fail tap sends nothing', async () => {
  // changes === 0 is what a real D1 returns when the stamp is already set.
  const h = harness({ claim: 0 });
  const r = await notifyDeliveryFailed(h.env, h.order, { reason: 'no_answer' });
  assert.equal(r.duplicate, true);
  assert.equal(r.sent, false);
  // And nothing past the claim ran: no contact lookup, no send.
  assert.equal(h.env.DB.sqlLog().filter((s) => /FROM clients/.test(s)).length, 0);
});

test('the claim comes BEFORE the send, so a race cannot double-notify', () => {
  const src = readFileSync(new URL('../../functions/_lib/notify.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function notifyDeliveryFailed'));
  const claimIdx = fn.indexOf('delivery_failed_notified_at = ?');
  const sendIdx = fn.indexOf('return await deliver(');
  assert.ok(claimIdx > -1 && sendIdx > -1);
  assert.ok(claimIdx < sendIdx, 'claim the row, then send');
});

test('CONSENT IS RESPECTED: no opt-in means no text', async () => {
  const h = harness({ order: { ...ORDER, sms_consent: 0 } });
  const r = await notifyDeliveryFailed(h.env, h.order, { reason: 'wrong_address' });
  // Falls through to email. RESEND_API_KEY is absent, so nothing leaves — but crucially the SMS
  // branch was not taken for a number that never opted in.
  assert.equal(r.sent, false, 'no consented phone and no email credential → nothing sent');
  assert.equal(h.claims.length, 1, 'still claimed, so it is not retried forever');
});

test('an order with no way to reach anyone is a quiet no-op, not an error', async () => {
  const h = harness({ order: { id: 'ord_2' } });
  const r = await notifyDeliveryFailed(h.env, h.order, { reason: 'other' });
  assert.equal(r.sent, false);
});

test('a broken database never breaks the driver standing on a doorstep', async () => {
  const boom = { DB: makeD1([[/UPDATE orders/i, () => { throw new Error('D1 down'); }]]) };
  const r = await notifyDeliveryFailed(boom, ORDER, { reason: 'no_answer' });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'claim_failed');
  // No env, no order, junk reason — all survivable.
  assert.equal((await notifyDeliveryFailed(null, ORDER, {})).sent, false);
  assert.equal((await notifyDeliveryFailed(boom, null, {})).sent, false);
});

// ---------- the copy ----------

test('the copy says what happened, what we are doing, and how to reach a human', async () => {
  const sent = [];
  const env = {
    DB: makeD1([
      [/UPDATE orders SET delivery_failed_notified_at/i, () => 1],
      [/SELECT id, phone FROM clients/i, () => null],
    ]),
    // Force the email branch by removing consent and supplying a Resend key + capture.
    RESEND_API_KEY: 'x', OWNER_PHONE: '(561) 555-0175',
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) };
  };
  await notifyDeliveryFailed(env, { ...ORDER, sms_consent: 0 }, { reason: 'wrong_address' });
  globalThis.fetch = realFetch;

  assert.equal(sent.length, 1, 'the email went');
  const html = sent[0].body.html;
  assert.match(html, /could not complete your delivery/i, 'WHAT happened');
  assert.match(html, /the address on the order didn’t get us to you/i, 'the actual reason, not a shrug');
  assert.match(html, /nothing further will be charged/i, 'the money question, answered first');
  assert.match(html, /redelivery|getting it back out to you/i, 'WHAT we are doing');
  assert.match(html, /refunding you in full/i, 'and the other option, honestly');
  assert.match(html, /561\) 555-0175/, 'HOW to reach a human');
  assert.doesNotMatch(html, /rate|review|survey/i, 'this is not the moment to ask for a review');
});

test('each failure reason produces its own honest cause line — never a generic shrug', () => {
  const src = readFileSync(new URL('../../functions/_lib/notify.js', import.meta.url), 'utf8');
  // The five reasons the driver app can send (REASONS in delivery/fail.js) must all be covered.
  for (const reason of ['no_answer', 'wrong_address', 'refused', 'damaged', 'other']) {
    assert.match(src, new RegExp(`${reason}:`), `${reason} needs its own wording`);
  }
});

test('the driver endpoint actually calls it, and defers it off the response', () => {
  const src = readFileSync(new URL('../../functions/api/hub/driver/delivery/fail.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ notifyDeliveryFailed \}/);
  const sideIdx = src.indexOf('const sideEffects');
  const callIdx = src.indexOf('notifyDeliveryFailed(env, ord');
  assert.ok(sideIdx > -1 && callIdx > sideIdx, 'the customer notice rides the deferred side-effects, not the driver’s response');
  assert.match(src, /waitUntil\(sideEffects\)/);
});
