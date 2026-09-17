import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';
const call=(env,extra={})=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify({op:'draft',caption:'A real food photo',media_key:'marketing-library/2026-09/test_photo.jpg',...extra})})});
test('draft and original library photo attachment persist together',async()=>{
 const env=ownerEnv();const r=await call(env);assert.equal(r.status,200);const out=await r.json();
 assert.equal(env.DB.one('SELECT status FROM social_posts WHERE id=?',out.id).status,'draft');
 assert.equal(env.DB.one('SELECT media_key FROM social_post_media WHERE post_id=?',out.id).media_key,'marketing-library/2026-09/test_photo.jpg');
});
test('failed attachment rolls back post so no orphan scheduled draft remains',async()=>{
 const env=ownerEnv();env.DB.exec("CREATE TRIGGER reject_slide BEFORE INSERT ON social_post_media BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.equal((await call(env,{scheduled_at:Date.now()+3600000})).status,500);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
});
test('draft scheduling rejects invalid and expired times before writing',async()=>{
 for(const scheduled_at of ['bad',-1,0,Date.now()-120000]){
 const env=ownerEnv();assert.equal((await call(env,{scheduled_at})).status,400);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
 }
 const env=ownerEnv();const r=await call(env,{scheduled_at:Date.now()+3600000});assert.equal((await r.json()).status,'scheduled');
});
