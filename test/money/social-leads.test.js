// The missing sales half: a real buying signal in an Instagram DM/comment used to produce a
// warm auto-reply pointing at a web form and NOTHING ELSE — no row in `leads`, no alert, no
// owner notification (see functions/_lib/ana_social.js:143's routing line and the audit that
// found exactly one INSERT INTO leads in the whole codebase, fed only by that web form).
//
// This file pins:
//   · detectCommercialIntent() — the deterministic classifier (ana_social.js)
//   · captureInstagramLead()   — detect + write a leads row + alert only on 'high' (social_leads.js)
//   · the wiring into the tick — capture runs for both comments and DMs, independent of Aña's own
//     draft/budget/escalate path, and never breaks the tick
//   · escalate / [SPECIAL] are UNCHANGED — a message can be both, and neither rail is weakened
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { detectCommercialIntent } from '../../functions/_lib/ana_social.js';
import { captureInstagramLead } from '../../functions/_lib/social_leads.js';
import { onRequestPost as tickPost } from '../../functions/api/hub/admin/social-inbox-tick.js';

const TICK = readFileSync(new URL('../../functions/api/hub/admin/social-inbox-tick.js', import.meta.url), 'utf8');
const ANA = readFileSync(new URL('../../functions/_lib/ana_social.js', import.meta.url), 'utf8');
const SOCIAL_LEADS = readFileSync(new URL('../../functions/_lib/social_leads.js', import.meta.url), 'utf8');
const ALERTS = readFileSync(new URL('../../functions/_lib/alerts.js', import.meta.url), 'utf8');
const LEADS_MIG = readFileSync(new URL('../../migrations/0078_social_leads.sql', import.meta.url), 'utf8');
const OWNER_LEADS = readFileSync(new URL('../../functions/api/hub/owner/leads.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// detectCommercialIntent — pure classification
// ---------------------------------------------------------------------------

test('a clear catering booking with a headcount is HIGH confidence', () => {
  const r = detectCommercialIntent('I want to book catering for 60 people this Saturday!');
  assert.equal(r.intent, 'catering');
  assert.equal(r.confidence, 'high');
});

test('a plain compliment is NOT commercial intent at all', () => {
  assert.equal(detectCommercialIntent('This bowl looks incredible 😍'), null);
  assert.equal(detectCommercialIntent('omg the colors on this 🔥🔥'), null);
  assert.equal(detectCommercialIntent(''), null);
  assert.equal(detectCommercialIntent(null), null);
});

test('a bare "do you do X" question is commercial but only LOW confidence — a maybe is not a yes', () => {
  const r = detectCommercialIntent('do you guys do catering?');
  assert.equal(r.intent, 'catering');
  assert.equal(r.confidence, 'low');
});

test('bulk/corporate orders are detected', () => {
  const r = detectCommercialIntent('Can you cater lunch for our office, we need about 40 people fed');
  assert.equal(r.intent, 'catering', 'catering keyword is checked first and matches too — first match wins by design');
});

test('wholesale/partnership approaches are strong by default — these words are rarely casual', () => {
  const r = detectCommercialIntent("I'd love to carry your bowls in my gym, who handles wholesale?");
  assert.equal(r.intent, 'wholesale_partnership');
  assert.equal(r.confidence, 'high');
});

test('subscription/meal-plan interest is detected', () => {
  const r = detectCommercialIntent('I want to subscribe to the weekly meal plan');
  assert.equal(r.intent, 'subscription');
  assert.equal(r.confidence, 'high');
});

test('a bare mention with no commitment language stays low — only wholesale/partnership is strong by default', () => {
  const r = detectCommercialIntent('do you offer any subscription options?');
  assert.equal(r.intent, 'subscription');
  // No headcount, no intent verb ("offer" is not one), and subscription is NOT a strongByDefault
  // category (only wholesale_partnership is — those words are almost never used casually).
  assert.equal(r.confidence, 'low');
});

test('negation suppresses the match entirely — "we don\'t need catering" is not a lead', () => {
  assert.equal(detectCommercialIntent("We don't need catering for this, thanks!"), null);
  assert.equal(detectCommercialIntent('No wholesale please, just curious'), null);
});

test('a negation far earlier in a long message does not falsely suppress a real question later on', () => {
  const r = detectCommercialIntent('No worries at all — by the way, do you all do catering for weddings?');
  assert.ok(r, 'the later, unrelated catering question still registers');
  assert.equal(r.intent, 'catering');
});

// ---------------------------------------------------------------------------
// captureInstagramLead — detect + persist + alert-on-high-only
// ---------------------------------------------------------------------------

// Bind-arg positions in insertLead()'s VALUES list (functions/_lib/leads.js) — asserted once here
// so a silent column-order regression in leads.js would fail this file loudly.
const COL = {
  id: 0, kind: 1, channel: 18, ig_username: 19, ig_user_id: 20, ig_intent: 21,
  ig_confidence: 22, trigger_message: 23, source_thread_id: 24, source_message_id: 25,
};

function fakeSocialDb({ existingLead = null } = {}) {
  const leadInserts = [];
  const alertInserts = [];
  const db = makeD1([
    [/SELECT id FROM leads WHERE channel=\? AND source_thread_id=\? AND ig_user_id=\?/, () => existingLead],
    [/INSERT INTO leads/, ({ args }) => { leadInserts.push(args); return 1; }],
    [/SELECT id FROM alerts WHERE dedupe_key/, () => null],
    [/INSERT INTO alerts/, ({ args }) => { alertInserts.push(args); return 1; }],
    [/INSERT INTO activity_log/, () => 1],
  ]);
  return { db, leadInserts, alertInserts };
}

test('a catering enquiry becomes a lead — captured with who/what/how-sure, and alerts', async () => {
  const { db, leadInserts, alertInserts } = fakeSocialDb();
  const r = await captureInstagramLead({ DB: db }, {
    kind: 'dm', threadId: 'thr_1', igUserId: 'igu_9', igUsername: 'maria',
    messageId: 'msg_1', text: 'I want to book catering for 60 people this Saturday', t: 1000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.equal(r.intent, 'catering');
  assert.equal(r.confidence, 'high');
  assert.equal(r.alerted, true);

  assert.equal(leadInserts.length, 1);
  const args = leadInserts[0];
  assert.equal(args[COL.channel], 'instagram');
  assert.equal(args[COL.ig_username], 'maria');
  assert.equal(args[COL.ig_user_id], 'igu_9');
  assert.equal(args[COL.ig_intent], 'catering');
  assert.equal(args[COL.ig_confidence], 'high');
  assert.match(args[COL.trigger_message], /book catering for 60 people/);
  assert.equal(args[COL.source_thread_id], 'thr_1');
  assert.equal(args[COL.source_message_id], 'msg_1');
  assert.equal(args[COL.kind], 'tasting', 'catering maps onto the existing tasting bucket');

  assert.equal(alertInserts.length, 1, 'exactly one alert raised for the high-confidence hit');
  const alertArgs = alertInserts[0];
  // alerts INSERT bind order: id, alert_type, severity, title, body, team, ref_type, ref_id, source, dedupe_key, created_at, updated_at
  assert.equal(alertArgs[1], 'social_commercial_lead');
  assert.equal(alertArgs[2], 'warning');
  assert.match(alertArgs[3], /catering/i);
  assert.match(alertArgs[4], /hub\/owner\/leads\.html#l=/, 'the alert links straight to the lead in the HUB');
});

test('a plain compliment does NOT touch the database at all', async () => {
  const db = makeD1([]); // any query at all throws — proves nothing was queried or written
  const r = await captureInstagramLead({ DB: db }, {
    kind: 'comment', threadId: 'thr_2', igUserId: 'igu_2', igUsername: 'sofia',
    messageId: 'c1', text: 'This looks incredible 😍', t: 2000,
  });
  assert.equal(r.ok, true);
  assert.equal(r.created, false);
});

test('low confidence is recorded but does NOT alert', async () => {
  const { db, leadInserts, alertInserts } = fakeSocialDb();
  const r = await captureInstagramLead({ DB: db }, {
    kind: 'comment', threadId: 'thr_3', igUserId: 'igu_3', igUsername: 'carlos',
    messageId: 'c2', text: 'do you guys do catering?', t: 3000,
  });
  assert.equal(r.created, true);
  assert.equal(r.confidence, 'low');
  assert.equal(r.alerted, false);
  assert.equal(leadInserts.length, 1, 'still captured — findable in the HUB');
  assert.equal(alertInserts.length, 0, 'never interrupts the owner for a maybe');
});

test('the same DM processed twice creates exactly ONE lead', async () => {
  const leads = [];
  const db = makeD1([
    [/SELECT id FROM leads WHERE channel=\? AND source_thread_id=\? AND ig_user_id=\?/, ({ args }) => {
      const [ch, tid, uid] = args;
      return leads.find((l) => l.ch === ch && l.tid === tid && l.uid === uid) || null;
    }],
    [/INSERT INTO leads/, ({ args }) => { leads.push({ ch: args[COL.channel], tid: args[COL.source_thread_id], uid: args[COL.ig_user_id] }); return 1; }],
    [/SELECT id FROM alerts WHERE dedupe_key/, () => null],
    [/INSERT INTO alerts/, () => 1],
    [/INSERT INTO activity_log/, () => 1],
  ]);
  const env = { DB: db };
  const opts = { kind: 'dm', threadId: 'thr_4', igUserId: 'igu_4', igUsername: 'ana', messageId: 'm1', text: 'need catering for 80 guests, please quote', t: 4000 };
  const r1 = await captureInstagramLead(env, opts);
  const r2 = await captureInstagramLead(env, opts); // e.g. a webhook retry re-driving the same event
  assert.equal(r1.created, true);
  assert.equal(r2.created, false);
  assert.equal(r2.deduped, true);
  assert.equal(leads.length, 1);
});

test('a follow-up message in the SAME conversation does not create a second lead', async () => {
  const leads = [];
  const db = makeD1([
    [/SELECT id FROM leads WHERE channel=\? AND source_thread_id=\? AND ig_user_id=\?/, ({ args }) => {
      const [ch, tid, uid] = args;
      return leads.find((l) => l.ch === ch && l.tid === tid && l.uid === uid) || null;
    }],
    [/INSERT INTO leads/, ({ args }) => { leads.push({ ch: args[COL.channel], tid: args[COL.source_thread_id], uid: args[COL.ig_user_id] }); return 1; }],
    [/SELECT id FROM alerts WHERE dedupe_key/, () => null],
    [/INSERT INTO alerts/, () => 1],
    [/INSERT INTO activity_log/, () => 1],
  ]);
  const env = { DB: db };
  const first = await captureInstagramLead(env, { kind: 'dm', threadId: 'thr_5', igUserId: 'igu_5', igUsername: 'luis', messageId: 'm1', text: 'I want to book catering for 30 people', t: 5000 });
  // A DIFFERENT message, still commercial, same thread+person — must not spawn a second lead.
  const followUp = await captureInstagramLead(env, { kind: 'dm', threadId: 'thr_5', igUserId: 'igu_5', igUsername: 'luis', messageId: 'm2', text: 'actually make it 45 people, and we need it wholesale priced too', t: 5060 });
  assert.equal(first.created, true);
  assert.equal(followUp.created, false);
  assert.equal(followUp.deduped, true);
  assert.equal(leads.length, 1);
});

test('a missing/absent leads table degrades to ok:false — never throws', async () => {
  const db = makeD1([]); // every query unrouted -> throws, simulating an unmigrated `leads` table
  const r = await captureInstagramLead({ DB: db }, {
    kind: 'dm', threadId: 'thr_6', igUserId: 'igu_6', igUsername: 'nina',
    messageId: 'm1', text: 'need catering for 20 people please', t: 6000,
  });
  assert.equal(r.ok, false);
});

test('no threadId or no igUserId means nothing is even classified — there is no one to follow up with', async () => {
  const db = makeD1([]);
  const r1 = await captureInstagramLead({ DB: db }, { kind: 'dm', threadId: null, igUserId: 'igu_7', text: 'book catering for 50 people' });
  const r2 = await captureInstagramLead({ DB: db }, { kind: 'dm', threadId: 'thr_7', igUserId: null, text: 'book catering for 50 people' });
  assert.equal(r1.created, false);
  assert.equal(r2.created, false);
});

// ---------------------------------------------------------------------------
// Wiring into the tick — runs for both comments and DMs, and cannot break it
// ---------------------------------------------------------------------------

test('the tick imports and calls captureInstagramLead for both comments and DMs', () => {
  assert.match(TICK, /import \{ captureInstagramLead \} from '\.\.\/\.\.\/\.\.\/_lib\/social_leads\.js'/);
  const calls = [...TICK.matchAll(/captureInstagramLead\(env,/g)];
  assert.equal(calls.length, 2, 'once in the comment loop, once in the DM loop');
});

test('DM sales capture runs BEFORE the draft budget is spent — a busy day must not cost a lead', () => {
  const captureIdx = TICK.indexOf("kind: 'dm', threadId: th.id");
  const budgetIdx = TICK.indexOf('budget -= 1;', captureIdx);
  assert.ok(captureIdx > -1 && budgetIdx > -1 && captureIdx < budgetIdx);
});

test('both capture call sites are wrapped so a throw cannot abort the tick', () => {
  for (const m of TICK.matchAll(/captureInstagramLead\(env,/g)) {
    const before = TICK.slice(Math.max(0, m.index - 30), m.index);
    assert.match(before, /try \{ await $/, 'call site is guarded by its own try');
  }
});

test('a catering DM creates a lead through a full tick run, alongside Aña\'s normal draft', async () => {
  const leadInserts = [];
  const alertInserts = [];
  const state = {
    events: [],
    dmThreads: [{ id: 'thr_dm', audience: 'instagram', status: 'open', external_id: 'igs_9', external_username: 'wedding_planner_fl', last_inbound_at: Date.now() - 60000, ref_type: null }],
    lastMessage: { thr_dm: { id: 'msg_in', thread_id: 'thr_dm', direction: 'inbound', body: 'Hi! I want to book catering for 60 people for a wedding next month, what would that cost?' } },
    eventUpdates: [], threadInserts: [], messageInserts: [],
  };
  function fakeDB(state) {
    const route = (sql, args) => {
      if (sql.includes('FROM social_events')) return { all: async () => ({ results: state.events }) };
      if (sql.includes('FROM threads') && sql.includes("audience='instagram'") && sql.includes("status='open'")) return { all: async () => ({ results: state.dmThreads }) };
      if (sql.includes('FROM messages WHERE thread_id=?')) return { first: async () => state.lastMessage[args[0]] || null };
      if (sql.startsWith('UPDATE threads')) return { run: async () => ({ meta: { changes: 1 } }) };
      if (sql.startsWith('INSERT INTO messages')) return { run: async () => { state.messageInserts.push(args); return { meta: { changes: 1 } }; } };
      if (sql.includes('SELECT id FROM leads WHERE channel=')) return { first: async () => null };
      if (sql.startsWith('INSERT INTO leads')) return { run: async () => { leadInserts.push(args); return { meta: { changes: 1 } }; } };
      if (sql.includes('SELECT id FROM alerts WHERE dedupe_key')) return { first: async () => null };
      if (sql.startsWith('INSERT INTO alerts')) return { run: async () => { alertInserts.push(args); return { meta: { changes: 1 } }; } };
      if (sql.startsWith('INSERT INTO activity_log')) return { run: async () => ({ meta: { changes: 1 } }) };
      return {};
    };
    return {
      prepare: (sql) => ({
        bind: (...args) => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 1 } }), ...route(sql, args) }),
        all: async () => ({ results: [] }), // loadMenu's catalog read (no bind())
        first: async () => null,
        run: async () => ({ meta: { changes: 1 } }),
      }),
    };
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ text: 'Congratulations! Catering for 60 for a wedding — let me get you a quote, one moment.' }] }), { status: 200 });
  try {
    const res = await tickPost({
      request: new Request('https://x/api/hub/admin/social-inbox-tick', { method: 'POST', headers: { 'x-cron-key': 'k' } }),
      env: { DB: fakeDB(state), CRON_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' },
    });
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.drafted, 1, 'Aña still drafted her normal reply — capture did not replace it');
    assert.equal(leadInserts.length, 1, 'the enquiry became a lead');
    assert.equal(leadInserts[0][COL.ig_intent], 'catering');
    assert.equal(leadInserts[0][COL.ig_confidence], 'high');
    assert.equal(alertInserts.length, 1, 'the owner was alerted');
  } finally { globalThis.fetch = realFetch; }
});

