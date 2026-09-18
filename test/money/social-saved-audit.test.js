import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv, OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost} from '../../functions/api/hub/owner/social.js';
import {auditSavedDraft} from '../../functions/_lib/social_audit.js';
const call=(env,body)=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(body)})});
async function setup(){const env=ownerEnv();env.MEDIA={get:async()=>({size:4,arrayBuffer:async()=>new Uint8Array([255,216,255,217]).buffer})};const r=await call(env,{op:'draft',caption:'Original',media_key:'marketing-library/2026-09/real.jpg'});return {env,id:(await r.json()).id};}
const pass=async()=>({brand_score:97,flags:[],verdict:'pass',rubric_version:VERSION,observations:[],suggestions:[],input_coverage:{menu:{source:'d1'}},score_meaning:'criteria met'});
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
test('missing slide prevents provider spend and cannot preserve a previous passing audit',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 env.MEDIA.get=async()=>null;
 const result=await auditSavedDraft(env,id,'Original',async()=>{throw Error('must not spend without all images');});
 assert.equal(result.audit.verdict,'flag');assert.equal(result.scope,'unavailable');
 assert.equal(env.DB.one('SELECT audit_status FROM social_posts WHERE id=?',id).audit_status,'flag');
});
test('visual scope and snapshot match only the audited revision',async()=>{
 const {env,id}=await setup();let count;
 await auditSavedDraft(env,id,'Original',async(env,input)=>{count=input.images.length;return pass();});assert.equal(count,1);
 const {SOCIAL_AUDIT_SNAPSHOT}=await import('../../functions/_lib/social_audit.js');
 let row=env.DB.one(`SELECT audit_scope,audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT} AS matches FROM social_posts WHERE id=?`,id);
 assert.equal(row.audit_scope,'caption_and_media');assert.equal(row.matches,1);
 env.DB.sqlite.prepare("UPDATE social_post_media SET media_key='studio/later.jpg' WHERE post_id=?").run(id);
 row=env.DB.one(`SELECT audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT} AS matches FROM social_posts WHERE id=?`,id);assert.equal(row.matches,0);
});
test('autonomy requires current clean streak as well as owner toggle',async()=>{
 const {env}=await setup();const {autoPublishCategories}=await import('../../functions/_lib/trust_ledger.js');
 env.DB.sqlite.prepare("UPDATE trust_ledger SET approved_clean=4,auto_publish=1 WHERE category='catering'").run();
 assert.equal((await autoPublishCategories(env)).has('catering'),false);
 env.DB.sqlite.prepare("UPDATE trust_ledger SET approved_clean=5 WHERE category='catering'").run();assert.equal((await autoPublishCategories(env)).has('catering'),true);
});

