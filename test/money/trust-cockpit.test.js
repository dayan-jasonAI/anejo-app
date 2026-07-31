// The trust ledger + marketing cockpit (0072): graduated autonomy the owner can SEE.
//
// The rules everything below defends, in the owner's own terms:
//   1. Everything Aña drafts is human-approved at first. A category EARNS auto-publish with
//      5 clean approvals in a row — clean meaning not a word was changed.
//   2. One edit resets the streak. A draft that needed fixing is proof the lane still needs eyes.
//   3. Code counts and code shows "eligible" — but the toggle is the OWNER'S. Nothing flips it.
//   4. Even toggled on, nothing auto-schedules without a PASSED governance audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRUST_CATEGORIES, AUTO_PUBLISH_AFTER, captionHash, noteTrustApproval, autoPublishCategories,
} from '../../functions/_lib/trust_ledger.js';

const LIB = readFileSync(new URL('../../functions/_lib/trust_ledger.js', import.meta.url), 'utf8');
const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const TRUST = readFileSync(new URL('../../functions/api/hub/owner/trust.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0072_trust_cockpit.sql', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const NAV = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');

// A D1 stub: `first()` answers the social_posts read with `post`; `run()` captures every write
// (sql + bound args) so a test can assert exactly which ledger statement fired.
function stubDb(post) {
  const writes = [];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() { if (/FROM social_posts/.test(sql)) return post; return null; },
        async all() { return { results: [] }; },
        async run() { writes.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
      };
      return stmt;
    },
  };
  return { db, writes };
}

// ---------- 1 & 2: clean approvals count, edits reset ----------

test('a CLEAN approval (caption untouched) increments the category streak', async () => {
  const caption = 'Bowls built for your week. #anejo';
  const { db, writes } = stubDb({
    source: 'planner', category: 'menu', caption, original_caption_hash: captionHash(caption),
  });
  const r = await noteTrustApproval({ DB: db }, 'sp_1');
  assert.deepEqual({ counted: r.counted, clean: r.clean, category: r.category }, { counted: true, clean: true, category: 'menu' });
  assert.equal(writes.length, 1, 'one ledger write');
  assert.match(writes[0].sql, /approved_clean = approved_clean \+ 1/, 'the streak grows by one');
  assert.equal(writes[0].args[0], 'menu', 'under the post\'s own category');
});

test('an EDITED caption RESETS the streak to zero — not merely "does not count"', async () => {
  const { db, writes } = stubDb({
    source: 'planner', category: 'promo',
    caption: 'Owner fixed this line before approving.',
    original_caption_hash: captionHash('What Aña originally drafted.'),
  });
  const r = await noteTrustApproval({ DB: db }, 'sp_2');
  assert.equal(r.clean, false);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /SET approved_clean = 0/, 'the reset is written, wiping the streak');
  assert.equal(writes[0].args[0], 'promo');
});

test('only PLANNER posts with a category carry trust signal; a pre-0072 schema records nothing', async () => {
  // The owner's own hand-written post says nothing about whether Aña's drafts are clean.
  const owner = stubDb({ source: 'owner', category: 'menu', caption: 'x', original_caption_hash: captionHash('x') });
  assert.equal((await noteTrustApproval({ DB: owner.db }, 'sp_3')).counted, false);
  assert.equal(owner.writes.length, 0);

  // Missing columns (SELECT throws) must not break the approval riding alongside.
  const broken = { DB: { prepare() { throw new Error('no such column: original_caption_hash'); } } };
  assert.equal((await noteTrustApproval(broken, 'sp_4')).counted, false);
});

test('approval is counted at the HUMAN gate, and only on the FIRST yes (draft → out)', () => {
  // Pinned to the exact conditions in the owner social endpoint: schedule counts a draft,
  // publish counts a draft that skipped the schedule — a scheduled post was already counted,
  // so re-scheduling or retrying a failure cannot inflate the streak.
  assert.match(API, /if \(row\.status === 'draft'\) await noteTrustApproval\(env, postId\);/);
  assert.match(API, /if \(post\.status === 'draft'\) await noteTrustApproval\(env, postId\);/);
});

