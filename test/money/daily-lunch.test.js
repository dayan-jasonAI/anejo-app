import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dailyDay,validateDailyConfig,validateDailyOrder,dailyFeeCents,isoDate} from '../../functions/_lib/daily_lunch.js';
import {DEFAULTS} from '../../functions/_lib/operating.js';
import {onRequestPost} from '../../functions/api/checkout.js';
const migration=readFileSync(new URL('../../migrations/0140_daily_lunch.sql',import.meta.url),'utf8');
const seed=JSON.parse(migration.match(/VALUES \(1,'(.*)',1,0,/s)[1].replaceAll("''","'"));
const config=()=>structuredClone(seed);
function db(c, writes=[]){return {prepare(sql){let args;return {bind(...a){args=a;return this;},async first(){if(sql.includes('daily_lunch_config'))return {config_json:JSON.stringify(c),version:1};return null;},async all(){return {results:[]};},async run(){writes.push({sql,args});return {meta:{changes:1}};}};}};}
test('seed contains four editable meals, explicit dates and approved cutoffs; no fabricated images',()=>{
 const c=validateDailyConfig(seed);assert.equal(c.products.length,4);const approved={fried_rice:'83405ac8546e83b0a2c589c0b46c36e951c7a09a1c3a1212c4559e0aeddaca62',chicken_quesadillas:'b0bd634d551215774e89d600b60ee7f5381e8912dc63817318e18edf841d90da',papa:'a574e4247f2af060478adc1584e538cc54c510b26e05262bb7f52e5da4e4c891',pechuguitas:'de1d86e39d763a86cac17e6ef018713429858678fdce6e6d70cfe92521053ea4'};for(const p of c.products){assert.equal(createHash('sha256').update(readFileSync(new URL('../../public'+p.image_url,import.meta.url))).digest('hex'),approved[p.id]);}assert.deepEqual(c.settings,{same_day_cutoff:'11:00',preorder_cutoff:'19:00'});
});
test('same-day cutoff and prior-day cutoff use ET including strict boundary',()=>{
 const c=config();assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-10-01T14:59:00Z')).orderable,true);
 assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-10-01T15:00:00Z')).reason,'same_day_cutoff');
 assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-09-30T22:59:00Z')).free_delivery,true);
 assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-09-30T23:00:00Z')).reason,'preorder_cutoff');
});
test('explicit assignments and service closures prevail over weekday defaults',()=>{
 const c=config();assert.equal(dailyDay(c,'2026-10-05',DEFAULTS,new Date('2026-09-30T12:00Z')).reason,'not_scheduled');
 assert.equal(dailyDay(c,'2026-10-01',{...DEFAULTS,closed_dates:'2026-10-01'},new Date('2026-09-30T12:00Z')).reason,'closed');
 c.dates[3].sold_out=true;assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-09-30T12:00Z')).reason,'sold_out');
 c.dates[3].sold_out=false;c.dates[3].enabled=false;assert.equal(dailyDay(c,'2026-10-01',DEFAULTS,new Date('2026-09-30T12:00Z')).reason,'not_scheduled');
 assert.equal(dailyDay(c,'2026-09-28',DEFAULTS,new Date('2026-09-30T12:00Z')).reason,'past');
});
test('real dates, safe image paths and duplicate schedules are validated',()=>{
 assert.equal(isoDate('2026-02-30'),false);assert.equal(isoDate('2026-02-28'),true);
 for(const image of ['https://example.com/a.jpg','//evil/a','/a/../b','/a?q=x']){const c=config();c.products[0].image_url=image;assert.throws(()=>validateDailyConfig(c));}
 const c=config();c.dates.push(c.dates[0]);assert.throws(()=>validateDailyConfig(c));
});
test('same-day fee honors configured zero and rejects corrupt fees',()=>{
 assert.equal(dailyFeeCents({DELIVERY_FEE_USD:'0'}),0);assert.equal(dailyFeeCents({DELIVERY_FEE_USD:'6.25'}),625);assert.equal(dailyFeeCents({}),500);assert.throws(()=>dailyFeeCents({DELIVERY_FEE_USD:'bad'}));
});
test('server validation rejects mixed cart, wrong product, fractional qty and unavailable storage',async()=>{
 const env={DB:db(seed)};const at=new Date('2026-09-30T12:00Z');
 for(const items of [[{id:'daily_lunch_papa',qty:1},{id:'vida',qty:1}],[{id:'daily_lunch_fried_rice',qty:1}],[{id:'daily_lunch_papa',qty:1.1}]]) await assert.rejects(()=>validateDailyOrder(env,items,'2026-10-01',at));
 await assert.rejects(()=>validateDailyOrder({},[{id:'daily_lunch_papa',qty:1}],'2026-10-01',at));
});
test('actual checkout sends $10 single lunch and correct same-day/preorder fee to Square, persists kitchen snapshot',async()=>{
 const RealDate=Date, realFetch=globalThis.fetch;let clock;
 globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return new RealDate(clock).getTime();}};
 try{for(const [at,date,expectedFee] of [['2026-10-01T14:00:00Z','2026-10-01',625],['2026-09-30T12:00:00Z','2026-10-01',0]]){
  clock=at;const writes=[];let sent;
  globalThis.fetch=async(url,opts)=>{assert.match(String(url),/squareupsandbox/);sent=JSON.parse(opts.body);return new Response(JSON.stringify({payment_link:{id:'p',order_id:'o',url:'https://example.com/pay'}}));};
  const env={DB:db(seed,writes),SQUARE_ACCESS_TOKEN:'test-only',SQUARE_LOCATION_ID:'test-only',DELIVERY_FEE_USD:'6.25'};
  const request=new Request('https://example.com/api/checkout',{method:'POST',body:JSON.stringify({items:[{id:'daily_lunch_papa',qty:1,price_cents:1}],daily_lunch:{date},fulfillment:{mode:'scheduled'},free_delivery:true,address:{street:'1 Main St',city:'West Palm Beach',zip:'33401'},contact:{first_name:'Test'}})});
  const response=await onRequestPost({request,env});assert.equal(response.status,200,await response.clone().text());
  assert.equal(sent.order.line_items[0].base_price_money.amount,1000);assert.equal(sent.order.service_charges?.[0]?.amount_money.amount||0,expectedFee);
  const saved=writes.find(w=>w.sql.includes('INSERT INTO orders'));assert.ok(saved);const item=JSON.parse(saved.args[3])[0];assert.equal(item.service_date,date);assert.equal(item.daily_lunch,true);assert.equal(saved.args[4],date);assert.equal(saved.args[5],'lunch');assert.equal(saved.args[8],expectedFee);
 }}finally{globalThis.Date=RealDate;globalThis.fetch=realFetch;}
});

