import test from 'node:test';
import assert from 'node:assert/strict';
import {createBalanceCheckout,markBalancePaid} from '../../functions/_lib/catering_balance.js';
import {makeD1} from '../helpers/d1.js';
function fixture(overrides={}){
 const quote={id:'cq-test',balance_cents:7500,balance_status:'due',deposit_status:'paid',...overrides};let saved=null,batches=0;
 const DB=makeD1([
 [/SELECT id, balance_cents/,()=>quote],
 [/INSERT OR IGNORE/,()=>{saved??={quote_id:quote.id,amount_cents:quote.balance_cents};return 1}],
 [/SELECT \* FROM catering_balance_checkouts/,()=>saved],
 [/UPDATE catering_balance_checkouts SET square_order_id/,({args})=>{saved.square_order_id=args[0];saved.payment_link_url=args[1];return 1}],
 [/SELECT quote_id,amount_cents/,()=>saved]
 ]);
 DB.batch=async()=>{batches++;saved.paid_at=1;quote.balance_status='paid';return [{meta:{changes:1}},{meta:{changes:1}}]};
 return {env:{DB,SQUARE_ENV:'sandbox',SQUARE_ACCESS_TOKEN:'test',SQUARE_LOCATION_ID:'test'},getSaved:()=>saved,getBatches:()=>batches};
}
test('balance link uses exact stored balance, retries reuse it, and successful receipt reconciles once',async()=>{
 const f=fixture(),real=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_,init)=>{calls++;const b=JSON.parse(init.body);assert.equal(b.idempotency_key,'catering-balance-cq-test');assert.equal(b.order.line_items[0].base_price_money.amount,7500);assert.equal(b.checkout_options.allow_tipping,false);return new Response(JSON.stringify({payment_link:{order_id:'sq1',url:'https://square.link/mock'}}))};
 try{assert.equal((await createBalanceCheckout(f.env,'cq-test','https://example.com')).ok,true);assert.equal((await createBalanceCheckout(f.env,'cq-test','https://example.com')).ok,true);assert.equal(calls,1);assert.equal(await markBalancePaid(f.env,'sq1',7499,'USD'),null);assert.equal(await markBalancePaid(f.env,'sq1',7500,'EUR'),null);assert.equal(f.getBatches(),0);assert.equal(await markBalancePaid(f.env,'sq1',7500,'USD'),'cq-test');assert.equal(await markBalancePaid(f.env,'sq1',7500,'USD'),null);assert.equal(f.getBatches(),1);}finally{globalThis.fetch=real;}
});
test('unpaid deposits and settled balances cannot mint a balance link',async()=>{for(const override of [{deposit_status:'unpaid'},{balance_status:'paid'},{balance_cents:0}])assert.equal((await createBalanceCheckout(fixture(override).env,'cq-test','https://example.com')).ok,false)});
test('balance storage failures propagate so the webhook can retry',async()=>{await assert.rejects(markBalancePaid({DB:{prepare(){throw Error('database unavailable')}}},'sq1',7500,'USD'),/database unavailable/)});

test('real SQLite balance payment persists atomically and rejects replay',async()=>{
 const {makeCateringDB}=await import('./catering-outbox-fixture.js');
 const {readFileSync}=await import('node:fs');const DB=makeCateringDB();
 DB.sqlite.exec("CREATE TABLE catering_quotes(id TEXT PRIMARY KEY,balance_cents INTEGER,balance_status TEXT,deposit_status TEXT,balance_paid_at INTEGER,updated_at INTEGER); INSERT INTO catering_quotes VALUES('cq-real',7500,'due','paid',NULL,NULL);");
 DB.sqlite.exec(readFileSync(new URL('../../migrations/0099_catering_balance_checkout.sql',import.meta.url),'utf8'));
 const real=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({payment_link:{order_id:'sq-real',url:'https://square.link/mock'}}))};
 try{const env={DB,SQUARE_ENV:'sandbox',SQUARE_ACCESS_TOKEN:'mock',SQUARE_LOCATION_ID:'mock'};assert.equal((await createBalanceCheckout(env,'cq-real','https://example.com')).ok,true);assert.equal((await createBalanceCheckout(env,'cq-real','https://example.com')).ok,true);assert.equal(calls,1);assert.equal(await markBalancePaid(env,'sq-real',7500,'USD'),'cq-real');assert.equal(DB.sqlite.prepare('SELECT balance_status FROM catering_quotes').get().balance_status,'paid');assert.equal(await markBalancePaid(env,'sq-real',7500,'USD'),null);}finally{globalThis.fetch=real;}
});
