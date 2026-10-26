import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost} from '../../functions/api/hub/owner/social.js';
import {publishSocialPost} from '../../functions/_lib/social_publish.js';

for(const state of ['FINISHED','ERROR','IN_PROGRESS']) test('single image readiness '+state+' never publishes or mutates the draft',async()=>{
 const env=ownerEnv();Object.assign(env,{IG_ACCESS_TOKEN:'dry-'+state,IG_USER_ID:'123',IG_API_HOST:'facebook',IG_POLL_MS:0});
 env.DB.exec("INSERT INTO social_posts(id,status,caption,public_token,created_at,updated_at) VALUES('p','draft','Saved caption','token',1,1)");
 env.DB.exec("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('m','p',0,'marketing-library/photo.jpg','photo-token',1)");
 const before=env.DB.one("SELECT * FROM social_posts WHERE id='p'");const beforeMedia=env.DB.one("SELECT * FROM social_post_media WHERE id='m'");
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push(String(url));assert.ok(!String(url).includes('media_publish'),'no publication request');return Response.json(init?.method==='POST'?{id:'container'}:{status_code:state,status:'provider detail'});};
 try{const r=await publishSocialPost(env,new Request('https://anejo.test'),before,{publish:false});
 assert.equal(r.ok,state==='FINISHED');assert.equal(r.container_id,'container');if(r.ok){assert.equal(r.dry_run,true);assert.equal(r.status_code,'FINISHED');}else assert.match(r.error,/provider detail|nothing was posted/);
 assert.deepEqual(env.DB.one("SELECT * FROM social_posts WHERE id='p'"),before);assert.deepEqual(env.DB.one("SELECT * FROM social_post_media WHERE id='m'"),beforeMedia);assert.ok(calls.length>=2);
 }finally{globalThis.fetch=original;env.DB.sqlite.close();}
});

test('owner dry-run endpoint returns a processed container without changing saved state',async()=>{
 const env=ownerEnv({IG_ACCESS_TOKEN:'dry-route',IG_USER_ID:'123',IG_API_HOST:'facebook',IG_POLL_MS:0});
 env.DB.exec("INSERT INTO social_posts(id,status,caption,public_token,created_at,updated_at) VALUES('p','draft','Saved','token',1,1)");
 env.DB.exec("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('m','p',0,'marketing-library/photo.jpg','photo-token',1)");
 const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{assert.ok(!String(url).includes('media_publish'));return Response.json(init?.method==='POST'?{id:'container-route'}:{status_code:'FINISHED'});};
 try{const response=await onRequestPost({env,request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify({op:'dry_run',id:'p'})})});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,dry_run:true,container_id:'container-route',slides:0});assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'draft');
 }finally{globalThis.fetch=original;env.DB.sqlite.close();}
});
