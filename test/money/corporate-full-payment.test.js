import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost} from '../../functions/api/webhooks/square.js';
async function run({amount=42800,currency='USD',due=0,tip=0,fetchStatus=200,missing=false,corporate=true,throws=false}={}){
 const writes=[],queries=[],fetches=[];const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{fetches.push({url,options});if(throws)throw Error('offline');return new Response(JSON.stringify(missing?{}:{order:{id:'sq-test',state:'OPEN',total_money:{amount:42800+tip,currency:'USD'},total_tip_money:{amount:tip,currency:'USD'},net_amount_due_money:{amount:due,currency:'USD'}}}),{status:fetchStatus});};
 const env={SQUARE_ACCESS_TOKEN:'test-only',DB:{prepare(sql){queries.push(sql);return {bind(){return this;},async first(){if(sql==='SELECT items FROM orders WHERE square_order_id=? LIMIT 1')return {items:JSON.stringify([{id:'daily_lunch_papa',qty:40,corporate_lunch:corporate}])};return null;},async run(){writes.push(sql);return {meta:{changes:0}};},async all(){return {results:[]};}};}}};
 try{const request=new Request('https://example.com/api/webhooks/square',{method:'POST',body:JSON.stringify({type:'payment.updated',data:{object:{payment:{id:'p',order_id:'sq-test',status:'COMPLETED',amount_money:{amount,currency},tip_money:{amount:tip,currency:'USD'}}}}})});const response=await onRequestPost({request,env});return {status:response.status,text:await response.text(),writes,queries,fetches};}finally{globalThis.fetch=original;}
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
