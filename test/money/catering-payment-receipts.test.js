import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/webhooks/square.js';
import { runBalanceReminders } from '../../functions/_lib/catering_balance_reminder.js';

function fixture() {
  const DB=makeSqliteD1();
  DB.exec(`INSERT INTO catering_quotes
    (id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,square_order_id,
     customer_email,event_date,balance_due_date,terms_version,terms_json,created_at,updated_at)
    VALUES ('cq_receipt',20,20000,0.5,10000,10000,'unpaid','sq_receipt',
      'synthetic@example.test','2026-12-12','2026-12-11','test','{}',1,1);
    INSERT INTO catering_balance_checkouts (quote_id,square_order_id,payment_link_url,amount_cents,created_at)
      VALUES ('cq_receipt','sq_balance','https://example.test/pay',10000,1);`);
  return {DB,RESEND_API_KEY:'synthetic-only'};
}
function webhook(env,amount=10000,currency='USD') {
  return onRequestPost({env,request:new Request('https://example.test/api/webhooks/square',{
    method:'POST',body:JSON.stringify({type:'payment.updated',data:{object:{payment:{
      id:'p_synthetic',order_id:'sq_receipt',status:'COMPLETED',amount_money:{amount,currency}
    }}}})})});
}
test('Square deposit webhook persists exact payment and duplicate webhook cannot book twice',async()=>{
  const env=fixture();
  assert.equal((await webhook(env)).status,200);
  assert.equal((await webhook(env)).status,200);
  assert.equal(env.DB.one('SELECT deposit_status FROM catering_quotes').deposit_status,'paid');
  assert.equal(env.DB.rows("SELECT * FROM activity_log WHERE event='catering.deposit.receipt'").length,1);
});
test('unexpected Square money is acknowledged with a durable critical reconciliation alert',async()=>{
  for(const [amount,currency] of [[9000,'USD'],[11000,'USD'],[10000,'CAD'],[undefined,'USD']]) {
    const env=fixture();
    // Explicit missing amount must not use the function's default.
    const result = amount===undefined ? await onRequestPost({env,request:new Request('https://example.test/api/webhooks/square',{
      method:'POST',body:JSON.stringify({type:'payment.updated',data:{object:{payment:{id:'p_missing',order_id:'sq_receipt',status:'COMPLETED',amount_money:{currency}}}}})})}) : await webhook(env,amount,currency);
    assert.equal(result.status,200);
    assert.equal(env.DB.one('SELECT deposit_status FROM catering_quotes').deposit_status,'unpaid');
    assert.equal(env.DB.one("SELECT severity FROM alerts WHERE title='Catering payment needs reconciliation'").severity,'critical');
  }
});
test('Square retries when the deposit receipt transaction cannot persist',async()=>{
  const env=fixture();
  env.DB.batch=async()=>{throw Error('synthetic DB failure');};
  assert.equal((await webhook(env)).status,503);
  assert.equal(env.DB.one('SELECT deposit_status FROM catering_quotes').deposit_status,'unpaid');
});

test('balance reminder records actual acceptance, not delivery, and replay sends nothing',async()=>{
  const env=fixture();
  env.DB.exec("UPDATE catering_quotes SET deposit_status='paid'");
  const saved=globalThis.fetch; let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({id:'receipt_synthetic'}));};
  try {
    const r=await runBalanceReminders(env,'2026-12-10');
    assert.equal(r.sent.length,1);
    assert.equal(r.sent[0].provider_accepted,true);
    assert.equal(r.sent[0].delivery_verified,false);
    assert.ok(env.DB.one('SELECT sent_at FROM catering_balance_reminders').sent_at);
    assert.equal(JSON.parse(env.DB.one("SELECT properties FROM activity_log WHERE event='catering.balance_reminder.accepted'").properties).receipt_id,'receipt_synthetic');
    assert.equal((await runBalanceReminders(env,'2026-12-10')).sent.length,0);
    assert.equal(calls,1);
  } finally {globalThis.fetch=saved;}
});
test('suppressed recipient and unverified provider response never become sent',async()=>{
  const saved=globalThis.fetch;
  try {
    for(const mode of ['suppressed','unknown','throw','storage']) {
      const env=fixture();let calls=0;
      env.DB.exec("UPDATE catering_quotes SET deposit_status='paid'");
      if(mode==='suppressed') env.DB.exec("INSERT INTO email_suppressions(email,reason,created_at,updated_at) VALUES('synthetic@example.test','bounce',1,1)");
      if(mode==='storage')env.DB.batch=async()=>{throw Error('receipt storage unavailable');};
      globalThis.fetch=async()=>{calls++;if(mode==='throw')throw Error('private provider body');return new Response(JSON.stringify(mode==='unknown'?{}:{id:'receipt_synthetic'}));};
      const r=await runBalanceReminders(env,'2026-12-10');
      assert.equal(r.sent.length,0,mode);
      assert.equal(env.DB.one('SELECT sent_at FROM catering_balance_reminders').sent_at,null,mode);
      assert.equal(calls,mode==='suppressed'?0:1);
      assert.equal((await runBalanceReminders(env,'2026-12-10')).sent.length,0);
      assert.equal(calls,mode==='suppressed'?0:1,'claimed uncertain attempt never blindly retried');
      assert.doesNotMatch(JSON.stringify(r),/private provider body/);
    }
  } finally {globalThis.fetch=saved;}
});
