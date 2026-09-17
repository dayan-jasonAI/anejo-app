import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/admin/social-tick.js';
import { onRequestGet } from '../../functions/api/social/media/[token].js';
function fixture(type, key) {
 const env=ownerEnv();const t=Date.now();
 env.DB.sqlite.prepare('INSERT INTO social_posts (id,platform,caption,status,scheduled_at,media_type,created_at,updated_at,public_token) VALUES (?,?,?,?,?,?,?,?,?)').run('fixture','instagram','Caption','scheduled',t-1000,type,t,t,'legacy-token-fixture');
 env.DB.sqlite.prepare('INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at) VALUES (?,?,?,?,?,?)').run('slide','fixture',0,key,'fixture-public-token-123',t);
 Object.assign(env,{IG_ACCESS_TOKEN:'fixture-token-'+type,IG_USER_ID:'17841400000000000',IG_API_HOST:'facebook',IG_POLL_MS:0});return env;
}
test('scheduled photo Stories and Reels preserve format at the actual provider boundary',async(t)=>{
 for(const type of ['STORIES','REELS']){
 const env=fixture(type,type==='REELS'?'studio/fixture.mp4':'marketing-library/fixture_photo.jpg');const containers=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/media_publish'))return Response.json({id:'published_fixture'});
  if(path.endsWith('/media')){containers.push(new URLSearchParams(init.body));return Response.json({id:'container_fixture'});}
  if(path.endsWith('/container_fixture'))return Response.json({status_code:'FINISHED'});
  return Response.json({permalink:'https://instagram.test/fixture'});
 });
 const r=await onRequestPost({env,request:new Request('https://anejo.test/api/hub/admin/social-tick',{method:'POST',headers:{Cookie:OWNER_COOKIE}})});
 const out=await r.json();assert.equal(out.published.length,1,JSON.stringify(out));
 assert.equal(containers[0].get('media_type'),type);
 assert.ok(containers[0].get(type==='REELS'?'video_url':'image_url').endsWith('/fixture-public-token-123'));
 assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='fixture'").status,'published');
 }
});
test('public token refuses private namespaces and traversal before reading storage',async()=>{
 for(const key of ['kitchen/customer.jpg','proof/door.jpg','receipt/bill.jpg','studio/../kitchen/x.jpg','studio/%2e%2e/x.jpg','studio\\x.jpg','studio//x.jpg']){
 const env=fixture(null,key);let reads=0;env.MEDIA={get:async()=>{reads++;return{body:'private'};}};
 assert.equal((await onRequestGet({env,params:{token:'fixture-public-token-123'}})).status,404,key);assert.equal(reads,0);
 }
});
test('legitimate generated studio and original library JPEG token URLs serve only while staged',async()=>{
 for(const key of ['studio/bowls/vida.jpg','studio/2026-07/series/p1_photo.jpg','marketing-library/2026-09/original_photo.jpg']){
 const env=fixture(null,key);env.MEDIA={get:async requested=>{assert.equal(requested,key);return{body:'original',httpMetadata:{contentType:'image/jpeg'}};}};
 assert.equal((await onRequestGet({env,params:{token:'fixture-public-token-123'}})).status,200);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='published'").run();
 assert.equal((await onRequestGet({env,params:{token:'fixture-public-token-123'}})).status,404);
 }
});
