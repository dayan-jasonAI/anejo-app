import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv,OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { currentWeek } from '../../functions/_lib/ai_budget.js';
import { onRequestPost } from '../../functions/api/hub/owner/marketing-photo-enhance.js';
const key='marketing-library/2026-09/original_photo.jpg';
const JPEG=new Uint8Array([255,216,255,10,20,255,217]);
function fixture(){const env=ownerEnv();const objects=new Map([[key,{bytes:JPEG,httpMetadata:{contentType:'image/jpeg'},customMetadata:{name:'Real food',folder:'Catering',tags:'["food"]'}}]]);const puts=[];
 env.MEDIA={get:async k=>{const o=objects.get(k);return o?{...o,size:o.bytes.length,body:o.bytes,arrayBuffer:async()=>o.bytes.slice().buffer}:null;},put:async(k,bytes,opts)=>{puts.push(k);objects.set(k,{bytes:new Uint8Array(bytes),...opts});}};
 env.OPENAI_API_KEY='fixture-key';env.IMAGE_PROVIDER_ORDER='openai';return{env,objects,puts};}
const req=(extra={})=>new Request('https://anejo.test/api/hub/owner/marketing-photo-enhance',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify({media_key:key,preset:'natural',...extra})});
test('polish sends actual reference bytes and preserves original with explicit derivative provenance',async(t)=>{
 const {env,objects,puts}=fixture();let sent;
 t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(String(url),'https://api.openai.com/v1/images/edits');sent=init.body;return Response.json({data:[{b64_json:Buffer.from(JPEG).toString('base64')}]});});
 const r=await onRequestPost({env,request:req()});const out=await r.json();assert.equal(r.status,200,JSON.stringify(out));
 assert.deepEqual(new Uint8Array(await sent.get('image').arrayBuffer()),JPEG);assert.match(sent.get('prompt'),/exact actual food/);
 assert.equal(out.review_required,true);assert.equal(out.photo.ai_enhanced,true);assert.equal(out.photo.source_key,key);assert.ok(!puts.includes(key));assert.deepEqual(objects.get(key).bytes,JPEG);
 assert.equal(objects.get(out.photo.media_key).customMetadata.source_key,key);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
});
test('missing or private source, invalid preset and unauthorized role never call provider',async(t)=>{
 const {env}=fixture();t.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call');});
 for(const b of [{media_key:'kitchen/private.jpg'},{media_key:'marketing-library/missing.jpg'},{preset:'invent'}])assert.ok((await onRequestPost({env,request:req(b)})).status>=400);
 env.DB.sqlite.prepare("UPDATE staff SET role='driver' WHERE id='stf_owner'").run();assert.equal((await onRequestPost({env,request:req()})).status,403);assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('no reference-capable provider never falls back to text-only generation',async()=>{
 const {env,puts}=fixture();delete env.OPENAI_API_KEY;env.IMAGE_PROVIDER_ORDER='workers_ai';let called=false;env.AI={run:async()=>{called=true;return JPEG;}};
 assert.equal((await onRequestPost({env,request:req()})).status,503);assert.equal(called,false);assert.equal(puts.length,0);
});
test('existing budget rejects before generation',async(t)=>{
 const {env}=fixture();env.DB.sqlite.prepare('INSERT INTO ai_spend (id,week,day,feature,model,input_tokens,output_tokens,cost_microdollars,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('limit',currentWeek(),'2026-09-17','fixture','fixture',1,1,50000000,Date.now());
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call');});assert.equal((await onRequestPost({env,request:req()})).status,429);assert.equal(globalThis.fetch.mock.callCount(),0);
});

test('AI-enhanced source is refused rather than repeatedly reinvented',async(t)=>{
 const {env,objects}=fixture();objects.get(key).customMetadata.ai_enhanced='true';
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call');});
 assert.equal((await onRequestPost({env,request:req()})).status,409);assert.equal(globalThis.fetch.mock.callCount(),0);
});