test('a missing leads table does not break comment/DM handling — the tick still drafts', async () => {
  const state = {
    events: [{ id: 'C9', platform: 'instagram', kind: 'comment', from_id: 'igu_88', from_username: 'party_planner', media_id: 'M1', text: 'need catering for 90 corporate guests, who do I talk to?', handled: 0, created_at: 1 }],
    dmThreads: [], lastMessage: {}, eventUpdates: [], threadInserts: [], messageInserts: [],
  };
  function throwingLeadsDB(state) {
    const route = (sql, args) => {
      if (sql.includes('FROM social_events')) return { all: async () => ({ results: state.events }) };
      if (sql.includes("FROM threads WHERE audience='instagram' AND external_id")) return { first: async () => null };
      if (sql.startsWith('INSERT INTO threads')) return { run: async () => { state.threadInserts.push(args); return { meta: { changes: 1 } }; } };
      if (sql.startsWith('INSERT INTO messages')) return { run: async () => { state.messageInserts.push({ sql, args }); return { meta: { changes: 1 } }; } };
      if (sql.startsWith('UPDATE threads')) return { run: async () => ({ meta: { changes: 1 } }) };
      if (sql.startsWith('UPDATE social_events')) return { run: async () => { state.eventUpdates.push(args); return { meta: { changes: 1 } }; } };
      // `leads` table does not exist on this environment yet — every leads query throws.
      if (sql.includes('leads')) return { first: async () => { throw new Error('no such table: leads'); }, run: async () => { throw new Error('no such table: leads'); } };
      return {};
    };
    return {
      prepare: (sql) => ({
        bind: (...args) => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({ meta: { changes: 1 } }), ...route(sql, args) }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ meta: { changes: 1 } }),
      }),
    };
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ text: 'Thanks for reaching out! Send us a DM with the headcount and date.' }] }), { status: 200 });
  try {
    const res = await tickPost({
      request: new Request('https://x/api/hub/admin/social-inbox-tick', { method: 'POST', headers: { 'x-cron-key': 'k' } }),
      env: { DB: throwingLeadsDB(state), CRON_KEY: 'k', ANTHROPIC_API_KEY: 'sk-test' },
    });
    const j = await res.json();
    assert.equal(j.ok, true, 'the tick itself still succeeds');
    assert.equal(j.drafted, 1, 'Aña still drafted a reply — the missing leads table never reached her path');
    assert.ok(state.eventUpdates.some((a) => a.includes('C9')), 'the comment was still marked handled');
  } finally { globalThis.fetch = realFetch; }
});

