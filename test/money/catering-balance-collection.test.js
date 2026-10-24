import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {getBalanceCollection,stageBalanceCollection,sendBalanceCollection,approveBalanceAutomation,balanceAutomationApproved} from '../../functions/_lib/catering_balance_collection.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/owner/catering-balance.js';

const TODAY='2026-10-24',QID='cq_collection_test',opts={today:TODAY,baseUrl:'https://anejocateringco.com',actor:'owner@test.example'};
function fixture(){
 const env=ownerEnv({SQUARE_ACCESS_TOKEN:'test',SQUARE_LOCATION_ID:'test',RESEND_API_KEY:'test'});
 env.DB.sqlite.prepare(`INSERT INTO catering_quotes(id,customer_name,customer_email,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,balance_due_date,terms_version,terms_json,created_at,updated_at,access_token,lang) VALUES(?,?,?,'2026-10-25',30,33125,0.5,16563,16562,'paid','due',?,'v1','{}',1,1,'test_token','en')`).run(QID,'Client Example','client@example.test',TODAY);
 return env;
}
async function provider(fn,custom){
 const original=globalThis.fetch,seen=[];
 globalThis.fetch=async(url,init)=>{
  const b=JSON.parse(init.body);seen.push({url:String(url),body:b,headers:init.headers});
  if(custom)return custom(url,init,b,seen);
  if(String(url).includes('resend.com'))return Response.json({id:'receipt_balance_test'});
  return Response.json({payment_link:{order_id:'sq_balance_test',url:'https://square.link/test-balance'}});
 };
 try{return await fn(seen);}finally{globalThis.fetch=original;}
}
const sendBody=staged=>({quote_id:QID,review_hash:staged.draft.review_hash,reviewed:true});

