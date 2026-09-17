import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';
const call = (env, body) => onRequestPost({env, request:new Request('https://anejo.test/api/hub/owner/social',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(body)})});
async function draft(env) { return (await (await call(env,{op:'draft',media_key:'marketing-library/2026-09/real_photo.jpg',caption:'Original'})).json()).id; }
test('schedule atomically approves the visible caption, rejects a stale preview', async()=>{
 const env=ownerEnv(), id=await draft(env);
 let r=await call(env,{op:'schedule',id,caption:'Reviewed caption',expected_caption:'Original',scheduled_at:Date.now()+3600000});
 assert.equal(r.status,200); assert.equal(env.DB.one('SELECT caption FROM social_posts WHERE id=?',id).caption,'Reviewed caption');
 r=await call(env,{op:'schedule',id,caption:'Stale overwrite',expected_caption:'Original',scheduled_at:Date.now()+7200000});
 assert.equal(r.status,409); assert.equal(env.DB.one('SELECT caption FROM social_posts WHERE id=?',id).caption,'Reviewed caption');
});
test('editing scheduled content returns it to draft and cannot edit a publishing post', async()=>{
 const env=ownerEnv(), id=await draft(env);
 await call(env,{op:'schedule',id,scheduled_at:Date.now()+3600000});
 assert.equal((await call(env,{op:'edit',id,caption:'New words',expected_caption:'Original'})).status,200);
 const row=env.DB.one('SELECT status,scheduled_at FROM social_posts WHERE id=?',id);
 assert.equal(row.status,'draft'); assert.equal(row.scheduled_at,null);
 env.DB.sqlite.prepare("UPDATE social_posts SET status='publishing' WHERE id=?").run(id);
 assert.equal((await call(env,{op:'edit',id,caption:'Too late'})).status,409);
 assert.equal((await call(env,{op:'schedule',id,scheduled_at:Date.now()+3600000})).status,409);
});
test('private operational images cannot be staged for social publication',async()=>{
 const env=ownerEnv();
 for (const key of ['kitchen/private.jpg','proof/address.jpg','receipts/receipt.jpg']) {
 assert.equal((await call(env,{op:'draft',media_key:key})).status,400);
 }
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
});
