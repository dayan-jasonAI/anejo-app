import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv, OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost} from '../../functions/api/hub/owner/social.js';
import {auditSavedDraft} from '../../functions/_lib/social_audit.js';
const call=(env,body)=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(body)})});
async function setup(){const env=ownerEnv();const r=await call(env,{op:'draft',caption:'Original',media_key:'marketing-library/2026-09/real.jpg'});return {env,id:(await r.json()).id};}
const pass=async()=>({brand_score:97,flags:[],verdict:'pass'});
test('saved draft audit persists genuine judge result and declares visual review boundary',async()=>{
 const {env,id}=await setup();const r=await auditSavedDraft(env,id,'Original',pass);
 assert.equal(r.ok,true);assert.equal(r.visual_review_required,true);
 const row=env.DB.one('SELECT audit_score,audit_status,status,scheduled_at FROM social_posts WHERE id=?',id);
 assert.equal(row.audit_score,97);assert.equal(row.audit_status,'pass');assert.equal(row.status,'draft');assert.equal(row.scheduled_at,null);
});
test('route without provider cannot report a pass or fabricate a successful score',async()=>{
 const {env,id}=await setup();const r=await call(env,{op:'audit',id,expected_caption:'Original'});
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.audit.verdict,'flag');
 assert.ok(body.audit.flags.some(f=>f.type==='audit_unavailable'));
});
test('stale visible caption and scheduled posts are rejected before judge spends',async()=>{
 const {env,id}=await setup();const never=async()=>{throw Error('Judge must not run');};
 assert.equal((await auditSavedDraft(env,id,'Unsaved',never)).status,409);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='scheduled' WHERE id=?").run(id);
 assert.equal((await auditSavedDraft(env,id,'Original',never)).status,409);
});
for(const change of ['caption','media','order','publishing'])test('in-flight '+change+' mutation rejects stale audit result',async()=>{
 const {env,id}=await setup();
 const judge=async()=>{
 if(change==='caption')env.DB.sqlite.prepare("UPDATE social_posts SET caption='Changed' WHERE id=?").run(id);
 if(change==='media')env.DB.sqlite.prepare("UPDATE social_post_media SET media_key='studio/replaced.jpg' WHERE post_id=?").run(id);
 if(change==='order')env.DB.sqlite.prepare('UPDATE social_post_media SET seq=8 WHERE post_id=?').run(id);
 if(change==='publishing')env.DB.sqlite.prepare("UPDATE social_posts SET status='publishing' WHERE id=?").run(id);
 return pass();
 };
 assert.equal((await auditSavedDraft(env,id,'Original',judge)).status,409);
 assert.equal(env.DB.one('SELECT audit_at FROM social_posts WHERE id=?',id).audit_at,null);
});
for(const op of ['attach','detach'])test(op+' cancels schedule and clears audit in same transaction',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=9999999999999 WHERE id=?").run(id);
 const media=env.DB.one('SELECT id FROM social_post_media WHERE post_id=?',id);
 const r=await call(env,{op,id,media_key:'studio/another.jpg',media_id:media.id});assert.equal(r.status,200);
 const row=env.DB.one('SELECT status,scheduled_at,audit_at,audit_score FROM social_posts WHERE id=?',id);
 assert.equal(row.status,'draft');assert.equal(row.scheduled_at,null);assert.equal(row.audit_at,null);assert.equal(row.audit_score,null);
});
test('failed attachment transaction preserves schedule, audit and original media',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=9999999999999 WHERE id=?").run(id);
 env.DB.exec("CREATE TRIGGER reject_new_slide BEFORE INSERT ON social_post_media BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 await assert.rejects(call(env,{op:'attach',id,media_key:'studio/another.jpg'}));
 const row=env.DB.one('SELECT status,audit_score FROM social_posts WHERE id=?',id);
 assert.equal(row.status,'scheduled');assert.equal(row.audit_score,97);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_post_media WHERE post_id=?',id).n,1);
});
test('inline schedule preserves unchanged verdict but invalidates changed caption',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 assert.equal((await call(env,{op:'schedule',id,caption:'Original',scheduled_at:Date.now()+3600000})).status,200);
 assert.equal(env.DB.one('SELECT audit_score FROM social_posts WHERE id=?',id).audit_score,97);
 assert.equal((await call(env,{op:'schedule',id,caption:'Changed',expected_caption:'Original',scheduled_at:Date.now()+3600000})).status,200);
 assert.equal(env.DB.one('SELECT audit_score FROM social_posts WHERE id=?',id).audit_score,null);
});
test('reorder rejects incomplete or duplicate lists; valid ordering clears approval',async()=>{
 const {env,id}=await setup();await call(env,{op:'attach',id,media_key:'studio/second.jpg'});
 const media=env.DB.sqlite.prepare('SELECT id FROM social_post_media WHERE post_id=? ORDER BY seq').all(id);
 await auditSavedDraft(env,id,'Original',pass);
 for(const media_ids of [[media[0].id],[media[0].id,media[0].id]])assert.equal((await call(env,{op:'reorder',id,media_ids})).status,409);
 assert.equal(env.DB.one('SELECT audit_score FROM social_posts WHERE id=?',id).audit_score,97);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=9999999999999 WHERE id=?").run(id);
 assert.equal((await call(env,{op:'reorder',id,media_ids:media.map(m=>m.id).reverse()})).status,200);
 assert.equal(env.DB.one('SELECT id FROM social_post_media WHERE post_id=? ORDER BY seq LIMIT 1',id).id,media[1].id);
 const row=env.DB.one('SELECT status,scheduled_at,audit_score FROM social_posts WHERE id=?',id);
 assert.equal(row.status,'draft');assert.equal(row.scheduled_at,null);assert.equal(row.audit_score,null);
});
test('branded replacement works at ten slides, preserves order and invalidates approval',async()=>{
 const {env,id}=await setup();for(let i=1;i<10;i++)await call(env,{op:'attach',id,media_key:'studio/photo'+i+'.jpg'});
 const before=env.DB.sqlite.prepare('SELECT * FROM social_post_media WHERE post_id=? ORDER BY seq').all(id);
 await auditSavedDraft(env,id,'Original',pass);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=9999999999999 WHERE id=?").run(id);
 const r=await call(env,{op:'replace_media',id,media_id:before[4].id,expected_media_key:before[4].media_key,media_key:'studio/branded.jpg'});assert.equal(r.status,200);
 const after=env.DB.sqlite.prepare('SELECT * FROM social_post_media WHERE post_id=? ORDER BY seq').all(id);
 assert.deepEqual(after.map(m=>m.id),before.map(m=>m.id));assert.equal(after[4].media_key,'studio/branded.jpg');assert.notEqual(after[4].public_token,before[4].public_token);
 const row=env.DB.one('SELECT status,scheduled_at,audit_score FROM social_posts WHERE id=?',id);assert.equal(row.status,'draft');assert.equal(row.scheduled_at,null);assert.equal(row.audit_score,null);
 assert.equal((await call(env,{op:'replace_media',id,media_id:before[4].id,expected_media_key:before[4].media_key,media_key:'studio/stale.jpg'})).status,409);
});
test('replacement rejects publishing, foreign slides and private media keys',async()=>{
 const {env,id}=await setup();const m=env.DB.one('SELECT * FROM social_post_media WHERE post_id=?',id);
 for(const media_key of ['kitchen/private.jpg','studio/../secret.jpg','studio/video.mp4'])assert.equal((await call(env,{op:'replace_media',id,media_id:m.id,expected_media_key:m.media_key,media_key})).status,400);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='publishing' WHERE id=?").run(id);
 assert.equal((await call(env,{op:'replace_media',id,media_id:m.id,expected_media_key:m.media_key,media_key:'studio/new.jpg'})).status,409);
 assert.equal(env.DB.one('SELECT media_key FROM social_post_media WHERE id=?',m.id).media_key,m.media_key);
});
