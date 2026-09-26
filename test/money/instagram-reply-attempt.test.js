import {test} from 'node:test';import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {sendAnaDraft,reconcileInstagramReplyAttempt,sendHumanInstagramReply} from '../../functions/_lib/instagram_reply_attempt.js';
import {onRequestPost as inboxPost} from '../../functions/api/hub/owner/social-inbox.js';
function setup(kind='dm'){const env=ownerEnv(),t=Date.now();env.DB.sqlite.prepare("INSERT INTO threads(id,audience,external_id,last_inbound_at,status,created_at,updated_at) VALUES ('t','instagram','customer',?,'open',?,?)").run(t,t,t);env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES ('in','t','inbound','instagram','customer','customer','Question',0,?)").run(t);env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at,ref_id,reply_to_message_id) VALUES ('out','t','outbound','instagram','ana','ana_draft','Exact reply',1,?,?,'in')").run(t+1,kind==='comment'?'comment1':null);return env;}
const args={messageId:'out',threadId:'t',expectedBody:'Exact reply',initiatedBy:'stf_owner'};
const manual=(env,op,extra={})=>inboxPost({env,request:new Request('https://anejo.test/api/hub/owner/social-inbox',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({op,message_id:'out',thread_id:'t',expected_body:'Exact reply',...extra})})});
test('manual/automatic overlap claims exact draft once and replay reports historical provider receipt',async()=>{const env=setup();let calls=0,release;const gate=new Promise(r=>{release=r;});const provider=async input=>{calls++;assert.equal(input.text,'Exact reply');assert.equal(input.recipientId,'customer');await gate;return {ok:true,body:{message_id:'provider1'}};};const first=sendAnaDraft(env,args,provider);while(!calls)await new Promise(r=>setTimeout(r,1));const overlap=await sendAnaDraft(env,{...args,initiatedBy:'ana_auto'},provider);assert.equal(overlap.state,'claimed');assert.equal(overlap.sent,false);assert.equal((await manual(env,'edit',{body:'Changed'})).status,409);assert.equal((await manual(env,'dismiss')).status,409);release();const sent=await first;assert.equal(sent.sent,true);assert.equal(sent.replayed,false);const retry=await sendAnaDraft(env,args,provider);assert.equal(calls,1);assert.equal(retry.replayed,true);assert.equal(retry.provider_message_id,'provider1');assert.equal(retry.sent_at,sent.sent_at);assert.equal(env.DB.one("SELECT body FROM instagram_reply_attempts").body,'Exact reply');});
test('different drafts for same inbound trigger cannot send twice, including comments',async()=>{for(const kind of ['dm','comment']){const env=setup(kind);env.DB.exec("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at,ref_id,reply_to_message_id) SELECT 'duplicate',thread_id,direction,channel,sender_id,sender_role,'Other draft',ai_drafted,created_at,ref_id,reply_to_message_id FROM messages WHERE id='out'");let calls=0;const provider=async()=>{calls++;return {ok:true,body:{id:'provider'}};};const results=await Promise.all([sendAnaDraft(env,args,provider),sendAnaDraft(env,{...args,messageId:'duplicate',expectedBody:'Other draft'},provider)]);assert.equal(calls,1);assert.equal(env.DB.one('SELECT COUNT(*) n FROM instagram_reply_attempts').n,1);assert.ok(results.some(r=>r.replayed));}});
test('persisted provider acceptance recovers local finalization without resending',async()=>{const env=setup();let calls=0;const batch=env.DB.batch;env.DB.batch=async()=>{throw Error('DB failure');};const provider=async()=>{calls++;return {ok:true,body:{message_id:'delivered-id'}};};const result=await sendAnaDraft(env,args,provider);assert.equal(result.state,'unknown');assert.equal(result.sent,false);env.DB.batch=batch;const retry=await sendAnaDraft(env,args,provider);assert.equal(calls,1);assert.equal(retry.state,'sent');assert.equal(retry.replayed,true);assert.equal(retry.provider_message_id,'delivered-id');assert.equal(env.DB.one("SELECT sent_at FROM messages WHERE id='out'").sent_at,retry.sent_at);});
test('ambiguous transport or success without provider ID cannot claim sent or retry',async()=>{for(const response of [{ok:false,delivery_uncertain:true,error:'SECRET'},{ok:true,body:{}}]){const env=setup();let calls=0;const provider=async()=>{calls++;return response;};assert.equal((await sendAnaDraft(env,args,provider)).state,'unknown');assert.equal((await sendAnaDraft(env,args,provider)).state,'unknown');assert.equal(calls,1);assert.ok(!JSON.stringify(env.DB.one('SELECT * FROM instagram_reply_attempts')).includes('SECRET'));}});
test('legacy DM ambiguous trigger or stale recipient fails closed before provider',async()=>{for(const mode of ['ambiguous','recipient','missing']){const env=setup();env.DB.exec("UPDATE messages SET reply_to_message_id=NULL WHERE id='out'");if(mode==='ambiguous')env.DB.exec("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) SELECT 'tie',thread_id,direction,channel,sender_id,sender_role,body,created_at FROM messages WHERE id='in'");if(mode==='recipient')env.DB.exec("UPDATE threads SET external_id='changed'");if(mode==='missing')env.DB.exec("DELETE FROM messages WHERE id='in'");let calls=0;const result=await sendAnaDraft(env,args,async()=>{calls++;});assert.equal(result.error,'inbound_trigger_unavailable');assert.equal(calls,0);}});
test('manual handler send uses mocked transport and readback exposes immutable outcome without duplicate send',async()=>{const env=setup('comment');env.IG_ACCESS_TOKEN='test';env.IG_USER_ID='self';env.IG_API_HOST='instagram';const original=globalThis.fetch;let sends=0;globalThis.fetch=async(url,init)=>{assert.equal(init.method,'POST');sends++;return {ok:true,status:200,text:async()=>JSON.stringify({id:'provider-comment'})};};try{const first=await manual(env,'send');const a=await first.json();assert.equal(a.sent,true,JSON.stringify(a));assert.equal(a.replayed,false);const b=await (await manual(env,'send')).json();assert.equal(b.replayed,true);assert.equal(b.provider_message_id,'provider-comment');assert.equal(b.sent_at,a.sent_at);assert.equal(sends,1);const {onRequestGet}=await import('../../functions/api/hub/owner/social-inbox.js');const response=await onRequestGet({env,request:new Request('https://anejo.test/api/hub/owner/social-inbox',{headers:{cookie:OWNER_COOKIE}})});const history=await response.json();assert.equal(history.reply_attempt_history,'available');assert.equal(history.items[0].reply_attempts[0].provider_message_id,'provider-comment');assert.equal(Object.hasOwn(history.items[0].reply_attempts[0],'body'),false);}finally{globalThis.fetch=original;}});
test('legacy valid single inbound can claim, while closed window or edited body cannot',async()=>{const env=setup();env.DB.exec("UPDATE messages SET reply_to_message_id=NULL WHERE id='out'");let calls=0;const provider=async()=>{calls++;return {ok:true,body:{message_id:'legacy'}};};assert.equal((await sendAnaDraft(env,{...args,expectedBody:'Stale text'},provider)).error,'draft_changed');assert.equal((await sendAnaDraft(env,args,provider)).sent,true);assert.equal(calls,1);const closed=setup();closed.DB.exec('UPDATE threads SET last_inbound_at=1');assert.equal((await sendAnaDraft(closed,args,provider)).error,'window_closed');assert.equal(calls,1);});
test('actual transport timeout records unknown and suppresses later manual resends',async()=>{const env=setup('comment');env.IG_ACCESS_TOKEN='test';env.IG_USER_ID='self';env.IG_API_HOST='instagram';const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('SECRET provider failure');};try{const first=await (await manual(env,'send')).json();assert.equal(first.state,'unknown');const second=await (await manual(env,'send')).json();assert.equal(second.state,'unknown');assert.equal(calls,1);assert.ok(!JSON.stringify(second).includes('SECRET'));}finally{globalThis.fetch=original;}});
test('automatic helper labels actual sent row and unknown attempt history stays explicit',async()=>{const env=setup();const r=await sendAnaDraft(env,{...args,initiatedBy:'ana_auto'},async()=>({ok:true,body:{id:'auto-provider'}}));assert.equal(r.sent,true);assert.equal(env.DB.one("SELECT sender_role FROM messages WHERE id='out'").sender_role,'ana_auto');const {onRequestGet}=await import('../../functions/api/hub/owner/social-inbox.js');env.DB.exec('DROP TABLE instagram_reply_attempts');const history=await (await onRequestGet({env,request:new Request('https://anejo.test/api/hub/owner/social-inbox',{headers:{cookie:OWNER_COOKIE}})})).json();assert.equal(history.reply_attempt_history,'unavailable');assert.equal(history.items[0].reply_attempts,null);});
test('actual automatic comment tick uses durable helper with mocked transport and preserves auto-off',async()=>{const {onRequestPost:tick}=await import('../../functions/api/hub/admin/social-inbox-tick.js');for(const enabled of [false,true]){const env=ownerEnv({ANTHROPIC_API_KEY:'test',IG_ACCESS_TOKEN:'test',IG_USER_ID:'self',IG_API_HOST:'instagram',CRON_KEY:'test-cron'});env.DB.sqlite.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES ('social.auto_reply',?,1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(enabled?'comment':'off');env.DB.exec("INSERT INTO social_events(id,kind,from_id,from_username,media_id,text,created_at) VALUES ('event1','comment','customer','customer_name','media1','🔥',1)");const old=globalThis.fetch;let sends=0;globalThis.fetch=async(url,init)=>{if(init?.method==='POST'){assert.match(String(url),/event1\/replies$/);sends++;return {ok:true,status:200,text:async()=>JSON.stringify({id:'reply-event1'})};}return {ok:true,status:200,text:async()=>JSON.stringify({id:'self',username:'anejo'})};};try{const request=()=>new Request('https://anejo.test/api/hub/admin/social-inbox-tick',{method:'POST',headers:{'x-cron-key':'test-cron'}});const first=await (await tick({env,request:request()})).json();assert.equal(first.sent,enabled?1:0,JSON.stringify(first));await tick({env,request:request()});assert.equal(sends,enabled?1:0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM instagram_reply_attempts').n,enabled?1:0);if(enabled)assert.equal(env.DB.one('SELECT trigger_id FROM instagram_reply_attempts').trigger_id,'event1');}finally{globalThis.fetch=old;}}});

test('generic human handler overlaps Ana safely, binds retries and permits explicit confirmed followup',async()=>{
 const {onRequestPost:post,onRequestGet:get}=await import('../../functions/api/hub/comms/messages.js');const env=setup();env.IG_ACCESS_TOKEN='test';env.IG_USER_ID='self';env.IG_API_HOST='instagram';
 const request=(request_id,extra={})=>new Request('https://anejo.test/api/hub/comms/messages',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({thread_id:'t',body:'Human reply',request_id,expected_trigger_id:'in',...extra})});
 const uuid='11111111-1111-4111-8111-111111111111';let release,calls=0;const gate=new Promise(r=>release=r);const ana=sendAnaDraft(env,args,async()=>{calls++;await gate;return {ok:true,body:{id:'ana-provider'}};});while(!calls)await new Promise(r=>setTimeout(r,1));
 const blocked=await(await post({env,request:request(uuid)})).json();assert.equal(blocked.ok,false);assert.equal(calls,1);assert.equal(env.DB.one("SELECT dismissed_at FROM messages WHERE id='out'").dismissed_at,null);release();const sent=await ana;
 const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify({message_id:'human-provider'})};};try{
 const follow=await(await post({env,request:request(uuid,{after_attempt_id:sent.attempt_id})})).json();assert.equal(follow.sent,true,JSON.stringify(follow));assert.equal(calls,2);assert.equal(follow.delivered,undefined);
 assert.equal((await(await post({env,request:request(uuid,{after_attempt_id:sent.attempt_id})})).json()).replayed,true);
 assert.equal((await(await post({env,request:request(uuid)})).json()).ok,false);
 const duplicate=await(await post({env,request:request('22222222-2222-4222-8222-222222222222',{after_attempt_id:sent.attempt_id})})).json();assert.equal(duplicate.error,'reply_already_recorded');assert.equal(calls,2);
 const history=await(await get({env,request:new Request('https://anejo.test/api/hub/comms/messages?thread_id=t',{headers:{cookie:OWNER_COOKIE}})})).json();assert.equal(history.reply_attempt_status,'ok');assert.equal(history.reply_attempt_history.length,2);assert.equal(history.reply_attempt_unresolved,false);
 }finally{globalThis.fetch=old;}
});
test('manual stale rendered body refuses send and failed draft reads are explicit',async()=>{const env=setup();const stale=await(await manual(env,'send',{expected_body:'Old preview'})).json();assert.equal(stale.error,'draft_changed');assert.equal(env.DB.one('SELECT COUNT(*) n FROM instagram_reply_attempts').n,0);const prepare=env.DB.prepare.bind(env.DB);env.DB.prepare=sql=>sql.includes("m.sender_role='ana_draft'")||sql.includes("m.sender_role='ana_escalation'")?{all:async()=>({success:false,results:[]})}:prepare(sql);const {onRequestGet}=await import('../../functions/api/hub/owner/social-inbox.js');const result=await(await onRequestGet({env,request:new Request('https://anejo.test/api/hub/owner/social-inbox',{headers:{cookie:OWNER_COOKIE}})})).json();assert.equal(result.drafts_read_status,'unavailable');assert.equal(result.escalations_read_status,'unavailable');assert.equal(result.pending,null);});
test('new inbound opens a new human reply slot after sent or failed, but unknown stays blocked',async()=>{
 const {onRequestPost:post,onRequestGet:get}=await import('../../functions/api/hub/comms/messages.js');
 for(const state of ['sent','failed','unknown']){
  const env=setup();await sendAnaDraft(env,args,async()=>state==='sent'?{ok:true,body:{id:'first'}}:{ok:false,delivery_uncertain:state==='unknown'});
  const time=Date.now()+100;env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) VALUES ('next','t','inbound','instagram','customer','customer','Next question',?)").run(time);env.DB.sqlite.prepare("UPDATE threads SET last_inbound_at=? WHERE id='t'").run(time);
  // Use a past current inbound so reply draft creation timestamp follows it.
  env.DB.sqlite.prepare("UPDATE messages SET created_at=? WHERE id='in'").run(Date.now()-200);
  env.DB.sqlite.prepare("UPDATE messages SET created_at=? WHERE id='next'").run(Date.now()-10);
  const history=await(await get({env,request:new Request('https://anejo.test/api/hub/comms/messages?thread_id=t',{headers:{cookie:OWNER_COOKIE}})})).json();assert.equal(history.reply_current_trigger.trigger_id,'next');assert.equal(history.reply_current_trigger.latest_attempt,null);assert.equal(history.reply_attempt_unresolved,state==='unknown');
  env.IG_ACCESS_TOKEN='test';env.IG_USER_ID='self';env.IG_API_HOST='instagram';const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify({id:'next-response'})};};try{const result=await(await post({env,request:new Request('https://anejo.test/api/hub/comms/messages',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({thread_id:'t',body:'Next reply',expected_trigger_id:'next',request_id:'33333333-3333-4333-8333-333333333333'})})})).json();assert.equal(result.sent,state!=='unknown',JSON.stringify(result));assert.equal(calls,state==='unknown'?0:1);}finally{globalThis.fetch=old;}
 }
});

