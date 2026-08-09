// The abandoned checkout finally gets a message — Decision #11.
//
// _lib/abandoned.js relabelled stale unpaid rows so the OWNER's order list stopped lying, and
// that was the end of it. Some of those people hit a card that didn't clear or a page that timed
// out; they meant to buy lunch and did not. Nobody ever asked.
//
// The risk in the other direction is worse than the silence, which is why most of this file is
// about restraint rather than delivery:
//
//   · AT MOST ONE MESSAGE, EVER, PER ORDER — the claim is the lock.
//   · NEVER TO SOMEONE WHO OPTED OUT — and an opt-out is claimed too, so they are not
//     re-evaluated on every tick for the rest of time.
//   · NEVER TO A NUMBER THAT DID NOT OPT IN.
//   · NEVER A MONTH LATE. A note about a lunch someone didn't buy in May is not a nudge.
//   · A REAL ONE-CLICK OPT-OUT ON THE EMAIL, and STOP on the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import {
  recoverAbandoned, recoveryEnabled, recoveryDelayMs, recoveryMaxAgeMs,
  DEFAULT_RECOVERY_AFTER_HOURS, DEFAULT_RECOVERY_MAX_AGE_HOURS,
  RECOVERY_SMS, RECOVERY_EMAIL_SUBJECT, recoveryEmailBody,
} from '../../functions/_lib/abandoned.js';

const NOW = 1785000000000;
const BASE = 'https://anejocateringco.com';

const ROW = {
  id: 'ord_1', customer_name: 'Marisol Reyes', customer_email: 'marisol@example.test',
  customer_phone: '+15615550100', sms_consent: 1,
};

function harness({ rows = [ROW], claim = 1, unsubscribed = false } = {}) {
  const claims = [];
  const labels = [];
  const DB = makeD1([
    [/FROM orders\s+WHERE status = 'abandoned'/i, ({ args }) => ({ results: rows, args })],
    [/FROM campaign_unsubscribes/i, () => (unsubscribed ? { x: 1 } : null)],
    [/UPDATE orders SET recovery_sent_at/i, ({ args }) => { claims.push(args); return claim; }],
    [/UPDATE orders SET recovery_channel/i, ({ args }) => { labels.push(args); return 1; }],
  ]);
  const sms = [], email = [];
  const send = {
    sms: async (o) => { sms.push(o); return { ok: true }; },
    email: async (o) => { email.push(o); return { id: 'em' }; },
  };
  return { DB, claims, labels, sms, email, send };
}

// ---------- the window ----------

test('the message waits hours after the sweep, and is overridable without a deploy', () => {
  assert.equal(recoveryDelayMs({}), DEFAULT_RECOVERY_AFTER_HOURS * 3600000);
  assert.equal(recoveryMaxAgeMs({}), DEFAULT_RECOVERY_MAX_AGE_HOURS * 3600000);
  assert.equal(recoveryDelayMs({ RECOVERY_AFTER_HOURS: '6' }), 6 * 3600000);
  assert.equal(recoveryDelayMs({ RECOVERY_AFTER_HOURS: '0' }), DEFAULT_RECOVERY_AFTER_HOURS * 3600000,
    'zero would message someone mid-payment');
  assert.equal(recoveryDelayMs({ RECOVERY_AFTER_HOURS: 'soon' }), DEFAULT_RECOVERY_AFTER_HOURS * 3600000);
});

test('the query only ever looks at abandoned rows that have never been messaged, inside the window', async () => {
  const h = harness();
  await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  const sql = h.DB.sqlLog().find((s) => /FROM orders/.test(s));
  assert.match(sql, /status = 'abandoned'/, 'a pending or paid order is never chased');
  assert.match(sql, /recovery_sent_at IS NULL/, 'and never one already messaged');

  const args = h.DB.calls.find((c) => /FROM orders/.test(c.sql)).args;
  assert.equal(args[0], NOW - recoveryDelayMs({}), 'older than the delay');
  assert.equal(args[1], NOW - recoveryMaxAgeMs({}), 'and younger than the max age');
  assert.ok(args[0] > args[1], 'a real window, not an open-ended sweep of history');
});

// ---------- at most once ----------

test('AT MOST ONCE: the claim is what sends, and it only wins once', async () => {
  const h = harness();
  const r = await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(r.sent, 1);
  assert.equal(h.claims.length, 1);
  assert.match(h.DB.sqlLog().find((s) => /recovery_sent_at = \?/.test(s)), /recovery_sent_at IS NULL/,
    'the UPDATE is conditional — that is the lock');
});

test('a second tick that loses the claim sends nothing', async () => {
  const h = harness({ claim: 0 });   // changes === 0: somebody else already claimed it
  const r = await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(r.sent, 0);
  assert.equal(r.skipped.claimed_elsewhere, 1);
  assert.equal(h.sms.length + h.email.length, 0, 'nothing reached the customer');
});

