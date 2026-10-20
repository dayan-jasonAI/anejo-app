import { test } from 'node:test';
import assert from 'node:assert/strict';
import {makeSqliteD1} from '../helpers/sqlite-d1.js';
import {beginReviewedQuoteSend,finishReviewedQuoteSend,sendInProgress} from '../../functions/_lib/catering_quote_send_review.js';
const hash='a'.repeat(64);
const args={quoteId:'cq_synthetic',reviewHash:hash,expectedUpdatedAt:12};
function fixture(){
 const DB=makeSqliteD1();
 DB.exec(`INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,terms_version,terms_json,created_at,updated_at)
 VALUES('cq_synthetic',20,20000,0.5,10000,10000,'test','{}',1,12);
 INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,terms_version,terms_json,created_at,updated_at)
 VALUES('cq_other',20,20000,0.5,10000,10000,'test','{}',1,12);`);
 return {DB};
}
const accepted={email:{sent:true,receipt_id:'resend_synthetic'},sms:{sent:false,skipped:'not authorized'}};
test('only one concurrent approved send claims the quote; no provider calls in helper',async()=>{
 const env=fixture();const claims=await Promise.all([beginReviewedQuoteSend(env,args),beginReviewedQuoteSend(env,args)]);
 assert.equal(claims.filter(r=>r.send).length,1);assert.equal(claims.filter(r=>!r.ok).length,1);
 assert.equal(await sendInProgress(env,args.quoteId),true);
});
test('paid/stale/revising/retiring quotes cannot start a send',async()=>{
 for(const setup of ["UPDATE catering_quotes SET deposit_status='paid'","UPDATE catering_quotes SET updated_at=13",
 `INSERT INTO catering_quote_revisions(source_quote_id,replacement_quote_id,access_token,payload_json,source_updated_at,state,created_by,created_at,updated_at)
 VALUES('cq_synthetic','cq_other','${'b'.repeat(32)}','{}',12,'pending','test-owner',1,1)`,
 `INSERT INTO catering_quote_duplicate_retirements(source_quote_id,target_quote_id,source_updated_at,target_updated_at,state,created_by,created_at,updated_at)
 VALUES('cq_synthetic','cq_other',12,12,'pending','test-owner',1,1)`]) {
  const env=fixture();env.DB.exec(setup);assert.equal((await beginReviewedQuoteSend(env,args)).ok,false);
 }
});
test('accepted receipt is retained and replay never authorizes a second send',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,args);
 const finish=await finishReviewedQuoteSend(env,claim.claim_id,accepted);
 assert.equal(finish.state,'accepted');assert.equal(finish.email.receipt_id,'resend_synthetic');assert.equal(finish.delivery_verified,false);
 assert.equal(await sendInProgress(env,args.quoteId),false);
 const again=await beginReviewedQuoteSend(env,args);assert.equal(again.send,false);assert.equal(again.replayed,true);
 assert.equal((await finishReviewedQuoteSend(env,claim.claim_id,accepted)).replayed,true);
});
test('suppression/no authorization is no-send and a fresh reviewed attempt may be claimed',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,args);
 assert.equal((await finishReviewedQuoteSend(env,claim.claim_id,{email:{sent:false,skipped:'suppressed'}})).state,'nosend');
 assert.equal((await beginReviewedQuoteSend(env,args)).send,true);
});
test('truthy sent or empty provider response is never proof of acceptance; uncertainty stays locked',async()=>{
 for(const delivery of [{email:{sent:true}}, {},{email:{sent:false,error:'provider timeout'}},
  {...accepted,record_error:'failed save'}]) {
  const env=fixture(),claim=await beginReviewedQuoteSend(env,args);
  assert.equal((await finishReviewedQuoteSend(env,claim.claim_id,delivery)).state,'unknown');
  assert.equal(await sendInProgress(env,args.quoteId),true);
  assert.equal((await beginReviewedQuoteSend(env,args)).ok,false);
 }
});
test('email acceptance remains evidenced when separately authorized SMS is uncertain',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,{...args,smsAuthorized:true});
 const result=await finishReviewedQuoteSend(env,claim.claim_id,{email:accepted.email,sms:{sent:false,error:'timeout'}});
 assert.equal(result.state,'unknown');assert.equal(result.email.provider_accepted,true);assert.equal(result.sms.provider_accepted,false);
});
test('only a real authorized provider SMS receipt is accepted',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,{...args,smsAuthorized:true});
 const result=await finishReviewedQuoteSend(env,claim.claim_id,{email:{sent:false,skipped:'no email'},sms:{sent:true,provider_sid:'SM_synthetic'}});
 assert.equal(result.state,'accepted');assert.equal(result.sms.provider_accepted,true);
});
test('storage failure propagates and leaves a locked claim for reconciliation',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,args),prepare=env.DB.prepare;
 env.DB.prepare=sql=>{if(sql.startsWith('UPDATE catering_quote_send_reviews'))throw Error('DB failed');return prepare(sql);};
 await assert.rejects(finishReviewedQuoteSend(env,claim.claim_id,accepted),/DB failed/);
 assert.equal(await sendInProgress(env,args.quoteId),true);
});
test('fresh saved review can authorize remaining channel after accepted email without replaying accepted email',async()=>{
 const env=fixture(),claim=await beginReviewedQuoteSend(env,args);
 await finishReviewedQuoteSend(env,claim.claim_id,accepted);
 env.DB.exec("UPDATE catering_quotes SET updated_at=13,email_sent_at=10");
 const next=await beginReviewedQuoteSend(env,{...args,reviewHash:'b'.repeat(64),expectedUpdatedAt:13,smsAuthorized:true});
 assert.equal(next.send,true);assert.notEqual(next.claim_id,claim.claim_id);
 const result=await finishReviewedQuoteSend(env,next.claim_id,{email:{sent:false,skipped:'already sent'},sms:{sent:true,provider_sid:'SM_later'}});
 assert.equal(result.state,'accepted');assert.equal(result.sms.receipt_id,'SM_later');
});
