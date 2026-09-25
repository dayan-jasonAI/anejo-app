import {createHash} from 'node:crypto';
import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';
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

import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { SOCIAL_AUDIT_SNAPSHOT, SOCIAL_AUDIT_CONTEXT } from '../../functions/_lib/social_audit.js';
function fixture() {
  const DB=makeSqliteD1();
  DB.sqlite.prepare(`INSERT INTO social_posts(id,platform,caption,status,source,category,original_caption_hash,created_at,updated_at,public_token)
    VALUES ('sp_1','instagram','Original','scheduled','planner','menu',?,1,1,'public-test')`).run(captionHash('Original'));
  DB.exec("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES ('m1','sp_1',0,'studio/test.jpg','media-token',1)");
  DB.exec(`UPDATE social_posts SET original_design_snapshot=${SOCIAL_AUDIT_SNAPSHOT},audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT},audit_status='pass',audit_scope='caption_and_media',audit_context_snapshot=${SOCIAL_AUDIT_CONTEXT},audit_detail_json='{"rubric_version":"${VERSION}"}'`);
  const bytes=new Uint8Array([255,216,255,217]);
  DB.sqlite.prepare('UPDATE social_posts SET audit_detail_json=?').run(JSON.stringify({rubric_version:VERSION,input_coverage:{slide_sources:[{slide:1,media_id:'m1',seq:0,key:'studio/test.jpg',sha256:createHash('sha256').update(bytes).digest('hex'),byte_length:4}]}}));
  return {DB,MEDIA:{get:async()=>({size:4,arrayBuffer:async()=>bytes.buffer})}};
}
test('distinct clean visual approval counts only once, including concurrent requests',async()=>{
  const env=fixture();
  const results=await Promise.all([noteTrustApproval(env,'sp_1'),noteTrustApproval(env,'sp_1')]);
  assert.equal(results.filter(r=>r.counted).length,1);
  assert.equal(env.DB.one("SELECT approved_clean FROM trust_ledger WHERE category='menu'").approved_clean,1);
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
});
for(const kind of ['caption','media'])test(kind+' correction resets credit and restoration cannot earn it back',async()=>{
  const env=fixture();await noteTrustApproval(env,'sp_1');
  env.DB.exec(kind==='caption' ? "UPDATE social_posts SET caption='Corrected'" : "UPDATE social_posts SET media_key='studio/new.jpg'");
  const result=await noteTrustApproval(env,'sp_1');assert.equal(result.clean,false);
  assert.equal(env.DB.one("SELECT approved_clean FROM trust_ledger WHERE category='menu'").approved_clean,0);
  env.DB.exec("UPDATE social_posts SET caption='Original',media_key=NULL");
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
});
for(const invalid of ["original_design_snapshot=NULL","audit_scope='caption_only'","audit_status='flag'","audit_snapshot='stale'","audit_context_snapshot=NULL","audit_detail_json=NULL","source='owner'"])test('no trust earned with '+invalid,async()=>{
  const env=fixture();env.DB.exec('UPDATE social_posts SET '+invalid);
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
});
test('each new corrected revision resets later earnings but an identical retry does not',async()=>{
  const env=fixture();env.DB.exec("UPDATE social_posts SET caption='Correction one'");
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,true);
  env.DB.exec("UPDATE trust_ledger SET approved_clean=4 WHERE category='menu'");
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
  assert.equal(env.DB.one("SELECT approved_clean FROM trust_ledger WHERE category='menu'").approved_clean,4);
  env.DB.exec("UPDATE social_posts SET caption='Correction two'");
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,true);
  assert.equal(env.DB.one("SELECT approved_clean FROM trust_ledger WHERE category='menu'").approved_clean,0);
});
test('failed ledger mutation rolls back event so a valid retry can count',async()=>{
  const env=fixture();env.DB.exec("CREATE TRIGGER reject_credit BEFORE UPDATE ON trust_ledger BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_trust_approvals').n,0);
  env.DB.exec('DROP TRIGGER reject_credit');assert.equal((await noteTrustApproval(env,'sp_1')).counted,true);
});
test('missing schema records no trust without breaking approval',async()=>{
  assert.equal((await noteTrustApproval({DB:{prepare(){throw Error('missing schema');}}},'sp_1')).counted,false);
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

test('reading the ledger is the desk\'s; flipping autonomy is the OWNER\'S alone', () => {
  // The asymmetry is the point. auto_publish=1 is the act of removing the owner from the
  // approval loop, so the role whose drafts are being approved must not be able to perform it.
  const desk = TRUST.match(/requireRole\(request, env, MARKETING_DESK\)/g) || [];
  const owner = TRUST.match(/requireRole\(request, env, \['owner'\]\)/g) || [];
  assert.equal(desk.length, 1, 'exactly the GET admits the marketing desk');
  assert.equal(owner.length, 1, 'exactly the POST — the toggle — is owner-only');
  const post = TRUST.slice(TRUST.indexOf('onRequestPost'));
  assert.match(post, /requireRole\(request, env, \['owner'\]\)/, 'and it is the POST that is owner-only');
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
  assert.match(planner, /SET status='scheduled', auto_audit_required=1, updated_at=\? WHERE id=\? AND status='draft' AND audit_status='pass'/);
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
  assert.match(PAGE, /Owner\.init\('marketing', load, \{ roles: Owner\.MARKETING_DESK \}\)/);
});

for (const [label,sql] of [
 ['brand',"INSERT INTO docs(id,doc_type,title,body,active,created_at,updated_at) VALUES('new-brand','brand','Fixture','New source',1,1,1)"],
 ['rule',"INSERT INTO training_rules(id,text,active,created_at,updated_at) VALUES('new-rule','New source',1,1,1)"],
 ['example',"INSERT INTO training_examples(id,media_key,note,active,created_at,updated_at) VALUES('new-example','training/fixture.jpg','New source',1,1,1)"],
 ['menu',"UPDATE menu_items SET updated_at=updated_at+1 WHERE id=(SELECT id FROM menu_items LIMIT 1)"],
]) test(label+' source revision after visual audit cannot earn clean trust',async()=>{
 const env=fixture();const before=env.DB.one('SELECT original_design_snapshot FROM social_posts WHERE id=?','sp_1').original_design_snapshot;env.DB.exec(sql);
 assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
 assert.equal(env.DB.one('SELECT original_design_snapshot FROM social_posts WHERE id=?','sp_1').original_design_snapshot,before,'design fingerprint remains media/caption only');
});

test('historical v1 visual approval earns no clean trust under current rubric',async()=>{
 const env=fixture();env.DB.sqlite.prepare('UPDATE social_posts SET audit_detail_json=?').run(JSON.stringify({rubric_version:'anejo-visual-1'}));
 assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);
 assert.equal(env.DB.one("SELECT approved_clean FROM trust_ledger WHERE category='menu'").approved_clean,0);
});

test('same-key overwrite or unavailable R2 cannot earn clean trust',async()=>{
 for(const missing of [false,true]){const env=fixture();env.MEDIA.get=async()=>missing?null:{size:4,arrayBuffer:async()=>new Uint8Array([255,216,255,0]).buffer};assert.equal((await noteTrustApproval(env,'sp_1')).counted,false);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_trust_approvals').n,0);}
});
