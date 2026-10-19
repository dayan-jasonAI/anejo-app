import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv,OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { acknowledgement,ACK_VERSION,runCateringLeadService,serviceLeads,quoteForLead } from '../../functions/_lib/catering_lead_service.js';
import { onRequestPost } from '../../functions/api/hub/owner/catering-service.js';
import { onRequestPost as callback } from '../../functions/api/webhooks/twilio-status.js';
import { sendSms } from '../../functions/_lib/twilio.js';

function seed(env,id='lead_service',created=Date.now()){
  env.DB.exec(`INSERT INTO leads(id,kind,name,email,phone,sms_consent,created_at) VALUES('${id}','catering','Test Guest','guest@example.test','+15555550101',1,${created})`);
  env.DB.prepare('INSERT INTO catering_requests(request_id,payload_hash,event_json,lead_id,created_at) VALUES(?,?,?,?,?)').bind('request_'+id,'hash',JSON.stringify({event_date:'2026-12-25',guests:30}),id,created).run();
}
function action(env,body){return onRequestPost({env,request:new Request('https://anejocateringco.com/api/hub/owner/catering-service',{method:'POST',headers:{Cookie:OWNER_COOKIE,'Content-Type':'application/json'},body:JSON.stringify(body)})});}

test('acknowledgements require the reviewed template and do not backfill old inquiries',async()=>{
  const env=ownerEnv({RESEND_API_KEY:'synthetic'});seed(env,'old',Date.now()-3600000);
  assert.equal((await action(env,{op:'configure_ack',enabled:true})).status,400);
  assert.equal((await action(env,{op:'configure_ack',enabled:true,reviewed_template_version:ACK_VERSION})).status,200);
  await runCateringLeadService(env);
  assert.equal(env.DB.one('SELECT COUNT(*) AS n FROM catering_acknowledgements').n,0);
});
test('future request acknowledgement has one durable provider identity and no duplicate sends',async()=>{
  const env=ownerEnv({RESEND_API_KEY:'synthetic'});
  await action(env,{op:'configure_ack',enabled:true,reviewed_template_version:ACK_VERSION});
  seed(env,'future',Date.now()+10);let calls=[];const prior=globalThis.fetch;
  globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return Response.json({id:'resend_receipt'});};
  try{
    await runCateringLeadService(env);await runCateringLeadService(env);
    assert.equal(calls.length,1);assert.equal(calls[0].opts.headers['Idempotency-Key'],'catering-ack:future');
    assert.equal(env.DB.one("SELECT status FROM catering_acknowledgements WHERE lead_id='future'").status,'accepted');
  }finally{globalThis.fetch=prior;}
});
test('disabled acknowledgement does not contact customers; overdue call task records an alert',async()=>{
  const env=ownerEnv();seed(env,'overdue',Date.now()-3600000);
  await runCateringLeadService(env);await runCateringLeadService(env);
  assert.equal(env.DB.one('SELECT COUNT(*) AS n FROM catering_acknowledgements').n,0);
  assert.equal(env.DB.one("SELECT COUNT(*) AS n FROM alerts WHERE alert_type='catering_followup_due'").n,1);
  assert.equal((await serviceLeads(env))[0].followup_overdue,true);
  await action(env,{op:'update_followup',lead_id:'overdue',state:'contacted',note:'Called; awaiting decision'});
  assert.equal((await serviceLeads(env))[0].followup_overdue,false);
});
test('old quote for another event is not mistaken for contact on a new inquiry',()=>{
  const lead={id:'a',email:'a@test',phone:'+15555550101',event_json:JSON.stringify({event_date:'2026-12-25'})};
  const quote={id:'q',customer_email:'a@test',customer_phone:'+15555550101',event_date:'2026-11-25',deposit_status:'paid'};
  assert.equal(quoteForLead(lead,[lead],[quote]),null);
});
test('repeated template enable preserves activation boundary and note saves preserve scheduled follow-up',async()=>{
  const env=ownerEnv();seed(env);
  await action(env,{op:'configure_ack',enabled:true,reviewed_template_version:ACK_VERSION});
  const first=env.DB.one('SELECT activated_at FROM catering_service_config').activated_at;
  await action(env,{op:'configure_ack',enabled:true,reviewed_template_version:ACK_VERSION});
  assert.equal(env.DB.one('SELECT activated_at FROM catering_service_config').activated_at,first);
  const future=Date.now()+7200000;
  await action(env,{op:'update_followup',lead_id:'lead_service',state:'contacted',next_followup_at:future,note:'First call'});
  await action(env,{op:'update_followup',lead_id:'lead_service',state:'contacted',note:'Additional notes'});
  assert.equal(env.DB.one('SELECT next_followup_at FROM catering_lead_service').next_followup_at,future);
});
test('owner won status never claims a recorded deposit',async()=>{
  const env=ownerEnv();seed(env);await action(env,{op:'update_followup',lead_id:'lead_service',state:'won'});
  assert.equal((await serviceLeads(env))[0].phase,'owner_won');
});
test('acknowledgement escapes customer markup and preserves both languages',()=>{
  assert.ok(acknowledgement({name:'<script>'}).html.includes('&lt;script&gt;'));
  assert.ok(acknowledgement({source_lang:'es'}).text.includes('Recibimos tu solicitud'));
});
async function signedRequest(body,token='test-secret'){
  const url='https://anejocateringco.com/api/webhooks/twilio-status',p=new URLSearchParams(body);let data=url;
  for(const k of [...p.keys()].sort())data+=k+p.get(k);
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(token),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,enc.encode(data));
  return new Request(url,{method:'POST',body:p,headers:{'X-Twilio-Signature':btoa(String.fromCharCode(...new Uint8Array(mac)))}});
}
test('carrier callbacks validate signature, record delivery and do not regress final status',async()=>{
  const env=ownerEnv({TWILIO_AUTH_TOKEN:'test-secret'}),sid='SM'+'a'.repeat(32);
  env.DB.exec(`INSERT INTO sms_log(id,direction,channel,status,provider_sid,created_at) VALUES('s','outbound','sms','queued','${sid}',1)`);
  assert.equal((await callback({env,request:await signedRequest({MessageSid:sid,MessageStatus:'delivered'})})).status,204);
  assert.equal(env.DB.one("SELECT status FROM sms_log WHERE id='s'").status,'delivered');
  await callback({env,request:await signedRequest({MessageSid:sid,MessageStatus:'sent'})});
  assert.equal(env.DB.one("SELECT status FROM sms_log WHERE id='s'").status,'delivered');
  assert.equal((await callback({env,request:await signedRequest({MessageSid:sid,MessageStatus:'failed'},'forged')})).status,403);
});
test('a carrier callback preceding the send log survives and is joined to the final message',async()=>{
  const env=ownerEnv({TWILIO_AUTH_TOKEN:'test-secret',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_FROM:'+15555550102'}),sid='SM'+'b'.repeat(32);
  assert.equal((await callback({env,request:await signedRequest({MessageSid:sid,MessageStatus:'delivered'})})).status,204);
  const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({sid,status:'queued'});
  try{await sendSms(env,{to:'+15555550101',body:'Synthetic test'});}
  finally{globalThis.fetch=previous;}
  assert.equal(env.DB.one('SELECT status FROM sms_log WHERE provider_sid=?',sid).status,'delivered');
});