test('human reviewed inbound trigger cannot silently switch after a newer customer message',async()=>{
 const {onRequestPost:post}=await import('../../functions/api/hub/comms/messages.js');const env=setup();env.DB.sqlite.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,created_at) VALUES ('newer','t','inbound','instagram','customer','customer','Different request',?)").run(Date.now()+100);const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not send');};try{const r=await(await post({env,request:new Request('https://anejo.test/api/hub/comms/messages',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({thread_id:'t',body:'Reviewed old reply',request_id:'44444444-4444-4444-8444-444444444444',expected_trigger_id:'in'})})})).json();assert.equal(r.error,'inbound_trigger_changed');assert.equal(calls,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM instagram_reply_attempts').n,0);}finally{globalThis.fetch=old;}
});

test('ambiguous outcomes and legacy unknown IDs never acquire successful acceptance evidence',async()=>{
 for(const outcome of [{ok:false,delivery_uncertain:true},{ok:true,body:{}},{ok:false,body:{id:'error-id'}}]){
  const env=setup();let calls=0;const provider=async()=>{calls++;return outcome;};
  const first=await sendAnaDraft(env,args,provider);
  assert.equal(env.DB.one('SELECT acceptance_receipt_json FROM instagram_reply_attempts').acceptance_receipt_json,null);
  const recovered=await reconcileInstagramReplyAttempt(env,{attemptId:first.attempt_id,threadId:'t'});
  assert.equal(recovered.sent,false);assert.equal((await sendAnaDraft(env,args,provider)).sent,false);assert.equal(calls,1);
 }
 const env=setup();const attempt=await sendAnaDraft(env,args,async()=>({ok:false,delivery_uncertain:true}));
 env.DB.exec("UPDATE instagram_reply_attempts SET provider_message_id='legacy-id',error_code='send_receipt_unavailable'");
 assert.equal((await reconcileInstagramReplyAttempt(env,{attemptId:attempt.attempt_id,threadId:'t'})).state,'unknown');
});

