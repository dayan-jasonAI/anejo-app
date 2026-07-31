// Aña drafts Instagram replies; a HUMAN always sends. That is the owner's decision #1, and this
// file is where it is enforced:
//   · the every-minute tick can only DRAFT — the send functions are not even imported there;
//   · an escalation returns NO copy, so there is nothing downstream to accidentally send;
//   · the send op lives behind an owner session, one explicit message at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftReply } from '../../functions/_lib/ana_social.js';
import { onRequestPost as tickPost } from '../../functions/api/hub/admin/social-inbox-tick.js';

const ANA = readFileSync(new URL('../../functions/_lib/ana_social.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/social-inbox-tick.js', import.meta.url), 'utf8');
const OWNER = readFileSync(new URL('../../functions/api/hub/owner/social-inbox.js', import.meta.url), 'utf8');
const CHAT = readFileSync(new URL('../../functions/api/chat.js', import.meta.url), 'utf8');
const CRON = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0067_ana_drafts.sql', import.meta.url), 'utf8');

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const claudeSays = (text) => new Response(JSON.stringify({ content: [{ text }] }), { status: 200 });

// ---------------------------------------------------------------------------
// The tick: draft-only, structurally
// ---------------------------------------------------------------------------

test('auto-send exists ONLY behind the owner setting, and off is the code default', () => {
  // HISTORY: this test used to pin that the tick could not send at all — the send module was not
  // even imported. On 2026-07-31 the owner reviewed Aña's live drafts and the FAQ set and turned
  // auto-reply ON, so the requirement changed and this pin changed WITH it, deliberately. What
  // must now hold instead:
  //   1. code defaults to 'off' — a fresh environment can never auto-send before an owner decides
  //   2. every send call sits behind the autoOk() gate
  //   3. the DRAFTING module still cannot send — the brain and the hands stay separate
  assert.match(TICK, /let autoMode = 'off'/);
  assert.match(TICK, /social\.auto_reply/);
  const sends = [...TICK.matchAll(/(sendDirectMessage|replyToComment)\s*\(/g)];
  assert.ok(sends.length >= 2, 'both send paths exist now');
  for (const m of sends) {
    const before = TICK.slice(Math.max(0, m.index - 400), m.index);
    assert.match(before, /autoOk\('(dm|comment)'\)/, `${m[1]} is gated by autoOk`);
  }
  assert.ok(!/instagram_messaging/.test(ANA), 'ana_social must not import the sending module');
});

test('escalations still send NOTHING — the carve-out survived automation', () => {
  // The escalate branches insert a marker and increment a counter; no send call may live there.
  for (const block of TICK.split(/if \(d\.escalate\)/).slice(1)) {
    const branch = block.split('} else {')[0];
    assert.ok(!/sendDirectMessage|replyToComment/.test(branch), 'no send inside an escalate branch');
  }
});

test('a special request sends the holding reply AND alerts the kitchen+owner', () => {
  assert.match(TICK, /specialAlert/);
  assert.match(TICK, /type: 'special_request'/);
  assert.match(ANA, /\[SPECIAL\]/);
});

test('auto-sent replies are labelled ana_auto — the audit trail stays honest', () => {
  assert.match(TICK, /sender_role='ana_auto' WHERE id=\? AND sent_at IS NULL/);
});

test('the 24-hour legality gate still lives inside the send, not the tick', () => {
  const MSG_LIB = readFileSync(new URL('../../functions/_lib/instagram_messaging.js', import.meta.url), 'utf8');
  assert.match(MSG_LIB, /const win = replyWindow\(thread\)/);
});

test("Aña never quotes a cutoff hour — the owner's dial is not a fact", () => {
  assert.ok(!/6:00 PM the day before/.test(ANA), 'the fossilised 6 PM is gone');
  assert.match(ANA, /NEVER state a cutoff time from memory/);
});

test('the tick is not open to the internet', () => {
  assert.match(TICK, /ctEq\(cronKey, env\.CRON_KEY\)/);
  assert.match(TICK, /requireRole\(request, env, \['owner'\]\)/);
  assert.match(TICK, /skipped: 'anthropic_not_configured'/);
});

// A minimal D1 stand-in: dispatches on SQL substrings the tick actually uses, records every
// INSERT/UPDATE, and answers anything unrecognized (loadMenu's catalog reads) with empty results
// so the menu degrades to its fallback exactly like a fresh local DB.
function fakeDB(state) {
  const route = (sql, args) => {
    if (sql.includes('FROM social_events')) return { all: async () => ({ results: state.events }) };
    if (sql.startsWith('UPDATE social_events')) {
      return { run: async () => { state.eventUpdates.push(args); return { meta: { changes: 1 } }; } };
    }
    if (sql.includes("FROM threads WHERE audience='instagram' AND external_id")) {
      return { first: async () => null };
    }
    if (sql.includes('FROM threads')) return { all: async () => ({ results: state.dmThreads }) };
    if (sql.startsWith('INSERT INTO threads')) {
      return { run: async () => { state.threadInserts.push(args); return { meta: { changes: 1 } }; } };
    }
    if (sql.startsWith('INSERT INTO messages')) {
      return { run: async () => { state.messageInserts.push({ sql, args }); return { meta: { changes: 1 } }; } };
    }
    if (sql.includes('FROM messages WHERE thread_id=?')) {
      return { first: async () => state.lastMessage[args[0]] || null };
    }
    if (sql.startsWith('UPDATE threads')) return { run: async () => ({ meta: { changes: 1 } }) };
    return {};
  };
  return {
    prepare: (sql) => ({
      bind: (...args) => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 1 } }), ...route(sql, args) }),
      // loadMenu reads the catalog without bind(); empty results → fallback menu, never a throw.
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ meta: { changes: 1 } }),
    }),
  };
}

