import {test} from 'node:test';import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/owner/social.js';
import {onRequestPost as tick} from '../../functions/api/hub/admin/social-tick.js';
import {onRequestGet as publicMedia} from '../../functions/api/social/media/[token].js';
const call=(env,body)=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(body)})});
function setup(status='scheduled'){
 const env=ownerEnv();env.DB.sqlite.prepare('INSERT INTO social_posts(id,status,caption,media_key,public_token,scheduled_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('p',status,'Original words','studio/original.jpg','original-secret-token',Date.now()-60000,1,1);
 env.DB.exec("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('m','p',0,'studio/original.jpg','original-slide-token',1)");return env;
}
test('removal preserves draft/media, cancels schedule and restoration stays unscheduled',async()=>{
 const env=setup();const before=env.DB.one("SELECT * FROM social_post_media WHERE id='m'");
 assert.equal((await call(env,{op:'archive',id:'p'})).status,200);const row=env.DB.one("SELECT * FROM social_posts WHERE id='p'");assert.equal(row.status,'archived');assert.equal(row.scheduled_at,null);assert.equal(row.caption,'Original words');assert.deepEqual(env.DB.one("SELECT * FROM social_post_media WHERE id='m'"),before);
 const request=new Request('https://anejo.test/api/hub/owner/social',{headers:{Cookie:OWNER_COOKIE}});const active=await (await onRequestGet({env,request})).json();assert.equal(active.posts.length,0);
 const archived=await (await onRequestGet({env,request:new Request(request.url+'?archived=1',{headers:{Cookie:OWNER_COOKIE}})})).json();assert.equal(archived.archived_view,true);assert.equal(archived.posts[0].media[0].id,'m');
 assert.equal((await call(env,{op:'restore',id:'p'})).status,200);const restored=env.DB.one("SELECT status,scheduled_at,caption FROM social_posts WHERE id='p'");assert.equal(restored.status,'draft');assert.equal(restored.scheduled_at,null);assert.equal(restored.caption,'Original words');
});
test('legacy delete is recoverable and live/publishing records are protected',async()=>{
 const env=setup('draft');assert.equal((await call(env,{op:'delete',id:'p'})).status,200);assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'archived');
 for(const status of ['published','publishing']){env.DB.sqlite.prepare("UPDATE social_posts SET status=? WHERE id='p'").run(status);assert.equal((await call(env,{op:'archive',id:'p'})).status,409);assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,status);}
});
test('removed rows cannot be republished, scheduled, edited, tested or exposed through public media',async()=>{
 const env=setup();await call(env,{op:'archive',id:'p'});env.MEDIA={get:async()=>{throw Error('Archived media must not be fetched');}};
 for(const op of ['edit','attach','audit','schedule','publish','dry_run']){const r=await call(env,{op,id:'p',caption:'Changed',media_key:'studio/new.jpg',scheduled_at:Date.now()+60000});assert.ok([400,409].includes(r.status),op);}
 const publicResponse=await publicMedia({env,params:{token:'original-slide-token'}});assert.equal(publicResponse.status,404);assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'archived');
});
test('scheduler ignores removed and restored drafts without provider calls',async()=>{
 const env=setup();await call(env,{op:'archive',id:'p'});env.IG_ACCESS_TOKEN='fake-for-test';env.IG_USER_ID='test';const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;throw Error('No provider operation allowed');};
 try{for(const restored of [false,true]){if(restored)await call(env,{op:'restore',id:'p'});const response=await tick({env,request:new Request('https://anejo.test/api/hub/admin/social-tick',{method:'POST',headers:{Cookie:OWNER_COOKIE}})});assert.equal(response.status,200);assert.deepEqual((await response.json()).published,[]);}assert.equal(sends,0);}finally{globalThis.fetch=original;}
});