test('concurrent local recovery preserves original auto/human attribution and never regresses newer thread time',async()=>{
 for(const human of [false,true]){
  const env=setup(),batch=env.DB.batch;env.DB.batch=async()=>{throw Error('finalization outage');};let calls=0;
  const provider=async()=>{calls++;return {ok:true,body:{id:'accepted'}};};
  const first=human?await sendHumanInstagramReply(env,{threadId:'t',body:'Human reviewed reply',requestId:'55555555-5555-4555-8555-555555555555',expectedTriggerId:'in',actorId:'stf_owner',actorRole:'owner'},provider):await sendAnaDraft(env,{...args,initiatedBy:'ana_auto'},provider);
  assert.equal(first.state,'unknown');
  const acceptance=JSON.parse(env.DB.one('SELECT acceptance_receipt_json FROM instagram_reply_attempts').acceptance_receipt_json);
  env.DB.batch=batch;const newer=acceptance.accepted_at+1000;
  env.DB.sqlite.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').run(newer,newer,'t');
  const results=await Promise.all([1,2].map(()=>reconcileInstagramReplyAttempt(env,{attemptId:first.attempt_id,threadId:'t'})));
  assert.ok(results.every(r=>r.sent));assert.equal(calls,1);
  const message=env.DB.one('SELECT sent_at,sender_role FROM messages WHERE id=?',first.message_id||env.DB.one('SELECT message_id FROM instagram_reply_attempts').message_id);
  assert.equal(message.sender_role,human?'owner':'ana_auto');assert.equal(message.sent_at,acceptance.accepted_at);
  assert.equal(env.DB.one("SELECT last_message_at FROM threads WHERE id='t'").last_message_at,newer);
 }
});