test('read is side effect free; stage saves exact amount, branded email and account route without sending; re-stage reuses checkout',async()=>provider(async seen=>{
 const env=fixture();assert.equal((await getBalanceCollection(env,QID,opts)).draft,null);assert.equal(seen.length,0);
 const a=await stageBalanceCollection(env,QID,opts);assert.equal(a.ok,true);assert.equal(a.draft.amount_cents,16562);assert.equal(a.draft.recipient,'client@example.test');assert.match(a.draft.html,/AÑEJO/);assert.equal(a.draft.account_url,'https://anejocateringco.com/client/dashboard?catering=1');assert.equal(a.draft.status,'staged');
 const b=await stageBalanceCollection(env,QID,opts);assert.equal(a.draft.review_hash,b.draft.review_hash);assert.equal(seen.length,1);assert.equal(seen[0].body.order.line_items[0].base_price_money.amount,16562);assert.equal(env.DB.one('SELECT count(*) n FROM catering_balance_reminders').n,0);
}));
test('explicit review sends once through Resend and saves a separate provider acceptance receipt; retry returns saved receipt',async()=>provider(async seen=>{
 const env=fixture(),staged=await stageBalanceCollection(env,QID,opts),body=sendBody(staged);
 assert.equal((await sendBalanceCollection(env,{...body,reviewed:false},opts)).ok,false);
 const result=await sendBalanceCollection(env,body,opts);assert.equal(result.ok,true);assert.equal(result.provider_accepted,true);assert.equal(result.delivery_verified,false);
 const again=await sendBalanceCollection(env,body,opts);assert.equal(again.replayed,true);assert.equal(again.receipt_id,'receipt_balance_test');assert.equal(seen.filter(x=>x.url.includes('resend.com')).length,1);
 const email=seen.find(x=>x.url.includes('resend.com'));assert.equal(email.body.to[0],'client@example.test');assert.equal(email.body.reply_to[0],'dayan@anejocateringco.com');assert.match(email.body.html,/https:\/\/square.link\/test-balance/);assert.equal(email.headers['Idempotency-Key'],`catering-balance-due_today-${QID}`);
 const history=(await getBalanceCollection(env,QID,opts)).history;assert.equal(history[0].status,'accepted');assert.equal(history[0].provider_accepted,true);
}));
test('concurrent owner send requests can perform only one provider call',async()=>provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts);const results=await Promise.all([sendBalanceCollection(env,sendBody(s),opts),sendBalanceCollection(env,sendBody(s),opts)]);
 assert.equal(results.filter(x=>x.ok).length,1);assert.equal(seen.filter(x=>x.url.includes('resend.com')).length,1);
}));
test('payment, recipient, amount, version and date changes reject stale reviewed email before provider use',async()=>{
 for(const mutation of ["balance_status='paid'","customer_email='changed@example.test'","balance_cents=17000","updated_at=2","balance_due_date='2026-10-23'"]){await provider(async seen=>{
  const env=fixture(),s=await stageBalanceCollection(env,QID,opts);env.DB.exec(`UPDATE catering_quotes SET ${mutation}`);assert.equal((await sendBalanceCollection(env,sendBody(s),opts)).ok,false);assert.equal(seen.filter(x=>x.url.includes('resend.com')).length,0);
 });}
 await provider(async seen=>{const env=fixture(),s=await stageBalanceCollection(env,QID,opts);assert.equal((await sendBalanceCollection(env,sendBody(s),{...opts,today:'2026-10-25'})).ok,false);assert.equal(seen.length,1);});
});
test('paid or unpaid-deposit quotes cannot stage; checkout amount mismatch is blocked',async()=>provider(async seen=>{
 for(const mutation of ["deposit_status='unpaid'","balance_status='paid'","balance_cents=0"]){const env=fixture();env.DB.exec(`UPDATE catering_quotes SET ${mutation}`);assert.equal((await stageBalanceCollection(env,QID,opts)).ok,false);}
 assert.equal(seen.length,0);
 const env=fixture();env.DB.exec(`INSERT INTO catering_balance_checkouts VALUES('${QID}',1,'wrong','https://square.link/wrong',NULL,1)`);assert.equal((await stageBalanceCollection(env,QID,opts)).ok,false);assert.equal(seen.length,0);
}));
test('suppressed addresses create no provider email and remain locked with an accurate status',async()=>provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts);env.DB.exec("INSERT INTO email_suppressions VALUES('client@example.test','bounced',NULL,1,1)");
 const r=await sendBalanceCollection(env,sendBody(s),opts);assert.equal(r.status,'suppressed');assert.equal(r.ok,false);assert.equal(seen.length,1);assert.equal((await sendBalanceCollection(env,sendBody(s),opts)).replayed,true);
 assert.equal((await stageBalanceCollection(env,QID,opts)).ok,false);
}));
test('provider timeout or missing receipt stays unknown and never retries blindly',async()=>{
 for(const mode of ['throw','missing']){await provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts),r=await sendBalanceCollection(env,sendBody(s),opts);assert.equal(r.status,'unknown');assert.equal(r.provider_accepted,false);await sendBalanceCollection(env,sendBody(s),opts);assert.equal(seen.filter(x=>x.url.includes('resend.com')).length,1);assert.equal((await getBalanceCollection(env,QID,opts)).eligible,false);
 },async(url)=>{if(String(url).includes('resend.com')){if(mode==='throw')throw Error('timeout');return Response.json({});}return Response.json({payment_link:{order_id:'sq_balance_test',url:'https://square.link/test-balance'}});});}
});
test('accepted provider call followed by receipt storage failure stays blocked and exposes reconciliation receipt',async()=>provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts),batch=env.DB.batch.bind(env.DB);let batches=0;
 env.DB.batch=async statements=>{batches++;if(batches>1)throw Error('storage lost');return batch(statements);};
 const r=await sendBalanceCollection(env,sendBody(s),opts);assert.equal(r.status,'unknown');assert.equal(r.provider_accepted,true);assert.equal(r.receipt_id,'receipt_balance_test');
 assert.equal((await sendBalanceCollection(env,sendBody(s),opts)).ok,false);assert.equal(seen.filter(x=>x.url.includes('resend.com')).length,1);assert.equal(env.DB.one('SELECT receipt_status FROM catering_balance_reminders').receipt_status,'sending');
}));
test('claim storage failure cannot send and leaves no fabricated receipt',async()=>provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts);env.DB.batch=async()=>{throw Error('claim lost');};await assert.rejects(sendBalanceCollection(env,sendBody(s),opts),/claim lost/);assert.equal(seen.length,1);assert.equal(env.DB.one('SELECT count(*) n FROM catering_balance_reminders').n,0);
}));
test('legacy scheduler claim and other-kind uncertain receipt block owner send; accepted reminder today also blocks',async()=>provider(async seen=>{
 for(const row of [{kind:'due_today',status:null,sent:null},{kind:'due_soon',status:'unknown',sent:null},{kind:'due_soon',status:'accepted',sent:Date.parse('2026-10-24T14:00:00Z')}]){
  const env=fixture();env.DB.sqlite.prepare("INSERT INTO catering_balance_reminders(id,quote_id,kind,amount_cents,channel,created_at,receipt_status,sent_at) VALUES('old',?,?,16562,'email',1,?,?)").run(QID,row.kind,row.status,row.sent);
  const r=await stageBalanceCollection(env,QID,opts);assert.equal(r.ok,false);assert.equal((await getBalanceCollection(env,QID,opts)).eligible,false);
 }
 assert.equal(seen.length,0);
}));
test('owner API refuses unauthenticated and kitchen callers, malformed quotes and missing human review',async()=>{
 const env=fixture(),url='https://anejocateringco.com/api/hub/owner/catering-balance';
 assert.equal((await onRequestGet({env,request:new Request(url+'?quote_id='+QID)})).status,401);
 assert.equal((await onRequestGet({env,request:new Request(url+'?quote_id='+QID,{headers:{cookie:'anejo_sess=tok-kitchen'}})})).status,403);
 assert.equal((await onRequestGet({env,request:new Request(url+'?quote_id=bad',{headers:{cookie:OWNER_COOKIE}})})).status,400);
 const out=await onRequestPost({env,request:new Request(url,{method:'POST',headers:{cookie:OWNER_COOKIE,'content-type':'application/json'},body:JSON.stringify({op:'send',quote_id:QID})})});assert.equal(out.status,409);assert.match((await out.json()).error,/Review/);
});
test('automation is off by default; exact reviewed approval enables only that language without sending',async()=>provider(async seen=>{
 const env=fixture();assert.equal(await balanceAutomationApproved(env,'en'),false);const s=await stageBalanceCollection(env,QID,opts);
 assert.equal((await approveBalanceAutomation(env,{...sendBody(s),enable:true,reviewed:false},opts)).ok,false);
 const approved=await approveBalanceAutomation(env,{...sendBody(s),enable:true},opts);assert.equal(approved.ok,true);assert.equal(approved.sent,false);assert.equal(await balanceAutomationApproved(env,'en'),true);assert.equal(await balanceAutomationApproved(env,'es'),false);assert.equal(seen.length,1);
 assert.equal(env.DB.one('SELECT approved_by FROM catering_balance_collection_policy').approved_by,'owner@test.example');
 await approveBalanceAutomation(env,{...sendBody(s),enable:false},opts);assert.equal(await balanceAutomationApproved(env,'en'),false);assert.equal(seen.length,1);
}));
test('template fingerprint mismatch and policy storage failure disable automatic sending',async()=>provider(async()=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts);await approveBalanceAutomation(env,{...sendBody(s),enable:true},opts);
 env.DB.exec("UPDATE catering_balance_collection_policy SET template_hash='obsolete'");assert.equal(await balanceAutomationApproved(env,'en'),false);assert.equal((await getBalanceCollection(env,QID,opts)).automation.template_changed,true);
 assert.equal(await balanceAutomationApproved({DB:{prepare(){throw Error('missing');}}},'en'),false);
}));
test('last-moment payment after atomic claim suppresses send',async()=>provider(async seen=>{
 const env=fixture(),s=await stageBalanceCollection(env,QID,opts),batch=env.DB.batch.bind(env.DB);let changed=false;
 env.DB.batch=async statements=>{const out=await batch(statements);if(!changed){changed=true;env.DB.exec("UPDATE catering_quotes SET balance_status='paid'");}return out;};
 const out=await sendBalanceCollection(env,sendBody(s),opts);assert.equal(out.status,'suppressed');assert.equal(seen.length,1);assert.equal(env.DB.one('SELECT error FROM catering_balance_reminders').error,'quote_state_changed_before_send');
}));
