import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../../functions/api/webhooks/square.js';
async function run({amount=42800,currency='USD',due=0,tip=0,fetchStatus=200,missing=false,corporate=true,throws=false,deadline=Date.now()+3600000,updatedAt,alertFails=false}={}){
 const writes=[],queries=[],fetches=[];const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{fetches.push({url,options});if(throws)throw Error('offline');return new Response(JSON.stringify(missing?{}:{order:{id:'sq-test',state:'OPEN',total_money:{amount:42800+tip,currency:'USD'},total_tip_money:{amount:tip,currency:'USD'},net_amount_due_money:{amount:due,currency:'USD'}}}),{status:fetchStatus});};
 const env={SQUARE_ACCESS_TOKEN:'test-only',DB:{prepare(sql){queries.push(sql);return {bind(){return this;},async first(){if(sql==='SELECT id, items FROM orders WHERE square_order_id=? LIMIT 1')return {id:'o-test',items:JSON.stringify([{id:'daily_lunch_papa',qty:40,corporate_lunch:corporate,corporate_payment_deadline_at:deadline}])};return null;},async run(){if(alertFails&&sql.startsWith('INSERT INTO alerts'))throw Error('failed alert');writes.push(sql);return {meta:{changes:0}};},async all(){return {results:[]};}};}}};
 try{const request=new Request('https://example.com/api/webhooks/square',{method:'POST',body:JSON.stringify({type:'payment.updated',data:{object:{payment:{id:'p',order_id:'sq-test',status:'COMPLETED',updated_at:updatedAt,amount_money:{amount,currency},tip_money:{amount:tip,currency:'USD'}}}}})});const response=await onRequestPost({request,env});return {status:response.status,text:await response.text(),writes,queries,fetches};}finally{globalThis.fetch=original;}
}
test('corporate partial captured payments cannot mark paid or reach benefit/notification paths',async()=>{
 for(const options of [{amount:10000,due:32800},{amount:10000,due:0},{currency:'EUR'},{amount:42800.5}]){
  const r=await run(options);assert.equal(r.status,200);assert.match(r.text,/not verified/);assert.equal(r.writes.length,0);assert.equal(r.queries.length,1);assert.equal(r.fetches.length,1);
 }
});
test('corporate full payment including optional separate tip permits existing paid transition',async()=>{
 for(const tip of [0,500]){const r=await run({tip});assert.equal(r.status,200);assert.ok(r.writes.some(sql=>sql.startsWith("UPDATE orders SET status='paid'")));assert.match(r.fetches[0].url,/squareupsandbox.com\/v2\/orders\/sq-test$/);assert.equal(r.fetches[0].options.method,'GET');}
});
test('corporate provider failure or missing proof requests retry before any mutation',async()=>{
 for(const options of [{fetchStatus:503},{missing:true},{throws:true},{due:42800}]){const r=await run(options);assert.equal(r.status,503);assert.equal(r.writes.length,0);assert.equal(r.queries.length,1);}
});
test('noncorporate paid orders preserve existing webhook behavior without extra Square request',async()=>{
 const r=await run({corporate:false});assert.equal(r.status,200);assert.equal(r.fetches.length,0);assert.ok(r.writes.some(sql=>sql.startsWith("UPDATE orders SET status='paid'")));
});

test('late corporate payment holds kitchen and raises owner review alert, never customer benefits',async()=>{
 const r=await run({deadline:Date.now()-3600000});assert.equal(r.status,200);assert.match(r.text,/held for owner review/);assert.ok(r.writes.some(s=>s.startsWith('INSERT INTO alerts')));assert.equal(r.writes.some(s=>s.startsWith("UPDATE orders SET status='paid'")),false);assert.equal(r.queries.some(s=>s.includes('promo_code')||s.includes('notifications')),false);
 const failed=await run({deadline:Date.now()-3600000,alertFails:true});assert.equal(failed.status,503);assert.equal(failed.writes.some(s=>s.startsWith("UPDATE orders SET status='paid'")),false);
});
test('timely signed capture can replay late, while missing timestamps use conservative receipt time',async()=>{
 const deadline=Date.now()-3600000;
 const timely=await run({deadline,updatedAt:new Date(deadline-1000).toISOString()});assert.equal(timely.status,200);assert.ok(timely.writes.some(s=>s.startsWith("UPDATE orders SET status='paid'")));
 for(const updatedAt of [undefined,'invalid',new Date(Date.now()+86400000).toISOString()]){const late=await run({deadline,updatedAt});assert.match(late.text,/held for owner review/);assert.equal(late.writes.some(s=>s.startsWith("UPDATE orders SET status='paid'")),false);}
 const missing=await run({deadline:null});assert.equal(missing.status,503);assert.equal(missing.writes.length,0);
});
