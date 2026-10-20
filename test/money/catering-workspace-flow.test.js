import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {ownerQuoteCatalog,validateCatalogQuoteLines} from '../../functions/_lib/catering_quote_catalog.js';
import {onRequestPost} from '../../functions/api/hub/owner/catering-deposit.js';
import {onRequestGet as catalogGet} from '../../functions/api/hub/owner/catering-quote-catalog.js';
import {normalizeQuoteLines} from '../../functions/_lib/catering_quote_lines.js';
const url='https://example.test/api/hub/owner/catering-deposit';
const post=(env,body)=>onRequestPost({env,request:new Request(url,{method:'POST',headers:{Cookie:OWNER_COOKIE,'Content-Type':'application/json'},body:JSON.stringify(body)})});
async function seedQuote(env){await env.DB.prepare(`INSERT INTO catering_quotes(id,customer_name,customer_email,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,quote_json,terms_json,terms_version,access_token,payment_link_url,created_at,updated_at) VALUES('q1','Guest','guest@example.test','2027-01-01',20,10000,.5,5000,5000,'unpaid',?, '{}','v1','11111111111111111111111111111111','https://square.link/synthetic',1,1)`).bind(JSON.stringify({lines:[{name:'Meal',qty:'20',cents:10000}]})).run();}
test('owner catalog requires owner and live D1, never falls back to guessed prices',async()=>{
 const env=ownerEnv();const response=await catalogGet({env,request:new Request(url)});assert.equal(response.status,401);
 assert.equal((await ownerQuoteCatalog({})).ok,false);
 const catalog=await ownerQuoteCatalog(env);assert.equal(catalog.ok,true);assert.ok(catalog.items.length>20);
 const pack=catalog.items.find(x=>x.id==='catering_lechon-10');assert.equal(pack.pack_size,10);assert.match(pack.unit_label,/10/);
});
test('selected SKU pack price multiplies quantity; stale price and stock are refused',async()=>{
 const env=ownerEnv();const item=(await ownerQuoteCatalog(env)).items.find(x=>x.id==='catering_lechon-10');
 const line={name:item.name_en,product_id:item.id,qty:'2',unit_cents:item.unit_cents,cents:2*item.unit_cents,pricing_mode:'catalog'};
 assert.equal((await validateCatalogQuoteLines(env,[line])).ok,true);
 assert.equal((await validateCatalogQuoteLines(env,[{...line,cents:line.cents-1}])).ok,false);
 env.DB.exec(`UPDATE menu_items SET stock_count=1 WHERE id='catering_lechon-10'`);
 assert.equal((await validateCatalogQuoteLines(env,[line])).ok,false);
 assert.equal((await validateCatalogQuoteLines(env,[{...line,pricing_mode:'quoted'}])).ok,true,'saved negotiated rates remain unchanged');
 assert.equal(normalizeQuoteLines([line]).lines[0].unit_cents,item.unit_cents);
});
test('saved-email review binds recipient, amount and revision; stale review cannot send',async()=>{
 const env=ownerEnv();await seedQuote(env);let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('No live calls permitted');};
 try{
  const preview=await (await post(env,{op:'render_saved',quote_id:'q1'})).json();assert.equal(preview.ok,true);assert.match(preview.review_hash,/^[a-f0-9]{64}$/);assert.match(preview.html,/Guest/);assert.equal(calls,0);
  assert.equal((await post(env,{op:'send',quote_id:'q1'})).status,409);
  env.DB.exec("UPDATE catering_quotes SET customer_email='new@example.test',updated_at=2 WHERE id='q1'");
  assert.equal((await post(env,{op:'send',quote_id:'q1',reviewed:true,review_hash:preview.review_hash})).status,409);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('sending a current reviewed quote saves provider receipt; original sends cannot be forced',async()=>{
 const env=ownerEnv({RESEND_API_KEY:'synthetic',EMAIL_FROM:'Anejo <test@example.test>'});await seedQuote(env);
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});return new Response(JSON.stringify({id:'test_receipt'}));};
 try{
  const preview=await(await post(env,{op:'render_saved',quote_id:'q1'})).json();
  assert.equal((await post(env,{op:'send',quote_id:'q1',reviewed:true,review_hash:preview.review_hash,force:true})).status,409);
  const sent=await(await post(env,{op:'send',quote_id:'q1',reviewed:true,review_hash:preview.review_hash})).json();
  assert.equal(sent.ok,true,JSON.stringify(sent));assert.equal(sent.receipt.state,'accepted');assert.equal(sent.delivery.email.receipt_id,'test_receipt');
  assert.equal(calls.length,1);assert.equal(calls[0].body.html,preview.html,'provider gets exactly the reviewed document');
  assert.equal(env.DB.one("SELECT state FROM catering_quote_send_reviews WHERE quote_id='q1'").state,'accepted');
 }finally{globalThis.fetch=original;}
});

test('send fence winning a revision claim race prevents checkout retirement and provider calls',async()=>{
 const {reviseQuote}=await import('../../functions/_lib/catering_quote_revision.js');
 const env=ownerEnv();await seedQuote(env);env.DB.exec("UPDATE catering_quotes SET square_order_id='order_fixture',payment_link_id='link_fixture' WHERE id='q1'");
 const prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.includes('INSERT OR IGNORE INTO catering_quote_revisions'))env.DB.exec(`INSERT INTO catering_quote_send_reviews(quote_id,claim_id,review_hash,expected_updated_at,state,created_at,updated_at) VALUES('q1','claim_fixture','${'a'.repeat(64)}',1,'sending',1,1)`);return prepare(sql);};
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No provider effects allowed');};
 try{const result=await reviseQuote(env,{quote_id:'q1',expected_updated_at:1,customer_name:'Guest',customer_email:'guest@example.test',event_date:'2027-01-01',guests:20,lines:[{name:'Meal',qty:'20',cents:10000}]},{actor:'owner',baseUrl:'https://example.test'});assert.equal(result.ok,false);assert.equal(calls,0);assert.equal(env.DB.one('SELECT count(*) AS n FROM catering_quote_revisions').n,0);}finally{globalThis.fetch=original;}
});
test('uncertain quote send blocks duplicate retirement before any provider effect',async()=>{
 const {retireDuplicateQuote}=await import('../../functions/_lib/catering_quote_duplicates.js');
 const env=ownerEnv();await seedQuote(env);env.DB.exec(`UPDATE catering_quotes SET square_order_id='order_fixture',payment_link_id='link_fixture',quote_json='{"lead_id":"lead_fixture","lines":[{"name":"Meal","qty":"20","cents":10000}]}' WHERE id='q1';
 INSERT INTO catering_quotes(id,customer_name,customer_email,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,terms_version,terms_json,quote_json,square_order_id,payment_link_id,access_token,created_at,updated_at) VALUES('q2','Guest','guest@example.test','2027-01-01',20,10000,.5,5000,5000,'v1','{}','{"lead_id":"lead_fixture"}','order2','link2','22222222222222222222222222222222',1,1);
 INSERT INTO catering_quote_send_reviews(quote_id,claim_id,review_hash,expected_updated_at,state,created_at,updated_at) VALUES('q1','claim_fixture','${'a'.repeat(64)}',1,'unknown',1,1);`);
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No provider effects allowed');};
 try{assert.equal((await retireDuplicateQuote(env,{reviewed:true,quote_id:'q1',replacement_quote_id:'q2',expected_updated_at:1,expected_replacement_updated_at:1},{actor:'owner',baseUrl:'https://example.test'})).ok,false);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