const cronReq = () => new Request('https://x/api/hub/admin/social-inbox-tick', {
  method: 'POST', headers: { 'x-cron-key': 'k' },
});

test('the tick drafts for a waiting comment and DM — and talks ONLY to Claude', async () => {
  const state = {
    events: [{ id: 'C1', platform: 'instagram', kind: 'comment', from_id: 'igu_9', from_username: 'maria', media_id: 'M7', text: 'do you deliver to Jupiter?', handled: 0, created_at: 1 }],
    dmThreads: [{ id: 'thr_dm', audience: 'instagram', status: 'open', external_id: 'igs_5', external_username: 'carlos', last_inbound_at: Date.now() - 60000, ref_type: null }],
    lastMessage: { thr_dm: { id: 'msg_in', thread_id: 'thr_dm', direction: 'inbound', body: 'how much is a bowl?' } },
    eventUpdates: [], threadInserts: [], messageInserts: [],
  };
  const f = stubFetch(() => claudeSays('¡Hola! Yes — we deliver Monday–Saturday across Palm Beach County.'));
  try {
    const res = await tickPost({ request: cronReq(), env: { DB: fakeDB(state), CRON_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' } });
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.drafted, 2, 'one comment draft + one DM draft');

    // Every network call went to Claude. Zero Instagram traffic is the whole point of a tick
    // that drafts: nothing here can reach a customer.
    for (const c of f.calls) assert.match(c.url, /^https:\/\/api\.anthropic\.com\//);

    const drafts = state.messageInserts.filter((m) => m.sql.includes("'ana_draft'"));
    assert.equal(drafts.length, 2, 'two rows inserted through the draft SQL');
    // Drafts are marked ai_drafted=1 in the SQL itself — the flag the owner UI and the send op key on.
    assert.match(drafts[0].sql, /'ana_draft',\?,1,/);
    // The comment draft carries the comment id it answers; the DM draft carries none.
    assert.ok(drafts.some((m) => m.args.includes('C1')), 'comment draft references comment C1');
    assert.ok(drafts.some((m) => m.args.includes(null) && !m.args.includes('C1')), 'DM draft has no comment ref');

    // The comment event was claimed (thread_id set + handled=1) so a retry cannot double-draft.
    assert.ok(state.eventUpdates.some((a) => a.includes('C1')), 'social event marked handled');
  } finally { f.restore(); }
});

test('a comment from our own account is skipped, not answered — Aña must not talk to herself', async () => {
  const state = {
    events: [{ id: 'C2', platform: 'instagram', kind: 'comment', from_id: 'me_1', from_username: 'anejo', media_id: 'M7', text: 'thanks!', handled: 0, created_at: 1 }],
    dmThreads: [], lastMessage: {}, eventUpdates: [], threadInserts: [], messageInserts: [],
  };
  const f = stubFetch(() => claudeSays('should never be called'));
  try {
    const res = await tickPost({ request: cronReq(), env: { DB: fakeDB(state), CRON_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test', IG_USER_ID: 'me_1' } });
    const j = await res.json();
    assert.equal(j.drafted, 0);
    assert.equal(j.skipped, 1);
    assert.equal(f.calls.length, 0, 'no Claude call was spent on our own echo');
  } finally { f.restore(); }
});

// ---------------------------------------------------------------------------
// draftReply: grounded, capped, and escalation returns NO copy
// ---------------------------------------------------------------------------

test('an escalation returns a reason and NO copy — nothing downstream can send what does not exist', async () => {
  const f = stubFetch(() => claudeSays('ESCALATE: refund demand, customer is angry'));
  try {
    const r = await draftReply({ ANTHROPIC_API_KEY: 'sk-test' }, { kind: 'dm', text: 'I want my money back NOW', username: 'carlos' });
    assert.equal(r.ok, true);
    assert.equal(r.escalate, true);
    assert.match(r.reason, /refund/i);
    assert.equal(r.draft, undefined, 'no draft key at all on an escalation');
  } finally { f.restore(); }
});

test('the draft prompt rides Haiku, carries the no-refunds rule, and says it is a DRAFT', async () => {
  const f = stubFetch(() => claudeSays('Happy to help!'));
  try {
    await draftReply({ ANTHROPIC_API_KEY: 'sk-test' }, { kind: 'comment', text: 'love this', username: 'maria' });
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.model, 'claude-haiku-4-5');
    assert.match(body.system, /Never promise refunds/);
    assert.match(body.system, /DRAFT/);
    assert.match(body.system, /reply is PUBLIC/, 'a comment draft is told it is public');
    // One Aña: the social prompt contains the same identity block the website chat uses.
    assert.match(body.system, /You are "Aña"/);
  } finally { f.restore(); }
});

test('a runaway reply is hard-capped at 500 characters', async () => {
  const f = stubFetch(() => claudeSays('x'.repeat(900)));
  try {
    const r = await draftReply({ ANTHROPIC_API_KEY: 'sk-test' }, { kind: 'dm', text: 'tell me everything' });
    assert.equal(r.ok, true);
    assert.ok(r.draft.length <= 500, `draft is ${r.draft.length} chars`);
  } finally { f.restore(); }
});

test('no API key or empty text means no draft — never a guess', async () => {
  const r1 = await draftReply({}, { kind: 'dm', text: 'hola' });
  assert.equal(r1.ok, false);
  const r2 = await draftReply({ ANTHROPIC_API_KEY: 'sk-test' }, { kind: 'dm', text: '   ' });
  assert.equal(r2.ok, false);
});

// ---------------------------------------------------------------------------
// The owner API: the only door out, and it is owner-shaped
// ---------------------------------------------------------------------------

test('sending requires an owner session — and only rows marked as Aña drafts can be acted on', () => {
  assert.match(OWNER, /requireRole\(request, env, \['owner'\]\)/);
  assert.match(OWNER, /sender_role !== 'ana_draft'/);
  assert.match(OWNER, /m\.sent_at\) return bad\('This draft was already sent\.', 409\)/);
  assert.match(OWNER, /m\.dismissed_at\) return bad\('This draft was dismissed\.', 409\)/);
});

test('the 24-hour reply window is surfaced per DM thread, hours_left included', () => {
  // replyWindow is THE window implementation (instagram_messaging.js enforces it again at send
  // time) — the inbox must read from the same clock, not a reimplementation.
  assert.match(OWNER, /import \{ replyWindow, sendDirectMessage, replyToComment \} from/);
  assert.match(OWNER, /window: kind === 'dm' \? replyWindow\(t\) : null/);
});

test('a dismissed draft is a marker, not a delete — so the tick cannot re-draft it', () => {
  assert.match(OWNER, /UPDATE messages SET dismissed_at=\?/);
  assert.ok(!/DELETE FROM messages/.test(OWNER), 'drafts are never deleted');
  assert.match(MIG, /ALTER TABLE messages ADD COLUMN dismissed_at INTEGER/);
  assert.match(MIG, /ALTER TABLE messages ADD COLUMN sent_at INTEGER/);
  assert.match(MIG, /ALTER TABLE messages ADD COLUMN ref_id TEXT/);
});

test('the tick runs every minute — reply speed is the feature', () => {
  assert.match(CRON, /EVERY_MINUTE = \[[^\]]*'\/api\/hub\/admin\/social-inbox-tick'\]/);
});

test('one Aña, not two — the website chat imports the same prompt the drafter uses', () => {
  assert.match(CHAT, /import \{ anaSystemPrompt \} from '\.\.\/_lib\/ana_social\.js'/);
  assert.ok(!/You are "Aña"/.test(CHAT), 'chat.js no longer carries its own copy of the prompt');
  assert.match(ANA, /You are "Aña"/);
});

test('comment threads never gain DM permission — last_inbound_at stays NULL on them', () => {
  // A public comment is not consent to be DMed. The tick creates comment threads WITHOUT
  // last_inbound_at, so even a mis-routed DM send fails closed as 'never_messaged_us'.
  const createSql = TICK.match(/INSERT INTO threads[^`]+/);
  assert.ok(createSql, 'thread create SQL found');
  assert.ok(!/last_inbound_at/.test(createSql[0]), 'comment thread create sets no last_inbound_at');
});

test('model scaffolding is stripped from the draft — the first live draft leaked "**DRAFT REPLY:**"', async () => {
  // The prompt forbids it, but a guarantee lives in code, not in a request. Verified against the
  // exact prefix the first real draft produced.
  const f = stubFetch(() => claudeSays('**DRAFT REPLY:**\n\nHey! We are Añejo — bowls at anejocateringco.com/order 🌿'));
  try {
    const r = await draftReply({ ANTHROPIC_API_KEY: 'sk-test' }, { kind: 'dm', text: 'what do you sell?' });
    assert.equal(r.ok, true);
    assert.ok(!/draft reply/i.test(r.draft), 'label gone');
    assert.ok(!r.draft.includes('**'), 'markdown emphasis gone');
    assert.ok(r.draft.startsWith('Hey!'), 'the message itself is intact');
  } finally { f.restore(); }
});

test('a reply typed in Comms on an Instagram thread ACTUALLY reaches Instagram', () => {
  // Before this, Comms stored the reply as an in_app row that looked sent in the HUB while the
  // customer received nothing — found because the owner asked "does it reflect on Instagram?".
  const COMMS = readFileSync(new URL('../../functions/api/hub/comms/messages.js', import.meta.url), 'utf8');
  assert.match(COMMS, /if \(thread\.audience === 'instagram'\) channel = 'instagram'/, 'inferred from the thread, not the page');
  assert.match(COMMS, /sendDirectMessage\(env, \{ thread, recipientId: thread\.external_id/, 'DMs route through the window-checked send');
  assert.match(COMMS, /replyToComment\(env, \{ commentId: lastIn\.ref_id/, 'comment threads reply under the actual comment');
  assert.match(COMMS, /if \(!ig \|\| !ig\.ok\) return bad/, 'a refused send is an error, never a fake success');
  assert.match(COMMS, /sender_role='ana_draft' AND sent_at IS NULL AND dismissed_at IS NULL/, "a human reply supersedes Aña's pending draft");
});
