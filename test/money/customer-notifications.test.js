// Customer order notifications — push first, SMS fallback, and never sent twice.
//
// Dayan asked for live order tracking on the lock screen: confirmed → on the way → almost there →
// delivered → rate it, plus plan reminders and marketing.
//
// The delivery decision that shapes everything: on iPhone, web push only works once the site is
// added to the Home Screen. So for most customers SMS is not a degraded fallback, it IS the
// channel, and push is the upgrade for those who install. Both must run off ONE pipeline or the
// two will drift and someone gets told twice.
//
// The failure that actually loses customers here is over-notifying. Order status is written by
// several independent paths — the Square webhook, the kitchen board, the driver app, a manual
// owner edit — and more than one can land on the same status. Being told your food is ready four
// times is how people switch notifications off for good.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { notifyCustomer, pendingFor, ORDER_EVENTS } from '../../functions/_lib/notifications.js';

const PUSH = readFileSync(new URL('../../functions/_lib/push.js', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const SUBSCRIBE = readFileSync(new URL('../../functions/api/push/subscribe.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0055_customer_push.sql', import.meta.url), 'utf8');

const EM = 'buyer@example.test';
// No VAPID configured → sendPushToEmail no-ops, which is the realistic default and forces the
// SMS path to be exercised.
const envWith = (routes) => ({ DB: makeD1(routes) });

test('a notification is queued and delivered once', async () => {
  const inserts = [];
  const env = envWith([
    [/INSERT INTO notifications/, ({ args }) => { inserts.push(args[2]); return 1; }],
    [/UPDATE notifications SET channel/, () => 1],
  ]);
  let smsCalls = 0;
  const r = await notifyCustomer(env, {
    email: EM, dedupeKey: 'order:o1:delivered', title: 'Delivered',
    smsFallback: () => { smsCalls++; return true; },
  });
  assert.equal(r.ok, true);
  assert.equal(r.channel, 'sms', 'no push subscription → SMS carries it');
  assert.equal(smsCalls, 1);
  assert.deepEqual(inserts, ['order:o1:delivered']);
});

test('THE SAME EVENT NEVER FIRES TWICE', async () => {
  // The UNIQUE dedupe_key is the lock. A second writer hitting the same status must send nothing.
  let smsCalls = 0;
  const env = envWith([
    [/INSERT INTO notifications/, () => { throw new Error('UNIQUE constraint failed'); }],
  ]);
  const r = await notifyCustomer(env, {
    email: EM, dedupeKey: 'order:o1:ready', title: 'Ready',
    smsFallback: () => { smsCalls++; return true; },
  });
  assert.equal(r.duplicate, true);
  assert.equal(r.sent, false);
  assert.equal(smsCalls, 0, 'a duplicate must not reach the customer at all');
});

test('the dedupe key is claimed BEFORE anything is sent', async () => {
  // If the send came first, two concurrent writers would both send and only then discover the
  // clash. Claiming first makes the race safe.
  const src = readFileSync(new URL('../../functions/_lib/notifications.js', import.meta.url), 'utf8');
  const insertIdx = src.indexOf('INSERT INTO notifications');
  const pushIdx = src.indexOf('sendPushToEmail(env, em)');
  assert.ok(insertIdx > -1 && pushIdx > -1);
  assert.ok(insertIdx < pushIdx, 'claim the key, then send');
});

test('a failing notification never breaks the order flow that triggered it', async () => {
  const env = { DB: null };
  const r = await notifyCustomer(env, { email: EM, dedupeKey: 'k', title: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.sent, false);
});

test('missing pieces are refused quietly rather than queuing junk', async () => {
  const env = envWith([]);
  for (const args of [{ dedupeKey: 'k', title: 't' }, { email: EM, title: 't' }, { email: EM, dedupeKey: 'k' }]) {
    const r = await notifyCustomer(env, args);
    assert.equal(r.sent, false);
  }
});

test('SMS is only tried when push reached nobody', async () => {
  // Belt and braces: the code path must not double-deliver to someone who has push enabled.
  const src = readFileSync(new URL('../../functions/_lib/notifications.js', import.meta.url), 'utf8');
  assert.match(src, /if \(channel === 'none' && typeof smsFallback === 'function'\)/);
});

test('pending items are marked delivered as they are handed over', async () => {
  // Otherwise a second wake re-renders the same notification.
  const marked = [];
  const env = envWith([
    [/SELECT id, title, body, url, kind FROM notifications/, () => ([{ id: 'n1', title: 'On the way' }])],
    [/UPDATE notifications SET delivered_at/, ({ args }) => { marked.push(args[1]); return 1; }],
  ]);
  const items = await pendingFor(env, EM);
  assert.equal(items.length, 1);
  assert.deepEqual(marked, ['n1']);
});

// ---------- what the customer actually gets told ----------

test('kitchen-internal stages are NOT customer notifications', async () => {
  // 'prep' is real, and useless to a customer — they cannot act on it, and every extra buzz spends
  // attention needed for the ones that matter.
  assert.ok(!ORDER_EVENTS.prep, 'prep must not notify');
  assert.ok(ORDER_EVENTS.paid && ORDER_EVENTS.out_for_delivery && ORDER_EVENTS.approaching && ORDER_EVENTS.delivered);
});

test('delivered invites the rating, which is the point of sending it', async () => {
  assert.match(ORDER_EVENTS.delivered.body(), /rate/i);
});

// ---------- audience separation ----------

test('a customer push can never wake a staff device, or the reverse', async () => {
  // One table serves both populations. Without the audience guard, a stale row — or an email that
  // happened to match a role string — could cross the streams.
  assert.match(PUSH, /audience = 'customer' AND LOWER\(TRIM\(email\)\) IN/);
  assert.match(PUSH, /audience = 'staff' AND staff_id IN/);
  assert.match(PUSH, /audience = 'staff' AND role IN/);
});

test('order tracking and marketing are separate consents', async () => {
  // Agreeing to be told where your food is is not agreeing to be sold to. Collapsing them means
  // someone mutes order tracking to escape a promo, then misses their delivery.
  assert.match(MIG, /marketing_opt_in INTEGER NOT NULL DEFAULT 0/);
  assert.match(SUBSCRIBE, /marketing_opt_in/);
});

test('re-subscribing the same device updates instead of duplicating', async () => {
  assert.match(SUBSCRIBE, /ON CONFLICT\(endpoint\) DO UPDATE SET/);
});

test('customers can turn notifications OFF', async () => {
  // A notification you cannot switch off gets the whole channel blocked at the OS level.
  assert.match(SUBSCRIBE, /onRequestDelete/);
});

// ---------- the service worker ----------

test('the storefront worker does not cache the site', () => {
  // Caching would put stale menu prices and stale legal pages in front of customers.
  assert.ok(!/caches\.open|cache\.put|addAll/.test(SW), 'this worker exists only to receive pushes');
});

test('every push renders SOMETHING, even when the lookup fails', () => {
  // Browsers show their own "site updated in the background" notice otherwise.
  assert.match(SW, /if \(!items\.length\)/);
  assert.match(SW, /Tap to see your order/);
});

test('a new stage REPLACES the previous notice rather than stacking', () => {
  assert.match(SW, /tag: n\.kind === 'order' \? 'anejo-order'/);
  assert.match(SW, /renotify: true/);
});

test('tapping a notification reuses an open tab', () => {
  assert.match(SW, /matchAll\(\{ type: 'window'/);
});

// ---------- order confirmed ----------
//
// Until now the only thing sent on payment was a POINTS message — a reward notice, not a
// confirmation. Someone who has just paid wants to know we HAVE the order, not their balance.
// Square emails its own receipt, but that is Square's branding and says nothing about delivery.

const WEBHOOK = readFileSync(new URL('../../functions/api/webhooks/square.js', import.meta.url), 'utf8');

test('paying confirms the order to the customer', () => {
  assert.match(WEBHOOK, /ORDER_EVENTS\.paid\.title/);
  assert.match(WEBHOOK, /dedupeKey: `order:\$\{o\.id\}:paid`/);
});

test('a Square webhook RETRY cannot confirm the same order twice', () => {
  // Square retries deliveries; without the dedupe key a customer gets "order confirmed" repeatedly.
  assert.match(WEBHOOK, /dedupeKey: `order:\$\{o\.id\}:paid`/);
  const src = readFileSync(new URL('../../functions/_lib/notifications.js', import.meta.url), 'utf8');
  assert.match(src, /dedupe_key/);
});

test('the confirmation names the delivery date, so the row must carry it', () => {
  // ORDER_EVENTS.paid.body reads o.delivery_date — if the SELECT omits it the message silently
  // degrades to a bare "We've got your order".
  assert.match(WEBHOOK, /promo_points_mult, delivery_date FROM orders/);
});

test('confirmation is attempted even when the buyer left no email', () => {
  // A guest with SMS consent must still get told. The email-gated block below it is for POINTS.
  const idx = WEBHOOK.indexOf('dedupeKey: `order:${o.id}:paid`');
  const guard = WEBHOOK.lastIndexOf('if (o) {', idx);
  const emailGuard = WEBHOOK.lastIndexOf('if (o && o.customer_email)', idx);
  assert.ok(guard > emailGuard, 'the confirm block must not sit inside the email-only branch');
});

test('a failed confirmation never breaks the payment webhook', () => {
  // Square retries on a non-200; throwing here would replay the whole payment handler.
  assert.match(WEBHOOK, /catch \(e\) \{ console\.log\('confirm notify error:'/);
});
