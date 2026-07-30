// Instagram comments and DMs.
//
// This is the first thing we have built where getting it wrong risks THE ACCOUNT ITSELF rather
// than a failed request. Meta's rules are not API quirks — breaking them is a policy violation
// against a business asset with the whole customer base on it.
//
// Three walls, and the code has no way to express the wrong side of any of them:
//   1. NEVER MESSAGE FIRST. There is no follower list and no new-follower event, so "auto-DM every
//      new follower" is not a feature we declined to build — it has no legitimate implementation.
//   2. 24 HOURS from THEIR last message.
//   3. The webhook is public and writes to the team's inbox, so it fails CLOSED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replyWindow, sendDirectMessage } from '../../functions/_lib/instagram_messaging.js';

const HOOK = readFileSync(new URL('../../functions/api/webhooks/instagram.js', import.meta.url), 'utf8');
const MSG = readFileSync(new URL('../../functions/_lib/instagram_messaging.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0062_instagram_inbox.sql', import.meta.url), 'utf8');

const ENV = { IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '178414', IG_API_HOST: 'instagram' };

// ---------- 1. never message first ----------

test('someone who never messaged us cannot be messaged', async () => {
  const r = await sendDirectMessage(ENV, { thread: { last_inbound_at: null }, recipientId: '123', text: 'hi' });
  assert.equal(r.ok, false);
  assert.equal(r.blocked, 'never_messaged_us');
  assert.match(r.error, /has not messaged you first/);
});

test('the window check cannot be skipped by the caller', () => {
  // It lives INSIDE the send, not in whoever calls it, so there is no path that forgot it.
  const fn = MSG.slice(MSG.indexOf('export async function sendDirectMessage'));
  assert.match(fn, /const win = replyWindow\(thread\)/);
  assert.ok(fn.indexOf('replyWindow(thread)') < fn.indexOf('graphPost'), 'checked BEFORE the send');
});

test('there is no way to express "message a follower"', () => {
  // Every send takes a thread that already has an inbound message. No follower list is fetched,
  // because none exists — and no endpoint here takes a bare username.
  assert.ok(!/followers|follower_list|\/follows/.test(MSG));
  assert.match(MSG, /export async function sendDirectMessage\(env, \{ thread, recipientId, text \}/);
});

test('no auto-follow, auto-like or scraping is offered', () => {
  assert.ok(!/\bfollow\(|\blike\(|unfollow|\/media\/[^/]*\/likes/.test(MSG));
});

// ---------- 2. the 24-hour window ----------

test('a reply inside 24 hours is allowed, outside it is not', () => {
  const now = 1_800_000_000_000;
  assert.equal(replyWindow({ last_inbound_at: now - 60 * 60 * 1000 }, now).ok, true, '1h ago');
  assert.equal(replyWindow({ last_inbound_at: now - 23.5 * 3600 * 1000 }, now).ok, true, '23.5h ago');
  const late = replyWindow({ last_inbound_at: now - 25 * 3600 * 1000 }, now);
  assert.equal(late.ok, false);
  assert.equal(late.reason, 'window_closed');
});

test('a closed window says how long ago they wrote, not just "no"', () => {
  const now = 1_800_000_000_000;
  const r = replyWindow({ last_inbound_at: now - 30 * 3600 * 1000 }, now);
  assert.equal(r.hours_ago, 30);
});

test('we do not tag automated copy as a human agent', () => {
  // The human_agent tag extends the window and means what it says. Using it to get around the
  // limit is the kind of thing that costs an account.
  // Matched as a SENT PARAMETER, not as the word — the module comment explains why it is avoided.
  assert.ok(!/tag:\s*['"]human_agent/.test(MSG), 'never sent as a message tag');
  assert.ok(!/messaging_type/.test(MSG), 'no messaging_type override either');
});

test('last_inbound_at is what makes a send legal, and it moves on every inbound', () => {
  assert.match(MIG, /ALTER TABLE threads ADD COLUMN last_inbound_at INTEGER/);
  assert.match(HOOK, /UPDATE threads SET last_inbound_at=\?/);
});

// ---------- 3. the webhook is public ----------

test('an unsigned or wrongly-signed POST is refused', () => {
  assert.match(HOOK, /const ok = await signatureValid\(env\.IG_APP_SECRET, raw, request\.headers\.get\('x-hub-signature-256'\)\)/);
  assert.match(HOOK, /if \(!ok\) return new Response\('Bad signature', \{ status: 401 \}\)/);
});

test('it FAILS CLOSED with no secret configured', () => {
  // The opposite call from geocoding: there, failing closed would have taken the storefront off
  // sale over a missing key. Here, failing open lets a stranger put words in a customer's mouth
  // inside Añejo's own inbox.
  assert.match(HOOK, /if \(!env\.IG_APP_SECRET\)[\s\S]{0,200}return bad\('Instagram webhooks are not configured/);
  const secretIdx = HOOK.indexOf('if (!env.IG_APP_SECRET)');
  assert.ok(secretIdx > 0 && secretIdx < HOOK.indexOf('JSON.parse(raw)'), 'refused before any parsing');
});

test('the signature compare is constant-time', () => {
  assert.match(HOOK, /function ctEqHex/);
  assert.match(HOOK, /diff \|= x\.charCodeAt\(i\) \^ y\.charCodeAt\(i\)/);
});

test('the handshake checks the verify token before echoing the challenge', () => {
  // Echoing it unconditionally would let anyone point their app's webhooks at us.
  assert.match(HOOK, /env\.IG_WEBHOOK_VERIFY_TOKEN && token === env\.IG_WEBHOOK_VERIFY_TOKEN/);
});

// ---------- retries must not duplicate ----------

test('a retried delivery is stored once, and draws no second reply', () => {
  // Meta retries. Without this a retried DM becomes two inbox rows and potentially two replies.
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS social_events/);
  assert.match(HOOK, /INSERT OR IGNORE INTO social_events/);
  assert.match(HOOK, /if \(!r\.meta \|\| r\.meta\.changes !== 1\) return false;\s*\/\/ already had it/);
});

test('our own echoed messages are not treated as the customer writing', () => {
  // An echo would reset the 24-hour window on our OWN reply and look like a new inbound.
  assert.match(HOOK, /const isEcho = !!\(m && m\.message && m\.message\.is_echo\)/);
  assert.match(HOOK, /if \(!mid \|\| !fromId \|\| isEcho\) continue/);
});

// ---------- it lands where the team already looks ----------

test('DMs go into Añejo Comms, not a second inbox', () => {
  // The inbox that gets forgotten is always the one the customer used.
  assert.match(HOOK, /INSERT INTO threads \(id, audience, subject, external_id, external_username, last_inbound_at/);
  assert.match(HOOK, /INSERT INTO messages \(id, thread_id, direction, channel/);
  assert.match(HOOK, /'inbound','instagram'/);
});

test('a spam comment is HIDDEN, never deleted, and never automatically', () => {
  // Deleting is irreversible and invisible; deleting a real complaint is how a small thing
  // becomes a screenshot.
  assert.match(MSG, /export async function hideComment/);
  assert.ok(!/DELETE|deleteComment/.test(MSG));
  assert.match(MSG, /Reserved for spam, and never automatic/);
});
