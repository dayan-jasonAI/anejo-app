import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost} from '../../functions/api/hub/owner/social.js';
const body={op:'draft',request_id:'request_1234567890',caption:'Food',media_key:'marketing-library/food.jpg'};
const call=(env,b=body)=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(b)})});
test('concurrent retries atomically create one scheduled post, media and receipt',async()=>{
 const env=ownerEnv(),b={...body,scheduled_at:Date.now()+3600000};const results=await Promise.all([call(env,b),call(env,b),call(env,b)]);const out=await Promise.all(results.map(r=>r.json()));
 assert.ok(out.every(r=>r.ok));assert.equal(new Set(out.map(r=>r.id)).size,1);
 for(const table of ['social_posts','social_post_media','social_draft_requests'])assert.equal(env.DB.one('SELECT COUNT(*) n FROM '+table).n,1);
 const read=await (await call(env,{op:'draft_receipt',request_id:body.request_id})).json();assert.equal(read.id,out[0].id);
});
test('changed payload conflicts, malformed identity rejected, legacy callers retain prior behavior',async()=>{
 const env=ownerEnv();await call(env);assert.equal((await call(env,{...body,caption:'Changed'})).status,409);
 assert.equal((await call(env,{...body,request_id:'bad'})).status,400);
 const legacy={...body};delete legacy.request_id;assert.equal((await call(env,legacy)).status,200);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,2);
});
test('failed media write rolls receipt and post back, same identity can retry',async()=>{
 const env=ownerEnv();env.DB.exec("CREATE TRIGGER fail_media BEFORE INSERT ON social_post_media BEGIN SELECT RAISE(ABORT,'fail'); END;");
 assert.equal((await call(env)).status,500);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_draft_requests').n,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
 env.DB.exec('DROP TRIGGER fail_media');assert.equal((await call(env)).status,200);
});
test('receipt replays before expired schedule validation and retains original result',async()=>{
 const env=ownerEnv(),at=Date.now()+5000,b={...body,scheduled_at:at};const first=await(await call(env,b)).json();const old=Date.now;
 Date.now=()=>at+120000;try{const r=await(await call(env,b)).json();assert.equal(r.id,first.id);assert.equal(r.replayed,true);}finally{Date.now=old;}
});
test('same identity is isolated by authenticated actor and private readback cannot cross actors',async()=>{
 const env=ownerEnv();const a=await(await call(env)).json();
 const asMarketing=b=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:'anejo_sess=tok-marketing'},body:JSON.stringify(b)})});
 assert.equal((await(await asMarketing({op:'draft_receipt',request_id:body.request_id})).json()).found,false);
 const b=await(await asMarketing(body)).json();assert.equal(b.ok,true);assert.notEqual(a.id,b.id);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_draft_requests').n,2);
});
test('readback distinguishes original acknowledgement from published or deleted current post; replay never recreates',async()=>{
 const env=ownerEnv(),first=await(await call(env)).json();
 env.DB.prepare("UPDATE social_posts SET status='published' WHERE id=?").bind(first.id).run();
 const read=()=>call(env,{op:'draft_receipt',request_id:body.request_id}).then(r=>r.json());
 let r=await read();assert.equal(r.original_status,'draft');assert.equal(r.current_status,'published');assert.equal(r.post_exists,true);assert.equal(r.status,undefined);
 await env.DB.prepare('DELETE FROM social_post_media WHERE post_id=?').bind(first.id).run();await env.DB.prepare('DELETE FROM social_posts WHERE id=?').bind(first.id).run();
 r=await read();assert.equal(r.post_exists,false);assert.equal(r.current_status,null);
 const replay=await(await call(env)).json();assert.equal(replay.id,first.id);assert.equal(replay.replayed,true);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
});
test('closing failed validation tombstones identity without saving, and rejects late retries',async()=>{
 const env=ownerEnv();assert.equal((await call(env,{...body,scheduled_at:1})).status,400);
 const r=await(await call(env,{op:'draft_abandon',request_id:body.request_id})).json();assert.equal(r.abandoned,true);
 assert.equal((await call(env)).status,409);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
});
test('concurrent abandon and save either retains existing post or prevents it; never cancels saved post',async()=>{
 for(const abandonFirst of [true,false]){
  const env=ownerEnv(),abandon=()=>call(env,{op:'draft_abandon',request_id:body.request_id});
  await Promise.all(abandonFirst?[abandon(),call(env)]:[call(env),abandon()]);
  const receipt=env.DB.one('SELECT * FROM social_draft_requests');const n=env.DB.one('SELECT COUNT(*) n FROM social_posts').n;
  assert.equal(n,receipt.result_status==='abandoned'?0:1);
  const again=await(await abandon()).json();assert.equal(again.abandoned,receipt.result_status==='abandoned');assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,n);
 }
});