function serviceQuote(env,lead='review_lead'){
 seed(env,lead,Date.now()-4*86400000);
 const t=Date.now()-3*86400000;
 env.DB.sqlite.prepare(`INSERT INTO catering_quotes(id,customer_name,customer_email,customer_phone,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,terms_version,terms_json,quote_json,created_at,updated_at,access_token,email_sent_at,source_lead_id) VALUES('review_quote','Test Guest','guest@example.test','+15555550101','2099-01-01',35,10000,.5,5000,5000,'v1','{}','{}',?,?,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',?,?)`).run(t,t,t,lead);
}
test('accepted reminders defer default owner checkpoint without changing call notes or sending again',async()=>{
 const env=ownerEnv();serviceQuote(env);const accepted=Date.now()-1000;
 env.DB.sqlite.prepare(`INSERT INTO catering_quote_followups(id,quote_id,lead_id,step,review_hash,snapshot_json,status,idempotency_key,created_by,created_at,updated_at,accepted_at) VALUES('attempt','review_quote','review_lead','review_quote','hash','{}','accepted','key','owner',?,?,?)`).run(accepted,accepted,accepted);
 const l=(await serviceLeads(env))[0];assert.equal(l.followup_due_at,accepted+2*86400000);assert.equal(l.followup_overdue,false);assert.equal(l.quote_reminder_status,'accepted');
 await runCateringLeadService(env);assert.equal(env.DB.one("SELECT COUNT(*) n FROM alerts WHERE alert_type='catering_followup_due'").n,0);
});
test('recorded replies route owner work and declines or paid deposits stop chase alerts',async()=>{
 const env=ownerEnv();serviceQuote(env);const t=Date.now()-1000;
 env.DB.sqlite.prepare(`INSERT INTO catering_quote_responses(lead_id,quote_id,status,note,next_followup_at,updated_by,updated_at) VALUES('review_lead','review_quote','changes_requested','Change menu',?,'owner',?)`).run(t,t);
 await runCateringLeadService(env);const l=(await serviceLeads(env))[0];assert.equal(l.followup_action,'revise');assert.equal(l.response_note,'Change menu');assert.match(env.DB.one("SELECT title FROM alerts WHERE alert_type='catering_followup_due'").title,/requested changes/);
 env.DB.exec("UPDATE catering_quote_responses SET status='declined'");assert.equal((await serviceLeads(env))[0].followup_overdue,false);
 env.DB.exec("UPDATE catering_quotes SET deposit_status='paid'");const paid=(await serviceLeads(env))[0];assert.equal(paid.phase,'booked');assert.equal(paid.followup_action,'booked');assert.equal(paid.followup_overdue,false);
});