test('planner cannot seal an owner-corrected image as its original design',async()=>{
 const {readFileSync}=await import('node:fs');const {SOCIAL_AUDIT_SNAPSHOT}=await import('../../functions/_lib/social_audit.js');
 const code=readFileSync(new URL('../../functions/_lib/automations.js',import.meta.url),'utf8');
 const query=code.match(/prepare\(`(UPDATE social_posts SET original_design_snapshot=[\s\S]*?)`\)\.bind\(postId, caption, brief/)[1].replace('${SOCIAL_AUDIT_SNAPSHOT}',SOCIAL_AUDIT_SNAPSHOT);
 const {env,id}=await setup();env.DB.exec("UPDATE social_posts SET media_key=NULL");
 const wrong=await env.DB.prepare(query).bind(id,'Original','','studio/planner-original.jpg').run();assert.equal(wrong.meta.changes,0);
 const correct=await env.DB.prepare(query).bind(id,'Original','','marketing-library/2026-09/real.jpg').run();assert.equal(correct.meta.changes,1);
});

test('source changes during judge reject atomic write; no old evidence is overwritten',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);const before=env.DB.one('SELECT audit_context_snapshot FROM social_posts WHERE id=?',id).audit_context_snapshot;
 const r=await auditSavedDraft(env,id,'Original',async()=>{env.DB.exec("INSERT INTO training_rules(id,text,active,created_at,updated_at) VALUES('new-rule','New direction',1,1,1)");return pass();});
 assert.equal(r.status,409);assert.equal(env.DB.one('SELECT audit_context_snapshot FROM social_posts WHERE id=?',id).audit_context_snapshot,before);
});
test('actual rubric details persist and edits/reordering clear context and details',async()=>{
 const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);let row=env.DB.one('SELECT audit_detail_json,audit_context_snapshot FROM social_posts WHERE id=?',id);assert.equal(JSON.parse(row.audit_detail_json).score_meaning,'criteria met');assert.ok(row.audit_context_snapshot);
 await call(env,{op:'attach',id,media_key:'studio/second.jpg'});await auditSavedDraft(env,id,'Original',pass);const ids=env.DB.sqlite.prepare('SELECT id FROM social_post_media WHERE post_id=? ORDER BY seq').all(id).map(r=>r.id);
 await call(env,{op:'reorder',id,media_ids:ids.reverse()});row=env.DB.one('SELECT audit_detail_json,audit_context_snapshot FROM social_posts WHERE id=?',id);assert.equal(row.audit_detail_json,null);assert.equal(row.audit_context_snapshot,null);
 await auditSavedDraft(env,id,'Original',pass);await call(env,{op:'edit',id,caption:'New caption'});row=env.DB.one('SELECT audit_detail_json,audit_context_snapshot FROM social_posts WHERE id=?',id);assert.equal(row.audit_detail_json,null);assert.equal(row.audit_context_snapshot,null);
});
test('stale automatically scheduled audit is refused before provider use; manual legacy path remains available',async()=>{
 const {publishSocialPost}=await import('../../functions/_lib/social_publish.js');const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 env.DB.exec("UPDATE social_posts SET auto_audit_required=1,status='publishing'; INSERT INTO training_rules(id,text,active,created_at,updated_at) VALUES('changed','New rule',1,1,1)");
 const r=await publishSocialPost(env,new Request('https://anejo.test'),{id});assert.equal(r.ok,false);assert.match(r.error,/stale/);assert.equal(env.DB.one('SELECT status FROM social_posts WHERE id=?',id).status,'failed');
 env.DB.exec('UPDATE social_posts SET auto_audit_required=NULL,audit_detail_json=NULL,audit_context_snapshot=NULL;DELETE FROM social_post_media');
 const manual=await publishSocialPost(env,new Request('https://anejo.test'),{id});assert.match(manual.error,/no photo or video/,'manual legacy approval passes evidence gate and reaches ordinary media validation');
});
test('automatic publication cannot silently reorder its audited carousel',async()=>{
 const {publishSocialPost}=await import('../../functions/_lib/social_publish.js');const {env,id}=await setup();
 env.DB.sqlite.prepare("UPDATE social_post_media SET media_key='studio/series/p1_cover.jpg' WHERE post_id=?").run(id);
 await call(env,{op:'attach',id,media_key:'studio/series/p1_photo.jpg'});await auditSavedDraft(env,id,'Original',pass);
 env.DB.exec("UPDATE social_posts SET auto_audit_required=1,status='publishing'");
 const before=env.DB.sqlite.prepare('SELECT id FROM social_post_media WHERE post_id=? ORDER BY seq').all(id).map(r=>r.id);
 const result=await publishSocialPost(env,new Request('https://anejo.test'),{id});assert.equal(result.ok,false);assert.match(result.error,/slide order/);
 assert.deepEqual(env.DB.sqlite.prepare('SELECT id FROM social_post_media WHERE post_id=? ORDER BY seq').all(id).map(r=>r.id),before);
});

test('current audit gate follows exported rubric version and rejects prior rubric evidence',async()=>{
 const {SOCIAL_AUDIT_CURRENT}=await import('../../functions/_lib/social_audit.js');const {env,id}=await setup();await auditSavedDraft(env,id,'Original',pass);
 assert.equal(env.DB.one(`SELECT ${SOCIAL_AUDIT_CURRENT} AS current FROM social_posts WHERE id=?`,id).current,1);
 env.DB.sqlite.prepare('UPDATE social_posts SET audit_detail_json=? WHERE id=?').run(JSON.stringify({rubric_version:'anejo-visual-1'}),id);
 assert.equal(env.DB.one(`SELECT ${SOCIAL_AUDIT_CURRENT} AS current FROM social_posts WHERE id=?`,id).current,0);
});

test('unavailable rubric diagnostic persists privately without pass scope or clean trust',async()=>{
 const {noteTrustApproval}=await import('../../functions/_lib/trust_ledger.js');
 const {env,id}=await setup();const diagnostic={reason:'criterion_unknown',criterion_id:'branding',status:'unknown',explanation:'Reference cannot establish this visual comparison.',slides:[1]};
 const result=await auditSavedDraft(env,id,'Original',async()=>({brand_score:null,verdict:'flag',flags:[{type:'audit_unavailable',detail:'Required evidence missing.'}],rubric_version:VERSION,audit_diagnostic:diagnostic}));
 assert.equal(result.ok,true);const row=env.DB.one('SELECT audit_status,audit_scope,audit_score,audit_detail_json FROM social_posts WHERE id=?',id);
 assert.equal(row.audit_status,'flag');assert.equal(row.audit_score,null);assert.equal(row.audit_scope,'unavailable');assert.deepEqual(JSON.parse(row.audit_detail_json).audit_diagnostic,diagnostic);
 assert.equal((await noteTrustApproval(env,id)).counted,false);
});
