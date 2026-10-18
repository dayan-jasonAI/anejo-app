import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequestGet,onRequestPost } from '../../functions/api/catering-callback.js';
import { onRequestGet as ownerGet,onRequestPost as ownerPost } from '../../functions/api/hub/owner/callbacks.js';
import { easternCallbackTimestamp,validateCallback,requestCallback } from '../../functions/_lib/catering_callbacks.js';
const token='1'.repeat(32), key='b928415c-b439-48f4-92b4-6c11c381ea4a';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE catering_quotes(id TEXT PRIMARY KEY,access_token TEXT,customer_name TEXT,customer_email TEXT,customer_phone TEXT,event_date TEXT,deposit_status TEXT)');
 sql.exec(readFileSync(new URL('../../migrations/0151_catering_callbacks.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO catering_quotes VALUES(?,?,?,?,?,?,?)').run('q1',token,'Guest','guest@example.test','5615550101','2027-02-10','unpaid');
 sql.prepare('INSERT INTO catering_quotes VALUES(?,?,?,?,?,?,?)').run('q2','2'.repeat(32),'Other','other@example.test','5615550102','2027-02-11','unpaid');
 function prepare(query,args=[]){return {bind:(...values)=>prepare(query,values),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:sql.prepare(query).run(...args).changes}}),_run:()=>sql.prepare(query).run(...args)};}
 const DB={prepare,batch:async statements=>{sql.exec('BEGIN');try{for(const s of statements)s._run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,env:{DB}};
}
const body=()=>({token,request_key:key,requested_local:'2027-01-20T10:30',timezone:'America/New_York'});
const post=(env,b)=>onRequestPost({env,request:new Request('https://anejocateringco.com/api/catering-callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})});
const quote=env=>env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind('q1').first();
test('Eastern local times reject DST gaps, repeated hours and invalid dates',()=>{
 assert.equal(easternCallbackTimestamp('2027-03-14T02:30'),null);
 assert.equal(easternCallbackTimestamp('2026-11-01T01:30'),null);
 assert.equal(easternCallbackTimestamp('2027-02-30T12:00'),null);
 assert.equal(easternCallbackTimestamp('2027-01-20T10:30'),Date.parse('2027-01-20T15:30Z'));
 assert.equal(easternCallbackTimestamp('2027-07-20T10:30'),Date.parse('2027-07-20T14:30Z'));
});
test('stored preferred time and disabled outbox are atomic, idempotent and send nothing',async()=>{
 const {env,sql}=fixture(),q=await quote(env),now=Date.parse('2027-01-01T12:00Z');
 const real=globalThis.fetch,calls=[];globalThis.fetch=async(...args)=>{calls.push(args);throw Error('No provider calls permitted');};
 try{
  const first=await requestCallback(env,q,body(),{now});assert.equal(first.ok,true);assert.equal(first.request.status,'requested');assert.equal(first.capabilities.booking_available,false);
  const replay=await requestCallback(env,q,{...body(),phone:'5615559999',requested_local:'2027-01-21T10:30'},{now:Date.parse('2027-02-01T12:00Z')});
  assert.equal(replay.request.id,first.request.id);assert.equal(replay.request.phone,'+15615550101');assert.equal(replay.request.requested_start_at,Date.parse('2027-01-20T15:30Z'));
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM catering_callback_requests').get().n,1);
  const outbox=sql.prepare('SELECT * FROM catering_callback_outbox').all();assert.equal(outbox.length,3);assert.ok(outbox.every(x=>x.status==='queued_disabled'&&!x.provider_id));assert.equal(calls.length,0);
 }finally{globalThis.fetch=real;}
});
test('invalid payloads and void quotes cannot create callback rows',async()=>{
 const {env,sql}=fixture(),q=await quote(env),now=Date.parse('2027-01-01T12:00Z');
 for(const change of [{request_key:'bad'},{phone:'123'},{requested_local:'2026-01-01T10:00'},{timezone:'UTC'},{requested_local:'2027-03-14T02:30'}])assert.ok(validateCallback({...body(),...change},q,now).error);
 assert.ok((await requestCallback(env,{...q,deposit_status:'void'},body(),{now})).error);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM catering_callback_requests').get().n,0);
});
test('public read is quote-scoped and wrong tokens cannot write or enumerate requests',async()=>{
 const {env}=fixture();await requestCallback(env,await quote(env),body(),{now:Date.parse('2027-01-01T12:00Z')});
 const get=async t=>onRequestGet({env,request:new Request('https://anejocateringco.com/api/catering-callback?token='+t)});
 assert.equal((await get('bad')).status,404);assert.equal((await post(env,{...body(),token:'3'.repeat(32)})).status,404);
 const own=await get(token);assert.equal(own.headers.get('Cache-Control'),'no-store');assert.equal((await own.json()).requests.length,1);
 assert.equal((await (await get('2'.repeat(32))).json()).requests.length,0);
});
test('owner callback API refuses unauthenticated access and never marks arbitrary requests booked',async()=>{
 const {env}=fixture(),request=new Request('https://anejocateringco.com/api/hub/owner/callbacks');
 assert.equal((await ownerGet({env,request})).status,401);
 assert.equal((await ownerPost({env,request:new Request(request.url,{method:'POST',body:'{}'})})).status,401);
 const schema=readFileSync(new URL('../../migrations/0151_catering_callbacks.sql',import.meta.url),'utf8');
 assert.ok(!schema.includes("'confirmed'"));
});
test('outbox failure rolls back the callback row; customer is never shown a false saved state',async()=>{
 const {env,sql}=fixture();sql.exec('DROP TABLE catering_callback_outbox');
 await assert.rejects(requestCallback(env,await quote(env),body(),{now:Date.parse('2027-01-01T12:00Z')}));
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM catering_callback_requests').get().n,0);
});

test('owner can review and cancel requests; client role cannot see calendar; confirmed cannot be forged',async()=>{
 const {env,sql}=fixture();
 sql.exec("CREATE TABLE staff(id TEXT,email TEXT,role TEXT,team TEXT,is_lead INTEGER,active INTEGER);INSERT INTO staff VALUES('owner','owner@example.test','owner',NULL,0,1)");
 env.SESSIONS={get:async()=>JSON.stringify({type:'staff',uid:'owner',role:'owner',email:'owner@example.test'}),put:async()=>{}};
 const req=(method='GET',data)=>new Request('https://anejocateringco.com/api/hub/owner/callbacks',{method,headers:{Cookie:'anejo_sess=fixture'},body:data&&JSON.stringify(data)});
 const item=await requestCallback(env,await quote(env),body(),{now:Date.parse('2027-01-01T12:00Z')});
 const list=await ownerGet({env,request:req()});assert.equal(list.status,200);assert.equal((await list.json()).requests.length,1);
 const update=data=>ownerPost({env,request:req('POST',data)});
 assert.equal((await update({op:'update',id:item.request.id,status:'confirmed'})).status,400);
 assert.equal((await update({op:'update',id:item.request.id,status:'canceled',note:'Client called directly'})).status,200);
 assert.equal(sql.prepare('SELECT status FROM catering_callback_requests').get().status,'canceled');
 assert.equal((await update({op:'settings',duration_minutes:15,availability_note:'Owner reviewed'})).status,200);
 assert.equal(sql.prepare('SELECT duration_minutes FROM catering_callback_settings').get().duration_minutes,15);
 assert.equal((await update({op:'settings',duration_minutes:-1})).status,400);
 env.SESSIONS.get=async()=>JSON.stringify({type:'client',email:'guest@example.test'});
 assert.equal((await ownerGet({env,request:req()})).status,403);
});