// ---------------------------------------------------------------------------
// escalate / [SPECIAL] are UNCHANGED — a message can be BOTH commercial and escalate-worthy
// ---------------------------------------------------------------------------

test('an angry refund demand about a real catering order still escalates — commercial detection does not weaken it', async () => {
  // detectCommercialIntent operates on the raw customer text directly, same as draftReply's own
  // ESCALATE/[SPECIAL] classification does inside the model — neither reads the other's output,
  // so nothing here can suppress or replace an escalation.
  const r = detectCommercialIntent('I paid for catering for 100 guests and it never showed up, I want a refund NOW');
  assert.ok(r, 'the message is still recognized as commercial...');
  assert.equal(r.intent, 'catering');
  // ...while escalate/[SPECIAL] themselves are pinned exhaustively in ana-social.test.js and are
  // untouched by this change: detectCommercialIntent is a new, independent function this file
  // does not call from anywhere near the ESCALATE_PREFIX/[SPECIAL] parsing in draftReply().
  assert.ok(!/detectCommercialIntent/.test(ANA.slice(ANA.indexOf('export async function draftReply'), ANA.indexOf('ESCALATE_PREFIX', ANA.indexOf('export async function draftReply')))),
    'draftReply\'s own escalate parsing does not call the new classifier — the two are independent');
});