test('the claim happens BEFORE either sender is called', async () => {
  const order = [];
  const DB = makeD1([
    [/FROM orders\s+WHERE status = 'abandoned'/i, () => [ROW]],
    [/FROM campaign_unsubscribes/i, () => null],
    [/UPDATE orders SET recovery_sent_at/i, () => { order.push('claim'); return 1; }],
    [/UPDATE orders SET recovery_channel/i, () => 1],
  ]);
  await recoverAbandoned({ DB }, {
    nowMs: NOW, baseUrl: BASE,
    send: { sms: async () => { order.push('send'); return {}; }, email: async () => ({}) },
  });
  assert.deepEqual(order, ['claim', 'send']);
});

// ---------- consent and opt-out ----------

test('AN OPT-OUT IS HONOURED — and claimed, so they are never reconsidered', async () => {
  const h = harness({ unsubscribed: true });
  const r = await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(r.sent, 0);
  assert.equal(r.skipped.opted_out, 1);
  assert.equal(h.sms.length + h.email.length, 0, 'not one message to somebody who said no');
  assert.equal(h.claims.length, 1, 'still claimed');
  assert.equal(h.claims[0][1], 'none', 'and recorded as "none", not as a send');
});

test('a number that never opted in is not texted — it falls to email', async () => {
  const h = harness({ rows: [{ ...ROW, sms_consent: 0 }] });
  await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(h.sms.length, 0, 'A2P 10DLC: no opt-in, no text');
  assert.equal(h.email.length, 1);
});

test('an order with no email and no consented phone is skipped without a claim', async () => {
  const h = harness({ rows: [{ id: 'ord_x', customer_phone: '+15615550100', sms_consent: 0 }] });
  const r = await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(r.skipped.no_contact, 1);
  assert.equal(h.claims.length, 0, 'nothing to claim — leave it addressable if they add an email later');
});

test('a SUPPRESSED address (bounce/complaint) is not counted as a send', async () => {
  const h = harness({ rows: [{ ...ROW, sms_consent: 0 }] });
  h.send.email = async () => ({ skipped: true, suppressed: 'bounce' });
  const r = await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.equal(r.sent, 0);
  assert.equal(h.labels[0][0], 'none', 'the row records that nothing actually left the building');
});

test('the whole thing can be switched off without a deploy', async () => {
  assert.equal(recoveryEnabled({}), true, 'Decision #11 was ratified ON');
  assert.equal(recoveryEnabled({ RECOVERY_ENABLED: '0' }), false);
  const h = harness();
  const r = await recoverAbandoned({ DB: h.DB, RECOVERY_ENABLED: '0' }, { nowMs: NOW, send: h.send });
  assert.equal(r.skipped_all, 'disabled');
  assert.equal(h.claims.length, 0, 'off means it does not even look');
});

test('a broken database is silence, never a duplicate or a crash', async () => {
  const boom = makeD1([[/FROM orders/i, () => { throw new Error('D1 down'); }]]);
  const r = await recoverAbandoned({ DB: boom }, { nowMs: NOW, send: {} });
  assert.equal(r.sent, 0);
  assert.equal((await recoverAbandoned({}, { nowMs: NOW })).sent, 0);
  assert.equal((await recoverAbandoned(null, {})).sent, 0);
});

// ---------- the copy ----------

test('THE OPT-OUT IS REAL: one-click on the email, STOP on the text', async () => {
  const h = harness();
  await recoverAbandoned({ DB: h.DB }, { nowMs: NOW, baseUrl: BASE, send: h.send });
  assert.match(h.sms[0].body, /Reply STOP to opt out/);

  const h2 = harness({ rows: [{ ...ROW, sms_consent: 0 }] });
  await recoverAbandoned({ DB: h2.DB }, { nowMs: NOW, baseUrl: BASE, send: h2.send });
  const e = h2.email[0];
  assert.equal(e.subject, RECOVERY_EMAIL_SUBJECT);
  assert.match(e.unsubscribeUrl, /\/api\/unsubscribe\?a=marisol%40example\.test&c=all/,
    'the same RFC 8058 route campaigns use, not a bespoke dead link');
});

test('the copy is a nudge, not a sales pitch', () => {
  const sms = RECOVERY_SMS('Marisol', `${BASE}/order`);
  const html = recoveryEmailBody('Marisol', `${BASE}/order`);
  for (const text of [sms, html]) {
    assert.match(text, /nothing was charged|nothing<\/strong> was charged|<strong>nothing<\/strong> was charged/i,
      'the first thing anyone wants to know');
    assert.doesNotMatch(text, /% off|discount|coupon|expires|hurry|last chance/i,
      'no discount, no countdown — they did not decide against us, they hit a problem');
  }
  assert.match(sms, /reply to this text/i, 'a human is reachable');
  assert.match(html, /reply to this email/i);
});
