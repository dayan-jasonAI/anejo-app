import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';
const call = (env, body) => onRequestPost({ env, request: new Request('https://anejo.test/api/hub/owner/social', { method: 'POST', headers: { Cookie: OWNER_COOKIE }, body: JSON.stringify(body) }) });
function fixture() {
  const env = ownerEnv();
  env.DB.exec("INSERT INTO social_posts (id,status,caption,public_token,created_at,updated_at) VALUES ('p','scheduled','caption','posttoken',1,1)");
  for (let i=0;i<3;i++) env.DB.sqlite.prepare('INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at) VALUES (?,?,?,?,?,?)').run(`m${i}`,'p',i,`studio/${i}.jpg`,`token${i}`,1);
  return env;
}
const slides = env => env.DB.rows('SELECT id,seq FROM social_post_media WHERE post_id=? ORDER BY seq,id','p').map(r=>({...r}));
function beforeBatch(env, action) {
  const batch=env.DB.batch.bind(env.DB);
  env.DB.batch=async statements=>{ env.DB.batch=batch; action(); return batch(statements); };
}
test('stale reorder rejects concurrent attachment without clearing newer approval',async()=>{
 const env=fixture();beforeBatch(env,()=>env.DB.exec("INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at) VALUES ('new','p',3,'studio/new.jpg','newtoken',1); UPDATE social_posts SET audit_status='approved' WHERE id='p'"));
 assert.equal((await call(env,{op:'reorder',id:'p',media_ids:['m2','m1','m0']})).status,409);
 assert.deepEqual(slides(env).map(r=>r.id),['m0','m1','m2','new']);
 assert.equal(env.DB.one("SELECT status,audit_status FROM social_posts WHERE id='p'").status,'scheduled');
 assert.equal(env.DB.one("SELECT audit_status FROM social_posts WHERE id='p'").audit_status,'approved');
});
test('stale reorder rejects same-count membership replacement',async()=>{
 const env=fixture();beforeBatch(env,()=>env.DB.exec("DELETE FROM social_post_media WHERE id='m1'; INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at) VALUES ('new','p',1,'studio/new.jpg','newtoken',1)"));
 assert.equal((await call(env,{op:'reorder',id:'p',media_ids:['m2','m1','m0']})).status,409);
 assert.deepEqual(slides(env),[{id:'m0',seq:0},{id:'new',seq:1},{id:'m2',seq:2}]);
});
test('reorder writes complete permutation atomically and invalidates approval',async()=>{
 const env=fixture();assert.equal((await call(env,{op:'reorder',id:'p',media_ids:['m2','m0','m1']})).status,200);
 assert.deepEqual(slides(env),[{id:'m2',seq:0},{id:'m0',seq:1},{id:'m1',seq:2}]);
 assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'draft');
});
test('detach compacts before transaction returns so subsequent attachment has unique order',async()=>{
 const env=fixture();const batch=env.DB.batch.bind(env.DB);
 env.DB.batch=async statements=>{const result=await batch(statements);assert.deepEqual(slides(env),[{id:'m0',seq:0},{id:'m2',seq:1}]);env.DB.batch=batch;return result;};
 assert.equal((await call(env,{op:'detach',id:'p',media_id:'m1'})).status,200);
 assert.equal((await call(env,{op:'attach',id:'p',media_key:'studio/new.jpg'})).status,200);
 assert.deepEqual(slides(env).map(r=>r.seq),[0,1,2]);
});
test('media mutations cannot change a post claimed for publication after preflight',async()=>{
 for(const body of [{op:'detach',media_id:'m1'},{op:'reorder',media_ids:['m2','m1','m0']},{op:'attach',media_key:'studio/new.jpg'}]){
 const env=fixture();beforeBatch(env,()=>env.DB.exec("UPDATE social_posts SET status='publishing' WHERE id='p'"));
 assert.notEqual((await call(env,{id:'p',...body})).status,200);
 assert.deepEqual(slides(env),[{id:'m0',seq:0},{id:'m1',seq:1},{id:'m2',seq:2}]);
 assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'publishing');
 }
});
test('concurrent attachments cannot reuse an observed count',async()=>{
 const env=fixture();beforeBatch(env,()=>env.DB.exec("INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at) VALUES ('new','p',3,'studio/new.jpg','newtoken',1)"));
 assert.equal((await call(env,{op:'attach',id:'p',media_key:'studio/other.jpg'})).status,409);
 assert.deepEqual(slides(env).map(r=>r.seq),[0,1,2,3]);
});
