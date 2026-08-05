// The owner's second complaint: Team used to "orchestrate the rest of the team" and now reads as
// "a random chat box that lacks." team.js's executeAction already does three real things
// (create_brief, request_intel, draft_posts) — team-lead.test.js pins the executor itself. What
// was missing from the SURFACE was any sign of a track record: nothing on the page showed what
// the Lead had actually done.
//
// This drives the real GET/POST /api/hub/owner/team route and proves the new `activity` field:
//   · lists posts the LEAD commissioned (source='planner' AND created_by='lead') — never the
//     automated weekly planner's own drafts, which carry created_by='system'
//     (functions/_lib/automations.js) and must not be counted as the Lead's work.
//   · lists intel the LEAD filed (requested_by='lead') — never the owner's own manual questions
//     from api/hub/owner/intel.js.
//   · is present on BOTH onRequestGet (page load) and onRequestPost (after a chat turn) — a track
//     record that only appears on first paint and vanishes after the first message would be
//     exactly the kind of "looks broken" regression this whole page is being repaired for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/owner/team.js';

function env({ leadDrafts = [], systemDrafts = [], leadIntel = [], ownerIntel = [] } = {}) {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind() {
          return {
            async first() {
              if (q.includes('SELECT active FROM staff')) return { active: 1 };
              return null;
            },
            async all() {
              // The exact WHERE clause is the test — a query that dropped the created_by='lead'
              // half would silently start counting the automated planner's own drafts too.
              if (q.includes("FROM social_posts WHERE source='planner' AND created_by='lead'")) {
                return { results: leadDrafts };
              }
              if (q.includes("FROM intel_requests WHERE requested_by='lead'")) {
                return { results: leadIntel };
              }
              // Anything else (team_messages, team_briefs) answers empty — irrelevant to this test.
              return { results: [] };
            },
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return { DB: db, SESSIONS: { async get(k) { return kv.get(k) || null; } }, _systemDrafts: systemDrafts, _ownerIntel: ownerIntel };
}

const get = (e, cookie = 'anejo_sess=tok') => onRequestGet({
  env: e, request: new Request('https://x.test/api/hub/owner/team', { headers: { Cookie: cookie } }),
});
const post = (e, body, cookie = 'anejo_sess=tok') => onRequestPost({
  env: e,
  request: new Request('https://x.test/api/hub/owner/team', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  }),
});

const LEAD_DRAFTS = [
  { id: 'sp_1', caption: 'FUEGO for the office lunch crowd', status: 'draft', created_at: 200 },
  { id: 'sp_2', caption: 'RAÍZ macro breakdown carousel', status: 'scheduled', created_at: 100 },
];
const LEAD_INTEL = [
  { id: 'intel_1', question: 'What are competitors charging for weekly plans in PBC?', status: 'pending', created_at: 150 },
];

test('GET reports the drafts the Lead commissioned and the intel it requested', async () => {
  const e = env({ leadDrafts: LEAD_DRAFTS, leadIntel: LEAD_INTEL });
  const out = await (await get(e)).json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(out.activity, 'the track record must exist on the response');
  assert.equal(out.activity.drafts.length, 2);
  assert.equal(out.activity.drafts[0].caption, 'FUEGO for the office lunch crowd');
  assert.equal(out.activity.intel.length, 1);
  assert.equal(out.activity.intel[0].question, LEAD_INTEL[0].question);
});

test('the automated planner\'s own drafts (created_by=system) never show up as Lead activity', async () => {
  // The query itself is what enforces this (see the stub's WHERE match above) — this test pins
  // the CONTRACT: an empty leadDrafts answer must render as an empty list, not fall back to
  // counting something else.
  const e = env({ leadDrafts: [], leadIntel: [] });
  const out = await (await get(e)).json();
  assert.deepEqual(out.activity.drafts, []);
  assert.deepEqual(out.activity.intel, []);
});

test('a DB failure degrades the track record to empty, never a broken page', async () => {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const e = {
    DB: {
      prepare(sql) {
        if (sql.includes('SELECT active FROM staff')) return { bind: () => ({ first: async () => ({ active: 1 }) }) };
        return { bind: () => ({ all: async () => { throw new Error('table missing'); }, first: async () => null }) };
      },
    },
    SESSIONS: { async get(k) { return kv.get(k) || null; } },
  };
  const out = await (await get(e)).json();
  assert.equal(out.ok, true, 'the page must still load');
  assert.deepEqual(out.activity, { drafts: [], intel: [] });
});

test('POST (after a chat turn) reports the SAME activity shape as GET — not lost after the first message', async () => {
  const e = env({ leadDrafts: LEAD_DRAFTS, leadIntel: LEAD_INTEL });
  const out = await (await post(e, { message: 'What should we run this week?' })).json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(out.activity, 'activity must survive a chat POST, not just the initial GET');
  assert.equal(out.activity.drafts.length, 2);
  assert.equal(out.activity.intel.length, 1);
});

test('an unauthenticated request never reaches the activity queries', async () => {
  const e = env({ leadDrafts: LEAD_DRAFTS, leadIntel: LEAD_INTEL });
  const r = await get(e, '');
  assert.equal(r.status, 401);
});
