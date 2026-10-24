import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {stageCateringMessage,sendCateringMessage,getCateringMessages} from '../../functions/_lib/catering_messages.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/owner/catering-message.js';
const leadId='ld_message_test',actor='stf_owner',input={lead_id:leadId,subject:'Your celebration',body:'Hello!\nWe can help with your menu.'};
function fixture(){const env=ownerEnv({RESEND_API_KEY:'test'});env.DB.sqlite.prepare("INSERT INTO leads(id,kind,name,email,created_at) VALUES(?,'catering',?,?,1)").run(leadId,'Client <Example>','client@example.test');return env;}
const body=staged=>({lead_id:leadId,draft_id:staged.draft.draft_id,review_hash:staged.draft.review_hash,reviewed:true});
async function provider(fn,custom){const original=globalThis.fetch,seen=[];globalThis.fetch=async(url,init)=>{seen.push({url:String(url),init,body:JSON.parse(init.body)});return custom?custom(url,init):Response.json({id:'message_receipt_test'});};try{return await fn(seen);}finally{globalThis.fetch=original;}}

test('message preview is branded, escaped, exactrecipientbound and sends nothing; blank/overlong/header-injection payloads reject',async()=>provider(async seen=>{
 const env=fixture(),r=await stageCateringMessage(env,{...input,body:'<script>bad</script>\nActual message'},actor);assert.equal(r.ok,true);assert.match(r.draft.html,/AÑEJO/);assert.match(r.draft.html,/email_emblem/);assert.match(r.draft.html,/&lt;script&gt;/);assert.doesNotMatch(r.draft.html,/<script>/);assert.equal(r.draft.recipient,'client@example.test');assert.equal(seen.length,0);
 for(const changes of [{subject:''},{body:''},{subject:'A\nB'},{subject:'x'.repeat(161)},{body:'x'.repeat(6001)}])assert.equal((await stageCateringMessage(env,{...input,...changes},actor)).ok,false);
}));
test('identical concurrent stages return the same durable draft',async()=>{
 const env=fixture(),[a,b]=await Promise.all([stageCateringMessage(env,input,actor),stageCateringMessage(env,input,actor)]);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a.draft.draft_id,b.draft.draft_id);assert.equal(env.DB.one('SELECT count(*) n FROM catering_message_drafts').n,1);
});
test('review required; one accepted send projects once into Hub emailchannel and replay sends nothing',async()=>provider(async seen=>{
 const env=fixture(),s=await stageCateringMessage(env,input,actor),b=body(s);assert.equal((await sendCateringMessage(env,{...b,reviewed:false},actor)).ok,false);
 const r=await sendCateringMessage(env,b,actor);assert.equal(r.ok,true);assert.equal(r.provider_accepted,true);assert.equal(r.delivery_verified,false);const replay=await sendCateringMessage(env,b,actor);assert.equal(replay.replayed,true);assert.equal(seen.length,1);assert.equal(seen[0].init.headers['Idempotency-Key'],'catering-message-'+b.draft_id);assert.equal(seen[0].body.to[0],'client@example.test');assert.equal(seen[0].body.reply_to[0],'dayan@anejocateringco.com');
 const messages=env.DB.rows('SELECT * FROM messages');assert.equal(messages.length,1);assert.equal(messages[0].direction,'outbound');assert.equal(messages[0].channel,'email');assert.equal(messages[0].body,input.subject+'\n\n'+input.body);assert.equal(env.DB.one('SELECT ref_id FROM threads').ref_id,leadId);
 const h=await getCateringMessages(env,leadId);assert.equal(h.history[0].status,'accepted');assert.equal(h.history[0].receipt_id,'message_receipt_test');
}));
test('same draft concurrent sends callprovider once',async()=>provider(async seen=>{
 const env=fixture(),s=await stageCateringMessage(env,input,actor),out=await Promise.all([sendCateringMessage(env,body(s),actor),sendCateringMessage(env,body(s),actor)]);assert.equal(out.filter(x=>x.ok).length,1);assert.equal(seen.length,1);
}));
test('different drafts for samelead cannot overlap uncertain provider operations',async()=>{
 const env=fixture(),a=await stageCateringMessage(env,input,actor),b=await stageCateringMessage(env,{...input,body:'Another message'},actor),original=globalThis.fetch;let count=0,release;
 const waiting=new Promise(resolve=>{release=resolve;});globalThis.fetch=async()=>{count++;await waiting;return Response.json({id:'concurrent_receipt'});};
 try{
 const first=sendCateringMessage(env,body(a),actor),second=sendCateringMessage(env,body(b),actor);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(count,1);release();const results=await Promise.allSettled([first,second]);assert.equal(results.filter(x=>x.status==='fulfilled'&&x.value.ok).length,1);
 }finally{release();globalThis.fetch=original;}
});
test('changed recipient orname rejects stalepreview without callingprovider',async()=>provider(async seen=>{
 for(const change of ["email='other@example.test'","name='Changed Client'"]){const env=fixture(),s=await stageCateringMessage(env,input,actor);env.DB.exec(`UPDATE leads SET ${change}`);assert.equal((await sendCateringMessage(env,body(s),actor)).ok,false);}
 assert.equal(seen.length,0);
}));
test('unknown provideroutcome fences both retry andnew message and never projects phantom accepted email',async()=>provider(async seen=>{
 const env=fixture(),s=await stageCateringMessage(env,input,actor),r=await sendCateringMessage(env,body(s),actor);assert.equal(r.status,'unknown');assert.equal(r.provider_accepted,false);assert.equal((await sendCateringMessage(env,body(s),actor)).ok,false);const another=await stageCateringMessage(env,{...input,body:'New attempt'},actor);assert.equal((await sendCateringMessage(env,body(another),actor)).ok,false);assert.equal(seen.length,1);assert.equal(env.DB.one('SELECT count(*) n FROM messages').n,0);
},async()=>{throw Error('timeout');}));
test('suppressed recipient createsno providercall and persists suppressed status',async()=>provider(async seen=>{
 const env=fixture(),s=await stageCateringMessage(env,input,actor);env.DB.exec("INSERT INTO email_suppressions VALUES('client@example.test','bounced',NULL,1,1)");assert.equal((await sendCateringMessage(env,body(s),actor)).ok,false);assert.equal(seen.length,0);assert.equal(env.DB.one('SELECT status FROM catering_message_drafts').status,'suppressed');
}));
test('provider acceptance plus projection failure saves receiptforreconciliation and preventssecondsend',async()=>provider(async seen=>{
 const env=fixture(),s=await stageCateringMessage(env,input,actor);env.DB.batch=async()=>{throw Error('projection unavailable');};const r=await sendCateringMessage(env,body(s),actor);assert.equal(r.status,'unknown');assert.equal(r.provider_accepted,true);assert.equal(r.receipt_id,'message_receipt_test');assert.equal(env.DB.one('SELECT receipt_id FROM catering_message_drafts').receipt_id,'message_receipt_test');assert.equal((await sendCateringMessage(env,body(s),actor)).ok,false);assert.equal(seen.length,1);
}));
test('only owner can read orwrite composer; malformed ornoncatering IDs fail without customer data leakage',async()=>{
 const env=fixture(),url='https://anejocateringco.com/api/hub/owner/catering-message';for(const [cookie,status]of [[null,401],['anejo_sess=tok-kitchen',403],['anejo_sess=tok-marketing',403]]){const headers=cookie?{cookie}:{};assert.equal((await onRequestGet({env,request:new Request(url+'?lead_id='+leadId,{headers})})).status,status);}
 assert.equal((await onRequestGet({env,request:new Request(url+'?lead_id=bad',{headers:{cookie:OWNER_COOKIE}})})).status,400);
 env.DB.exec("UPDATE leads SET kind='wholesale'");const response=await onRequestPost({env,request:new Request(url,{method:'POST',headers:{cookie:OWNER_COOKIE,'content-type':'application/json'},body:JSON.stringify({...input,op:'stage'})})});assert.equal(response.status,409);assert.doesNotMatch(await response.text(),/client@example.test/);
});
