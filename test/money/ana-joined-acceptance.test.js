// Joined local acceptance for Aña's inbound DM -> draft -> owner review -> provider receipt path.
// The database uses the repository's real SQLite migration set; every network response is local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as tickPost } from '../../functions/api/hub/admin/social-inbox-tick.js';
import { onRequestGet as inboxGet, onRequestPost as inboxPost } from '../../functions/api/hub/owner/social-inbox.js';

test('local inbound DM is drafted, reviewed by owner, and fake provider acceptance is persisted once', async (t) => {
  const now = Date.now();
  const env = ownerEnv({ CRON_KEY: 'local-cron', ANTHROPIC_API_KEY: 'local-model', IG_ACCESS_TOKEN: 'local-ig', IG_USER_ID: 'anejo-self', IG_API_HOST: 'instagram' });
  env.DB.sqlite.prepare("INSERT INTO threads(id,audience,external_id,external_username,last_inbound_at,status,created_at,updated_at) VALUES ('ana-thread','instagram','local-customer','maria',?,'open',?,?)").run(now, now, now);
  env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES ('ana-inbound','ana-thread','inbound','instagram','local-customer','customer','Do you deliver to Jupiter?',0,?)").run(now);

  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const address = String(url);
    calls.push({ address, init });
    if (address.startsWith('https://api.anthropic.com/')) {
      return new Response(JSON.stringify({ content: [{ text: 'Yes, we deliver to Jupiter. What day did you have in mind?' }] }), { status: 200 });
    }
    if (address.startsWith('https://graph.instagram.com/') && !init.method) {
      return new Response(JSON.stringify({ user_id: 'anejo-self', username: 'anejo' }), { status: 200 });
    }
    if (address === 'https://graph.instagram.com/v23.0/me/messages' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.recipient.id, 'local-customer');
      assert.equal(body.message.text, 'Yes, we deliver to Jupiter. What day did you have in mind?');
      return new Response(JSON.stringify({ message_id: 'fake-provider-ack-1' }), { status: 200 });
    }
    throw new Error(`Unexpected network request in local acceptance: ${address}`);
  });

  try {
    const tickResponse = await tickPost({
      request: new Request('https://anejo.test/api/hub/admin/social-inbox-tick', { method: 'POST', headers: { 'x-cron-key': 'local-cron' } }),
      env,
    });
    const tick = await tickResponse.json();
    assert.equal(tick.ok, true);
    assert.equal(tick.drafted, 1);
    assert.equal(tick.sent, 0, 'fresh local settings default to automatic sending off');
    assert.equal(env.DB.one("SELECT value FROM app_settings WHERE key='social.auto_reply'"), null, 'no setting was enabled for this fixture');
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM instagram_reply_attempts").n, 0, 'drafting did not call the outbound provider');

    const getRequest = () => new Request('https://anejo.test/api/hub/owner/social-inbox', { headers: { cookie: OWNER_COOKIE } });
    const review = await (await inboxGet({ request: getRequest(), env })).json();
    assert.equal(review.ok, true);
    const item = review.items.find((entry) => entry.id === 'ana-thread');
    assert.ok(item, 'the real owner inbox exposes the local inbound thread');
    assert.equal(item.last_inbound, 'Do you deliver to Jupiter?');
    assert.equal(item.drafts.length, 1);
    const draft = item.drafts[0];
    assert.equal(draft.body, 'Yes, we deliver to Jupiter. What day did you have in mind?');

    const staleReview = await inboxPost({
      request: new Request('https://anejo.test/api/hub/owner/social-inbox', {
        method: 'POST', headers: { cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'send', thread_id: 'ana-thread', message_id: draft.id, expected_body: 'Outdated preview' }),
      }),
      env,
    });
    assert.equal(staleReview.status, 502);
    assert.equal((await staleReview.json()).error, 'draft_changed');
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM instagram_reply_attempts").n, 0, 'stale owner preview did not claim a send');
    assert.equal(calls.filter((call) => call.address.endsWith('/me/messages') && call.init.method === 'POST').length, 0,
      'stale owner preview never reached the fake provider');

    const send = await inboxPost({
      request: new Request('https://anejo.test/api/hub/owner/social-inbox', {
        method: 'POST', headers: { cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'send', thread_id: 'ana-thread', message_id: draft.id, expected_body: draft.body }),
      }),
      env,
    });
    assert.equal(send.status, 200);
    const sent = await send.json();
    assert.equal(sent.sent, true);
    assert.equal(sent.replayed, false);
    assert.equal(sent.provider_message_id, 'fake-provider-ack-1');
    assert.equal(sent.delivered, undefined, 'provider acceptance is not represented as recipient delivery');

    const attempt = env.DB.one('SELECT * FROM instagram_reply_attempts WHERE thread_id=?', 'ana-thread');
    assert.equal(attempt.state, 'sent');
    assert.equal(attempt.provider_message_id, 'fake-provider-ack-1');
    const receipt = JSON.parse(attempt.acceptance_receipt_json);
    assert.equal(receipt.provider_message_id, 'fake-provider-ack-1');
    assert.equal(receipt.attempt_id, attempt.id);
    const outbound = env.DB.one('SELECT sent_at,sender_role,body FROM messages WHERE id=?', draft.id);
    assert.equal(outbound.sent_at, receipt.accepted_at);
    assert.equal(outbound.sender_role, 'ana_draft');
    assert.equal(outbound.body, draft.body);

    const replay = await inboxPost({
      request: new Request('https://anejo.test/api/hub/owner/social-inbox', {
        method: 'POST', headers: { cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'send', thread_id: 'ana-thread', message_id: draft.id, expected_body: draft.body }),
      }),
      env,
    });
    assert.equal((await replay.json()).replayed, true);
    assert.equal(calls.filter((call) => call.address.endsWith('/me/messages') && call.init.method === 'POST').length, 1,
      'the fake outbound provider received exactly one send');
  } finally {
    env.DB.sqlite.close();
  }
});