test('lost acceptance write stays unresolved even with provider ID; replay never sends again',async()=>{
 const env=setup(),prepare=env.DB.prepare.bind(env.DB);let calls=0;
 env.DB.prepare=sql=>sql.startsWith('UPDATE instagram_reply_attempts SET acceptance_receipt_json=')?{bind:()=>({run:async()=>{throw Error('ack storage unavailable');}})}:prepare(sql);
 const provider=async()=>{calls++;return {ok:true,body:{id:'provider-accepted'}};};
 assert.equal((await sendAnaDraft(env,args,provider)).state,'unknown');env.DB.prepare=prepare;
 assert.equal(env.DB.one('SELECT acceptance_receipt_json FROM instagram_reply_attempts').acceptance_receipt_json,null);
 assert.equal((await sendAnaDraft(env,args,provider)).state,'unknown');assert.equal(calls,1);
});

test('recovery refuses receipt/body mismatch and cannot finalize a changed message',async()=>{
 for(const change of ['receipt','message']){
  const env=setup(),batch=env.DB.batch;env.DB.batch=async()=>{throw Error('outage');};
  const attempt=await sendAnaDraft(env,args,async()=>({ok:true,body:{id:'accepted'}}));env.DB.batch=batch;
  if(change==='receipt'){
   const receipt=JSON.parse(env.DB.one('SELECT acceptance_receipt_json FROM instagram_reply_attempts').acceptance_receipt_json);receipt.body_sha256='invented';
   env.DB.sqlite.prepare('UPDATE instagram_reply_attempts SET acceptance_receipt_json=?').run(JSON.stringify(receipt));
  }else env.DB.exec("UPDATE messages SET body='Changed out of band' WHERE id='out'");
  assert.equal((await reconcileInstagramReplyAttempt(env,{attemptId:attempt.attempt_id,threadId:'t'})).sent,false);
  assert.equal(env.DB.one("SELECT sent_at FROM messages WHERE id='out'").sent_at,null);
 }
});

test('acceptance and fallback storage outage leaves a blocking claim, never a second provider call',async()=>{
 const env=setup(),prepare=env.DB.prepare.bind(env.DB);let calls=0;
 env.DB.prepare=sql=>sql.startsWith('UPDATE instagram_reply_attempts')?{bind:()=>({run:async()=>{throw Error('storage outage');}})}:prepare(sql);
 const provider=async()=>{calls++;return {ok:true,body:{id:'accepted-before-outage'}};};
 assert.equal((await sendAnaDraft(env,args,provider)).sent,false);env.DB.prepare=prepare;
 assert.equal(env.DB.one('SELECT state FROM instagram_reply_attempts').state,'claimed');
 assert.equal((await sendAnaDraft(env,args,provider)).state,'claimed');assert.equal(calls,1);
 assert.equal(env.DB.one("SELECT sent_at FROM messages WHERE id='out'").sent_at,null);
});