test('escalate branches in the tick still send nothing, and now ALSO still run sales capture', () => {
  // Re-affirms the existing pin from ana-social.test.js (no send inside an escalate branch) while
  // additionally confirming captureInstagramLead is called BEFORE the escalate/draft branch, so a
  // message that trips both gets captured as a lead either way.
  for (const block of TICK.split(/if \(d\.escalate\)/).slice(1)) {
    const branch = block.split('} else {')[0];
    assert.ok(!/sendDirectMessage|replyToComment/.test(branch), 'still no send inside an escalate branch');
  }
  const commentCaptureIdx = TICK.indexOf("kind: 'comment', threadId, igUserId");
  const commentEscalateIdx = TICK.indexOf('if (d.escalate)');
  assert.ok(commentCaptureIdx > -1 && commentEscalateIdx > -1 && commentCaptureIdx < commentEscalateIdx,
    'capture runs before the escalate/draft branch, so it applies regardless of which way that branch goes');
});

// ---------------------------------------------------------------------------
// The alert type, and the HUB surfacing
// ---------------------------------------------------------------------------

test('social_commercial_lead is a registered alert type — added, not restructured', () => {
  assert.match(ALERTS, /'social_commercial_lead'/);
  assert.match(ALERTS, /export const ALERT_TYPES = \[/, 'the list itself was not rewritten, only extended');
});

test('the migration is additive: nullable/defaulted columns, and idempotency is a DB constraint', () => {
  assert.match(LEADS_MIG, /ALTER TABLE leads ADD COLUMN channel TEXT NOT NULL DEFAULT 'web'/);
  assert.match(LEADS_MIG, /ALTER TABLE leads ADD COLUMN ig_user_id/);
  assert.match(LEADS_MIG, /ALTER TABLE leads ADD COLUMN trigger_message/);
  assert.match(LEADS_MIG, /ALTER TABLE leads ADD COLUMN source_thread_id\s+TEXT REFERENCES threads\(id\)/);
  assert.match(LEADS_MIG, /CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_ig_dedupe/);
  assert.match(LEADS_MIG, /WHERE channel='instagram' AND source_thread_id IS NOT NULL AND ig_user_id IS NOT NULL/);
});

test('the owner leads API selects the Instagram columns and supports a channel filter, degrading if 0078 is not applied', () => {
  assert.match(OWNER_LEADS, /channel, ig_username, ig_user_id, ig_intent, ig_confidence, trigger_message, source_thread_id/);
  assert.match(OWNER_LEADS, /channel === 'instagram'/);
  assert.match(OWNER_LEADS, /LEAD_COLS_BASE/, 'a pre-0078 fallback column set exists');
});

test('captureInstagramLead never imports anything that could send to Instagram', () => {
  assert.ok(!/instagram_messaging/.test(SOCIAL_LEADS), 'this file writes leads and alerts only — it cannot reach Instagram');
});