test('DST uses Eastern wall-clock, no server UTC cutoff assumption',()=>{
 const c=config();c.dates=[{date:'2026-11-02',product_id:'papa',enabled:true,sold_out:false}];
 assert.equal(dailyDay(c,'2026-11-02',DEFAULTS,new Date('2026-11-02T15:59:00Z')).orderable,true);
 assert.equal(dailyDay(c,'2026-11-02',DEFAULTS,new Date('2026-11-02T16:00:00Z')).reason,'same_day_cutoff');
});

test('public endpoint returns seven dated days, no-store and fails closed without DB',async()=>{
 const {onRequestGet}=await import('../../functions/api/daily-lunch.js');
 const req=new Request('https://example.com/api/daily-lunch?start=2026-09-28');
 const res=await onRequestGet({request:req,env:{DB:db(seed)}});assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 const b=await res.json();assert.equal(b.days.length,7);assert.equal(b.days[0].product_id,'fried_rice');assert.equal(b.windows.lunch_start,'11:00');assert.equal(b.days[4].reason,'not_scheduled');
 assert.equal((await onRequestGet({request:req,env:{}})).status,503);
});
test('owner endpoint rejects nonowners and conflicts, persists validated config with audit actor',async()=>{
 const {onRequestPost:post}=await import('../../functions/api/hub/owner/daily-lunch.js');
 for(const [role,changes,status] of [['marketing',1,403],['owner',0,409],['owner',1,200]]){
 let saved;
 const env={SESSIONS:{async get(){return JSON.stringify({type:'staff',uid:'s',role,la:Date.now()});}},DB:{prepare(sql){let args;return {bind(...a){args=a;return this;},async first(){return {id:'s',email:'owner@example.com',role,active:1};},async run(){saved={sql,args};return {meta:{changes}};}};}}};
 const request=new Request('https://example.com/api/hub/owner/daily-lunch',{method:'POST',headers:{Cookie:'anejo_sess=test'},body:JSON.stringify({version:1,config:seed})});
 const response=await post({request,env});assert.equal(response.status,status);
 if(status===200){assert.match(saved.sql,/WHERE id=1 AND version=\?/);assert.equal(saved.args[2],'owner@example.com');assert.equal(saved.args[3],1);assert.equal((await response.json()).version,2);}
 if(status===403)assert.equal(saved,undefined);
 }
});

test('daily lunch never exposes a payable URL when kitchen ticket persistence fails; receipt failure remains nonblocking',async()=>{
 const RealDate=Date, realFetch=globalThis.fetch;
 globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-30T12:00:00Z']));}static now(){return new RealDate('2026-09-30T12:00:00Z').getTime();}};
 try{for(const failOrder of [true,false]){
  const source=db(seed);let squareCalls=0, durable=false;
  const env={SQUARE_ACCESS_TOKEN:'test',SQUARE_LOCATION_ID:'test',DB:{prepare(sql){const q=source.prepare(sql);if(sql.includes('INSERT INTO orders'))q.run=async()=>{if(failOrder)throw Error('write failed');durable=true;return {meta:{changes:1}};};if(sql.includes('order_receipt'))q.run=async()=>{throw Error('receipt unavailable');};return q;}}};
  globalThis.fetch=async()=>{squareCalls++;return new Response(JSON.stringify({payment_link:{id:'p',order_id:'o',url:'https://example.com/pay'}}));};
  const request=new Request('https://example.com/api/checkout',{method:'POST',body:JSON.stringify({items:[{id:'daily_lunch_papa',qty:1}],daily_lunch:{date:'2026-10-01'},address:{street:'1 Main St',city:'West Palm Beach',zip:'33401'},contact:{first_name:'Test'}})});
  const response=await onRequestPost({request,env});const body=await response.json();assert.equal(squareCalls,1);assert.equal(durable,!failOrder);assert.equal(response.status,failOrder?503:200);if(failOrder)assert.equal(body.url,undefined);else assert.equal(body.url,'https://example.com/pay');
 }}finally{globalThis.Date=RealDate;globalThis.fetch=realFetch;}
});

test('daily operating read rejects an explicit DB failure even if results exists',async()=>{
 const env={DB:{prepare(_sql){return {async first(){return {config_json:JSON.stringify(seed),version:1};},async all(){return {success:false,results:[]};}};}}};
 await assert.rejects(()=>validateDailyOrder(env,[{id:'daily_lunch_papa',qty:1}],'2026-10-01',new Date('2026-09-30T12:00Z')),/Operating settings unavailable/);
});
