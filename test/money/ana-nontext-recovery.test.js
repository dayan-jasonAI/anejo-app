import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost as tick} from '../../functions/api/hub/admin/social-inbox-tick.js';
import {onRequestGet as inbox} from '../../functions/api/hub/owner/social-inbox.js';
import {sendAnaDraft} from '../../functions/_lib/instagram_reply_attempt.js';
import {loadAnaHeartbeat} from '../../functions/_lib/ana_heartbeat.js';

let sequence=0;
function setup(body=''){
 const at=Date.now()-100;
 const env=ownerEnv({CRON_KEY:'fixture',ANTHROPIC_API_KEY:'fixture',IG_ACCESS_TOKEN:'nontext-fixture-'+(++sequence),IG_API_HOST:'instagram'});
 env.DB.sqlite.prepare("INSERT INTO threads(id,audience,external_id,last_inbound_at,status,created_at,updated_at) VALUES('thread','instagram','visitor',?,'open',?,?)").run(at,at,at);
 env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) VALUES('inbound','thread','inbound','instagram','visitor','customer',?,?)").run(body,at);
 env.DB.sqlite.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('social.auto_reply','both',?)").run(at);
 return env;
}
function network(t,{modelError=false}={}){
 const counts={model:0,sends:0};
 t.mock.method(globalThis,'fetch',async(url,init={})=>{
  if(String(url).startsWith('https://api.anthropic.com/')){
   counts.model++;
   return modelError?new Response(JSON.stringify({error:{message:'fixture unavailable'}}),{status:503}):new Response(JSON.stringify({content:[{text:'Thanks! Please visit our menu for available dates.'}]}),{status:200});
  }
  if(String(url).startsWith('https://graph.instagram.com/')&&!init.method)return new Response(JSON.stringify({user_id:'self',username:'anejo.catering.co'}));
  counts.sends++;throw Error('No outbound provider request is permitted in this fixture');
 });return counts;
}
const check=env=>tick({env,request:new Request('https://anejo.test/api/hub/admin/social-inbox-tick',{method:'POST',headers:{'x-cron-key':'fixture'}})}).then(r=>r.json());

test('non-text DM becomes one visible unsent owner handoff, without model calls or delivery claims',async t=>{
 for(const body of ['',null,' \n\t ']){
  const env=setup(body),calls=network(t);
  const first=await check(env);assert.equal(first.escalated,1);assert.equal(first.sent,0);
  await check(env);
  const notes=env.DB.sqlite.prepare("SELECT * FROM messages WHERE sender_role='ana_escalation'").all();assert.equal(notes.length,1);
  assert.equal(notes[0].reply_to_message_id,'inbound');assert.equal(notes[0].sent_at,null);assert.equal(notes[0].ai_drafted,0);
  assert.match(notes[0].body,/No reply was drafted or sent/);
  assert.equal(env.DB.one("SELECT body FROM messages WHERE id='inbound'").body,body);
  assert.deepEqual(calls,{model:0,sends:0});assert.deepEqual((await loadAnaHeartbeat(env)).errors,[]);
  const view=await(await inbox({env,request:new Request('https://anejo.test/api/hub/owner/social-inbox',{headers:{cookie:OWNER_COOKIE}})})).json();
  assert.equal(view.items[0].escalations.length,1);assert.equal(view.pending,0);
  const denied=await sendAnaDraft(env,{messageId:notes[0].id,threadId:'thread',expectedBody:notes[0].body,initiatedBy:'ana_auto'},async()=>{throw Error('handoff must never send');});
  assert.equal(denied.sent,false);assert.equal(env.DB.one('SELECT COUNT(*) AS n FROM instagram_reply_attempts').n,0);
  t.mock.restoreAll();
 }
});

test('overlapping ticks cannot create duplicate handoffs for one empty inbound',async t=>{
 const env=setup(),calls=network(t);
 const results=await Promise.all([check(env),check(env)]);
 assert.equal(results.reduce((n,r)=>n+r.escalated,0),1);
 assert.equal(env.DB.one("SELECT COUNT(*) AS n FROM messages WHERE sender_role='ana_escalation'").n,1);
 assert.deepEqual(calls,{model:0,sends:0});
});

test('a newer text DM arriving before the handoff claim is not hidden by a stale handoff',async t=>{
 const env=setup(),calls=network(t),prepare=env.DB.prepare.bind(env.DB);let injected=false;
 const wrap=(sql,args=[])=>({bind:(...a)=>wrap(sql,a),first:async()=>{
  const row=await prepare(sql).bind(...args).first();
  if(!injected&&sql.startsWith('SELECT * FROM messages WHERE thread_id=')){
   injected=true;env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) VALUES('newer','thread','inbound','instagram','visitor','customer','What is the menu?',?)").run(Date.now());
  }return row;
 },all:()=>prepare(sql).bind(...args).all(),run:()=>prepare(sql).bind(...args).run()});env.DB.prepare=wrap;
 const result=await check(env);assert.equal(result.escalated,0);assert.equal(result.skipped,1);
 assert.equal(env.DB.one("SELECT COUNT(*) AS n FROM messages WHERE sender_role='ana_escalation'").n,0);assert.deepEqual(calls,{model:0,sends:0});
});

test('new text after an attachment remains eligible for drafting',async t=>{
 const env=setup(),calls=network(t);await check(env);
 env.DB.sqlite.prepare("UPDATE app_settings SET value='off' WHERE key='social.auto_reply'").run();
 const at=Date.now();env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) VALUES('text','thread','inbound','instagram','visitor','customer','What is the menu?',?)").run(at);
 env.DB.sqlite.prepare("UPDATE threads SET last_inbound_at=? WHERE id='thread'").run(at);
 const result=await check(env);assert.equal(result.drafted,1);assert.equal(calls.model,1);assert.equal(calls.sends,0);
 assert.equal(env.DB.one("SELECT reply_to_message_id FROM messages WHERE sender_role='ana_draft'").reply_to_message_id,'text');
});

test('real model failures for nonempty text still degrade the heartbeat and remain retryable',async t=>{
 const env=setup('What is the menu?'),calls=network(t,{modelError:true});await check(env);
 assert.equal(calls.model,1);assert.equal(calls.sends,0);assert.ok((await loadAnaHeartbeat(env)).errors.includes('draft_failed'));
 assert.equal(env.DB.one("SELECT COUNT(*) AS n FROM messages WHERE sender_role='ana_escalation'").n,0);
});
