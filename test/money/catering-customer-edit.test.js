import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { editableQuote, previewCustomerEdit, applyCustomerEdit, getCustomerEdit, customerQuote } from '../../functions/_lib/catering_customer_edit.js';
import { onRequestGet, onRequestPost } from '../../functions/api/catering-quote-edit.js';
const token = '11111111111111111111111111111111';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0085_catering_quotes_deposits.sql','0101_catering_quote_delivery.sql','0147_catering_quote_revisions.sql','0154_catering_quote_creation_claim.sql']) sql.exec(readFileSync(new URL('../../migrations/' + f, import.meta.url), 'utf8'));
  sql.exec('ALTER TABLE catering_quotes ADD COLUMN source_lead_id TEXT');
  const breakdown = { lead_id: 'lead1', delivery_fee_cents: 0, event_time: '18:00', lines: [{ name: 'Owner-priced roast pork', qty: '35', cents: 4625 }] };
  sql.prepare(`INSERT INTO catering_quotes(id,customer_name,customer_email,customer_phone,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,square_order_id,payment_link_id,payment_link_url,terms_version,terms_json,quote_json,created_at,updated_at,access_token) VALUES ('old','Test Guest','guest@example.test','5615550101','2099-01-01',35,4625,.5,2313,2312,'unpaid','order_old','link_old','https://square.link/old','v1','{}',?,1,1,?)`).run(JSON.stringify(breakdown), token);
  sql.exec(`CREATE TABLE menu_items(id TEXT, name TEXT, name_es TEXT, kind TEXT, active INTEGER, availability TEXT,price_cents INTEGER,sort INTEGER,image TEXT); CREATE TABLE menu_modifier_prices(key TEXT,cents INTEGER); INSERT INTO menu_items VALUES('catering_croqueta-30','Ham croquetas',NULL,'tray',1,'available',4500,1,'croquetas.jpg')`);
  function prep(query,args=[]) { return { bind:(...a)=>prep(query,a), first:async()=>sql.prepare(query).get(...args)||null, all:async()=>({results:sql.prepare(query).all(...args)}), run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}) }; }
  return { sql, env:{DB:{prepare:prep},SQUARE_ACCESS_TOKEN:'fixture',SQUARE_LOCATION_ID:'fixture',SQUARE_ENV:'sandbox'} };
}
const body = () => ({token,expected_updated_at:1,lines:[{key:'0',qty:40}],additions:[{id:'catering_croqueta-30',qty:2}]});
async function provider(work,{paid=false,failCreate=false}={}) {
  const real=globalThis.fetch,calls=[]; let state='OPEN';
  globalThis.fetch=async(url,init={})=>{calls.push({url:String(url),method:init.method||'GET',body:init.body&&JSON.parse(init.body)});let data,status=200;
    if(String(url).endsWith('/orders/order_old')) data={order:{id:'order_old',state,tenders:paid?[{id:'paid'}]:[]}};
    else if(init.method==='DELETE'){state='CANCELED';data={cancelled_order_id:'order_old'};}
    else if(init.method==='POST'){if(failCreate){data={};status=503;}else data={payment_link:{id:'newlink',order_id:'neworder',url:'https://square.link/new'}};}
    else throw Error('Unexpected request');return new Response(JSON.stringify(data),{status});};
  try{return await work(calls);}finally{globalThis.fetch=real;}
}
test('server preserves rational owner unit price and ignores caller money and identity',async()=>{
  const {env}=fixture(),q=await customerQuote(env,token),b=body();
  b.lines[0].cents=1;b.additions[0].price_cents=1;b.customer_email='attacker@example.test';
  const p=await previewCustomerEdit(env,q,b);
  assert.equal(p.ok,true);assert.equal(p.lines[0].cents,5286);assert.equal(p.total_cents,14286);
  await provider(async calls=>{const result=await applyCustomerEdit(env,{...b,preview_fingerprint:p.preview_fingerprint});assert.equal(result.ok,true);assert.equal(result.customer_email,'guest@example.test');assert.match(calls.at(-1).body.checkout_options.redirect_url,/^https:\/\/anejocateringco.com/);});
});
test('valid bearer required; supplied quote id never authorizes access and hostile origin rejected',async()=>{
  const {env}=fixture();assert.equal(await customerQuote(env,'bad'),null);
  const invalid=await onRequestGet({env,request:new Request('https://anejocateringco.com/api/catering-quote-edit?quote_id=old')});assert.equal(invalid.status,404);assert.equal(invalid.headers.get('Cache-Control'),'no-store');
  const hostile=await onRequestPost({env,request:new Request('https://anejocateringco.com/api/catering-quote-edit',{method:'POST',headers:{Origin:'https://evil.test'}})});assert.equal(hostile.status,403);
});
test('stale version, stale catalog price, unavailable addition and invalid quantity cannot change checkout',async()=>{
  const {env,sql}=fixture(),q=await customerQuote(env,token),b=body(),p=await previewCustomerEdit(env,q,b);
  assert.equal((await previewCustomerEdit(env,q,{...b,expected_updated_at:0})).ok,false);
  assert.equal((await previewCustomerEdit(env,q,{...b,lines:[{key:'0',qty:1.5}]})).ok,false);
  sql.exec("UPDATE menu_items SET price_cents=4600");
  await provider(async calls=>{assert.equal((await applyCustomerEdit(env,{...b,preview_fingerprint:p.preview_fingerprint})).ok,false);assert.equal(calls.length,0);});
  sql.exec("UPDATE menu_items SET availability='sold_out'");assert.equal((await previewCustomerEdit(env,q,b)).ok,false);
});
test('payment evidence blocks replacement and does not retire original',async()=>{
  const {env,sql}=fixture(),p=await previewCustomerEdit(env,await customerQuote(env,token),body());
  await provider(async calls=>{assert.equal((await applyCustomerEdit(env,{...body(),preview_fingerprint:p.preview_fingerprint})).ok,false);assert.deepEqual(calls.map(c=>c.method),['GET']);},{paid:true});
  assert.equal(sql.prepare("SELECT deposit_status FROM catering_quotes WHERE id='old'").get().deposit_status,'unpaid');
});
test('actual replacement, old-token chain resolution and retry never issue duplicate checkout',async()=>{
  const {env,sql}=fixture(),p=await previewCustomerEdit(env,await customerQuote(env,token),body()),b={...body(),preview_fingerprint:p.preview_fingerprint};
  await provider(async calls=>{const r=await applyCustomerEdit(env,b);assert.equal(r.ok,true);assert.equal(calls.length,4);const again=await applyCustomerEdit(env,b);assert.equal(again.quote_id,r.quote_id);assert.equal(calls.length,4);const view=await getCustomerEdit(env,token);assert.equal(view.quote.id,r.quote_id);assert.equal(view.quote.total_cents,14286);assert.equal(JSON.parse(sql.prepare('SELECT quote_json FROM catering_quotes WHERE id=?').get(r.quote_id).quote_json).lead_id,'lead1');});
});
test('retry after provider creation failure resumes frozen revision and rejects changed preview',async()=>{
  const {env}=fixture(),p=await previewCustomerEdit(env,await customerQuote(env,token),body()),b={...body(),preview_fingerprint:p.preview_fingerprint};let key;
  await provider(async calls=>{assert.equal((await applyCustomerEdit(env,b)).ok,false);key=calls.at(-1).body.idempotency_key;},{failCreate:true});
  await provider(async calls=>{assert.equal((await applyCustomerEdit(env,{...b,preview_fingerprint:'wrong'})).ok,false);assert.equal(calls.length,0);assert.equal((await applyCustomerEdit(env,b)).ok,true);assert.equal(calls.length,1);assert.equal(calls[0].body.idempotency_key,key);});
});
test('discounts, delivery fees, custom quantities, paid bookings and notice violations need review',async()=>{
  const {env}=fixture(),q=await customerQuote(env,token),b=JSON.parse(q.quote_json);
  for(const override of [{discount_cents:1},{delivery_fee_cents:2000},{lines:[{name:'Food',qty:'1 tray',cents:4625}]}])assert.equal(editableQuote({...q,quote_json:JSON.stringify({...b,...override})}).ok,false);
  assert.equal(editableQuote({...q,deposit_status:'paid'}).ok,false);
  const near={...q,event_date:'2026-10-20',quote_json:JSON.stringify({...b,event_time:'12:00',custom_printing:true})};
  assert.equal(editableQuote(near,Date.parse('2026-10-18T16:00:00Z')).ok,false);
});

 test('refresh exposes frozen recoverable prices and rejects a new preview until recovery', async()=>{
  const {env,sql}=fixture(),p=await previewCustomerEdit(env,await customerQuote(env,token),body()),b={...body(),preview_fingerprint:p.preview_fingerprint};
  await provider(async()=>{assert.equal((await applyCustomerEdit(env,b)).ok,false);},{failCreate:true});
  sql.exec("UPDATE menu_items SET price_cents=9999");
  const view=await getCustomerEdit(env,token);
  assert.equal(view.editable,false);assert.equal(view.recovery.total_cents,14286);assert.equal(view.recovery.preview_fingerprint,p.preview_fingerprint);
  assert.equal(view.recovery.lines[1].product_id,'catering_croqueta-30');
  assert.equal((await previewCustomerEdit(env,await customerQuote(env,token),{...body(),lines:[{key:'0',qty:999}]})).ok,false);
  await provider(async calls=>{const result=await applyCustomerEdit(env,{token,...view.recovery});assert.equal(result.ok,true);assert.equal(result.total_cents,14286);assert.equal(calls.length,1);});
});
 test('catalog is restricted to published fixed-price catering and traditional items and excludes daily or arbitrary products',async()=>{
  const {env,sql}=fixture();sql.exec("INSERT INTO menu_items VALUES('daily_lunch','Daily lunch',NULL,'addon',1,'available',1000,2,NULL),('traditional_skewer','Skewer',NULL,'addon',1,'available',250,3,NULL)");
  const view=await getCustomerEdit(env,token);assert.deepEqual(view.catalog.map(i=>i.id).sort(),['catering_croqueta-30','traditional_skewer']);
});

 test('concurrent different approved previews cannot proceed with the first saved payload',async()=>{
  const {env,sql}=fixture(),q=await customerQuote(env,token),p=await previewCustomerEdit(env,q,body()),b={...body(),preview_fingerprint:p.preview_fingerprint};
  const prepare=env.DB.prepare;let raced=false;
  env.DB.prepare=query=>{
    if(!raced && /INSERT OR IGNORE INTO catering_quote_revisions/.test(query)){
      raced=true;
      const payload={quoteBreakdown:{lines:[{name:'Different first approved menu',qty:'1',cents:20000}]}};
      sql.prepare("INSERT INTO catering_quote_revisions VALUES('old','racer','22222222222222222222222222222222',?,1,'pending','customer:self-service',1,1)").run(JSON.stringify(payload));
    }return prepare(query);
  };
  await provider(async calls=>{const result=await applyCustomerEdit(env,b);assert.equal(result.ok,false);assert.match(result.error,/saved first/);assert.equal(calls.length,0);});
});

 test('owner-created pending revision cannot be resumed or changed by customer token',async()=>{
  const {env,sql}=fixture(),p=await previewCustomerEdit(env,await customerQuote(env,token),body()),b={...body(),preview_fingerprint:p.preview_fingerprint};
  await provider(async()=>{assert.equal((await applyCustomerEdit(env,b)).ok,false);},{failCreate:true});
  sql.exec("UPDATE catering_quote_revisions SET created_by='owner:dayan'");
  const view=await getCustomerEdit(env,token);assert.equal(view.editable,false);assert.equal(view.recovery,null);assert.match(view.error,/Añejo is updating/);
  await provider(async calls=>{const result=await applyCustomerEdit(env,b);assert.equal(result.ok,false);assert.match(result.error,/Añejo is updating/);assert.equal(calls.length,0);});
});

 test('explicit guests changes preview digest and saved headcount without scaling item quantities',async()=>{
  const {env,sql}=fixture(),q=await customerQuote(env,token),base=await previewCustomerEdit(env,q,body()),changed={...body(),guests:48};
  const p=await previewCustomerEdit(env,q,changed);assert.equal(p.guests,48);assert.equal(p.total_cents,base.total_cents);assert.notEqual(p.preview_fingerprint,base.preview_fingerprint);
  for(const guests of [0,10001,1.5,'48',null]) assert.equal((await previewCustomerEdit(env,q,{...body(),guests})).ok,false);
  await provider(async()=>{assert.equal((await applyCustomerEdit(env,{...changed,preview_fingerprint:p.preview_fingerprint})).ok,false);},{failCreate:true});
  const view=await getCustomerEdit(env,token);assert.equal(view.recovery.guests,48);assert.equal(view.recovery.preview_fingerprint,p.preview_fingerprint);
  await provider(async()=>{const result=await applyCustomerEdit(env,{token,...view.recovery});assert.equal(result.ok,true);const saved=sql.prepare('SELECT * FROM catering_quotes WHERE id=?').get(result.quote_id);assert.equal(saved.guests,48);assert.equal(saved.event_date,q.event_date);assert.equal(saved.customer_email,q.customer_email);assert.equal(JSON.parse(saved.quote_json).lines[0].qty,'40');});
});
 test('same-lines different-headcount concurrent journal is rejected before provider effects',async()=>{
  const {env,sql}=fixture(),q=await customerQuote(env,token),p=await previewCustomerEdit(env,q,body());
  const prepare=env.DB.prepare;let raced=false;
  env.DB.prepare=query=>{if(!raced && /INSERT OR IGNORE INTO catering_quote_revisions/.test(query)){raced=true;sql.prepare("INSERT INTO catering_quote_revisions VALUES('old','racer','22222222222222222222222222222222',?,1,'pending','customer:self-service',1,1)").run(JSON.stringify({guests:999,quoteBreakdown:{lines:p.lines}}));}return prepare(query);};
  await provider(async calls=>{const result=await applyCustomerEdit(env,{...body(),preview_fingerprint:p.preview_fingerprint});assert.equal(result.ok,false);assert.match(result.error,/saved first/);assert.equal(calls.length,0);});
});
