import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { auditSavedDraft } from '../../functions/_lib/social_audit.js';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';
import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';
const judge = async () => ({ brand_score:100,flags:[],verdict:'pass',rubric_version:VERSION,complete:true,criteria_met:7,criteria_applicable:7 });
function setup(t) {
 const env=ownerEnv();t.after(()=>env.DB.sqlite.close());
 env.MEDIA={get:async()=>({size:4,arrayBuffer:async()=>new Uint8Array([255,216,255,217]).buffer})};
 env.DB.exec("INSERT INTO social_posts(id,caption,media_key,public_token,status,scheduled_at,published_at,ig_media_id,permalink,created_at,updated_at,category,original_caption_hash) VALUES('published','Saved caption',NULL,'private-token','published',100,200,'ig-existing','https://instagram.com/p/existing',1,2,'catering','original'); INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('slide','published',0,'marketing-library/saved.jpg','slide-token',1)");
 return env;
}
const row=env=>env.DB.one("SELECT * FROM social_posts WHERE id='published'");
const withoutAudit=value=>Object.fromEntries(Object.entries(value).filter(([k])=>!k.startsWith('audit_')));
test('published design review changes only private audit fields, never content, schedule or trust',async t=>{
 const env=setup(t),before=row(env),trust=env.DB.sqlite.prepare('SELECT * FROM trust_ledger ORDER BY category').all(),media=env.DB.sqlite.prepare('SELECT * FROM social_post_media').all();
 const result=await auditSavedDraft(env,'published','Saved caption',judge);
 assert.equal(result.ok,true);assert.equal(result.audit_target,'published_saved_source');assert.equal(row(env).audit_score,100);assert.equal(JSON.parse(row(env).audit_detail_json).audit_target,'published_saved_source');
 assert.deepEqual(withoutAudit(row(env)),withoutAudit(before));assert.deepEqual(env.DB.sqlite.prepare('SELECT * FROM trust_ledger ORDER BY category').all(),trust);assert.deepEqual(env.DB.sqlite.prepare('SELECT * FROM social_post_media').all(),media);
 assert.ok(!env.DB.calls.some(c=>c.kind==='run'&&/trust_ledger|trust_counted/.test(c.sql)));
});
for(const mutation of ["UPDATE social_posts SET caption='Changed'", "UPDATE social_post_media SET seq=2", "UPDATE social_posts SET status='draft'", "UPDATE social_posts SET status='scheduled'", "INSERT INTO training_rules(id,text,created_at,updated_at) VALUES('new','Changed guidance',1,1)"])
 test('published review refuses stale evidence after '+mutation,async t=>{
 const env=setup(t);const result=await auditSavedDraft(env,'published','Saved caption',async()=>{env.DB.exec(mutation);return judge();});
 assert.equal(result.status,409);assert.equal(row(env).audit_at,null);
 });
test('scheduled and publishing states remain rejected before judge; stale published caption also rejects',async t=>{
 const env=setup(t);const never=async()=>assert.fail('No judge call allowed');
 assert.equal((await auditSavedDraft(env,'published','Unsaved caption',never)).status,409);
 for(const state of ['scheduled','publishing']){env.DB.sqlite.prepare('UPDATE social_posts SET status=?').run(state);assert.equal((await auditSavedDraft(env,'published','Saved caption',never)).status,409);}
});
test('existing authenticated audit route permits published internal review without provider or trust credit',async t=>{
 const env=setup(t),before=row(env),trust=env.DB.sqlite.prepare('SELECT * FROM trust_ledger ORDER BY category').all();
 const response=await onRequestPost({env,request:new Request('https://test/api/hub/owner/social',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({op:'audit',id:'published',expected_caption:'Saved caption'})})});
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.audit_target,'published_saved_source');assert.equal(body.audit.verdict,'flag');assert.equal(body.scope,'unavailable');assert.equal(JSON.parse(row(env).audit_detail_json).audit_target,'published_saved_source');
 assert.deepEqual(withoutAudit(row(env)),withoutAudit(before));assert.deepEqual(env.DB.sqlite.prepare('SELECT * FROM trust_ledger ORDER BY category').all(),trust);
});