test('the ledger NEVER flips auto_publish — both upsert branches leave the toggle alone', () => {
  // Every ON CONFLICT update in the lib touches approved_clean and updated_at only.
  const conflictUpdates = LIB.match(/DO UPDATE SET[^`]*/g) || [];
  assert.ok(conflictUpdates.length >= 2, 'both the increment and the reset are upserts');
  for (const u of conflictUpdates) assert.ok(!u.includes('auto_publish'), `an upsert touches the owner's toggle: ${u}`);
});

// ---------- 3: the toggle is the owner's ----------

test('the trust endpoint is owner-only, both verbs', () => {
  const guards = TRUST.match(/requireRole\(request, env, \['owner'\]\)/g) || [];
  assert.equal(guards.length, 2, 'GET and POST each ask for the owner');
});

test('turning autonomy ON requires the earned streak, in the UPDATE itself; OFF is unconditional', () => {
  // The eligibility check lives in the WHERE, so a stale page (streak reset a minute ago)
  // cannot re-enable a lane that just proved it needs eyes.
  assert.match(TRUST, /SET auto_publish=1, updated_at=\? WHERE category=\? AND approved_clean>=\?/);
  assert.match(TRUST, /Not eligible yet/);
  assert.match(TRUST, /DO UPDATE SET auto_publish=0/, 'off is always reachable');
  assert.equal(AUTO_PUBLISH_AFTER, 5, 'the owner said five clean approvals');
});

// ---------- 4: auto-publish needs BOTH the toggle and a clean audit ----------

test('the planner promotes to scheduled ONLY behind toggle AND audit_status=pass, and degrades to draft', async () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  // One statement, both gates: the id only enters the loop from the auto_publish=1 set, and the
  // WHERE demands the governance audit's explicit pass — NULL, 'flag', anything else stays draft.
  assert.match(planner, /autoPublishCategories\(env\)/);
  assert.match(planner, /SET status='scheduled', updated_at=\? WHERE id=\? AND status='draft' AND audit_status='pass'/);
  assert.match(LIB, /FROM trust_ledger WHERE auto_publish=1/);
  // No governance columns (or no trust table) must mean the pre-0072 behaviour: drafts only.
  const broken = { DB: { prepare() { throw new Error('no such table: trust_ledger'); } } };
  assert.equal((await autoPublishCategories(broken)).size, 0, 'a broken read fails CLOSED to human approval');
});

// ---------- the fixed category list ----------

test('the five categories are fixed, validated on intake, and seeded in the migration', () => {
  assert.deepEqual(TRUST_CATEGORIES, ['menu', 'macro_portal', 'catering', 'brand_story', 'promo']);
  // The planner stores an invented lane as NULL — a streak nobody can toggle must never start.
  assert.match(AUTO, /TRUST_CATEGORIES\.includes\(item && item\.category\) \? item\.category : null/);
  assert.match(AUTO, /"category": string/, 'the JSON schema line asks the model for the field');
  // The toggle endpoint refuses anything off the list.
  assert.match(TRUST, /if \(!TRUST_CATEGORIES\.includes\(category\)\) return bad\('Unknown category\.'\)/);
  for (const c of TRUST_CATEGORIES) assert.ok(MIG.includes(`('${c}',`), `migration seeds ${c}`);
  assert.match(MIG, /ADD COLUMN category TEXT/);
  assert.match(MIG, /ADD COLUMN original_caption_hash TEXT/);
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS trust_ledger \(\n {2}category\s+TEXT PRIMARY KEY/);
});

test('the drafted caption is hashed AT INSERT so approval has something honest to compare', () => {
  assert.match(AUTO, /captionHash\(caption\)/);
  // Stable and deterministic — the whole scheme rests on this.
  assert.equal(captionHash('Añejo'), captionHash('Añejo'));
  assert.notEqual(captionHash('Añejo'), captionHash('Anejo'));
});

// ---------- the cockpit ----------

test('the marketing cockpit hits all four endpoints — budget, links, inbox, trust', () => {
  assert.match(PAGE, /'\/api\/hub\/automations\/run'/, 'card 1: the AI budget meter');
  assert.match(PAGE, /'\/api\/hub\/owner\/links'/, 'card 2: tracked links');
  assert.match(PAGE, /'\/api\/hub\/owner\/social-inbox'/, 'card 3: Aña\'s inbox');
  assert.match(PAGE, /'\/api\/hub\/owner\/trust'/, 'card 4: the trust ledger');
  // The budget card renders the meter the server computed — the UI never re-derives money.
  assert.match(PAGE, /spent_usd/);
  assert.match(PAGE, /remaining_usd/);
  // Escalations link into Comms, where the send actually happens.
  assert.match(PAGE, /\/hub\/owner\/comms\.html/);
});

test('the cockpit is on the nav and lights its own tab', () => {
  assert.match(NAV, /\{ view: 'marketing', href: '\/hub\/owner\/marketing\.html'/);
  assert.match(NAV, /label: 'Marketing'/);
  assert.match(PAGE, /Owner\.init\('marketing', load\)/);
});
