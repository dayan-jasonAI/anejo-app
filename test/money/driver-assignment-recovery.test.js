import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {findDriverRoute,pendingDriverOffers} from '../../functions/_lib/driver_routes.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/driver/route.js';
import {onRequestPost as createOwnerRoute} from '../../functions/api/hub/owner/routes.js';
import {onRequestPost as offersTick} from '../../functions/api/hub/admin/offers-tick.js';
import {today} from '../../functions/_lib/hub.js';

const BASE='https://anejo.test';
const NOW=Date.now();
const close=env=>env.DB.sqlite.close();
function fixture({drivers=['a','b']}={}){
 const env=ownerEnv();
 for(const key of drivers){
  const id='stf_driver_'+key,token='tok-driver-'+key;
  env.DB.sqlite.prepare('INSERT INTO staff(id,name,email,role,active,phone,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)')
   .run(id,'Synthetic Driver '+key,key+'@test.example','driver','+15550000'+(key==='a'?'01':'02'),NOW,NOW);
  env.SESSIONS.store.set('session:'+token,JSON.stringify({type:'staff',role:'driver',uid:id,email:key+'@test.example',la:NOW,created:NOW}));
 }
 return env;
}
function addOrder(env,id,{status='paid',total=1200,date='2026-10-31'}={}){
 env.DB.sqlite.prepare('INSERT INTO orders(id,customer_name,customer_email,items,delivery_date,status,total_estimate_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(id,'Synthetic Guest','guest@test.example','[]',date,status,total,NOW,NOW);
}
function addRoute(env,id,driverKey,{date='2026-10-31',status='assigned',offer='pending',mode='manual',offeredAt=NOW-600000,stops=[],created=NOW}={}){
 env.DB.sqlite.prepare('INSERT INTO routes(id,driver_id,route_date,stop_count,status,offer_status,offered_at,dispatch_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(id,'stf_driver_'+driverKey,date,stops.length,status,offer,offeredAt,mode,created,NOW);
 for(let i=0;i<stops.length;i++)env.DB.sqlite.prepare("INSERT INTO route_stops(id,route_id,order_id,seq,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)")
  .run('stop_'+stops[i],id,stops[i],i+1,NOW,NOW);
}
function request(path,{cookie=OWNER_COOKIE,method='GET',body=null,origin}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;
 return new Request(BASE+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
function driverCookie(key){return 'anejo_sess=tok-driver-'+key;}
function dget(env,key,path='/api/hub/driver/route'){return onRequestGet({env,request:request(path,{cookie:driverCookie(key)})});}
function dpost(env,key,body){return onRequestPost({env,request:request('/api/hub/driver/route',{cookie:driverCookie(key),method:'POST',body})});}

test('migration adds automatic default while explicit route assignment persists manual mode and in-app notice',async()=>{
 const env=fixture();const waiting=[];let fetchCalls=0,sawMessageBeforeProvider=false;const original=globalThis.fetch;globalThis.fetch=async()=>{fetchCalls++;sawMessageBeforeProvider=env.DB.one("SELECT count(*) n FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.staff_id='stf_driver_a' AND m.channel='in_app'").n===1;throw new Error('synthetic provider failure');};
 try{
  assert.equal(env.DB.one("SELECT dflt_value FROM pragma_table_info('routes') WHERE name='dispatch_mode'").dflt_value,"'automatic'");
  addOrder(env,'ord_synth_manual');
  env.TWILIO_ACCOUNT_SID='test-sid';env.TWILIO_AUTH_TOKEN='test-token';env.TWILIO_FROM='+15550000000';
  const response=await createOwnerRoute({env,waitUntil:p=>waiting.push(p),request:request('/api/hub/owner/routes',{method:'POST',body:{driver_id:'stf_driver_a',route_date:'2026-10-31',order_ids:['ord_synth_manual']}})});
  const out=await response.json();assert.equal(response.status,200,JSON.stringify(out));assert.equal(out.offer_status,'pending');
  const route=env.DB.one('SELECT id,driver_id,dispatch_mode,offer_status FROM routes WHERE id=?',out.id);assert.equal(route.driver_id,'stf_driver_a');assert.equal(route.dispatch_mode,'manual');assert.equal(route.offer_status,'pending');
  const msg=env.DB.one("SELECT m.channel,m.body,t.staff_id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.staff_id='stf_driver_a' ORDER BY m.created_at DESC LIMIT 1");
  assert.equal(msg.channel,'in_app');assert.equal(msg.staff_id,'stf_driver_a');assert.match(msg.body,/2026-10-31/);
  assert.equal(waiting.length,1,'provider work is handed to waitUntil');assert.equal(sawMessageBeforeProvider,true,'the durable in-app notice exists before provider I/O');
  await Promise.all(waiting);assert.equal(fetchCalls,1,'only the fake Twilio fetch was called and it failed');
  assert.equal(env.DB.one('SELECT count(*) n FROM messages WHERE channel=\'in_app\' AND body LIKE \'%ord_synth_manual%\'').n,0,'in-app notice contains no private order id');
  assert.equal(env.DB.one("SELECT count(*) n FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.channel='in_app' AND t.staff_id='stf_driver_a'").n,1,'failed SMS leaves the persisted notice intact');
 }finally{globalThis.fetch=original;close(env);}
});

test('historical and future pending offers are visible only to assigned driver and can be explicitly selected',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_synth_hist');addOrder(env,'ord_synth_future',{date:'2030-01-01'});
  addRoute(env,'route_synth_hist','a',{date:'2026-10-31',stops:['ord_synth_hist'],mode:'manual'});
  addRoute(env,'route_synth_future','a',{date:'2030-01-01',stops:['ord_synth_future'],mode:'manual'});
  addRoute(env,'route_synth_started','a',{date:today(),status:'started',offer:'accepted',mode:'automatic'});
  const selected=await findDriverRoute(env,'stf_driver_a','route_synth_hist');assert.equal(selected.id,'route_synth_hist');
  const defaultRoute=await findDriverRoute(env,'stf_driver_a');assert.equal(defaultRoute.id,'route_synth_started','started route stays primary');
  const offers=await pendingDriverOffers(env,'stf_driver_a');assert.deepEqual(new Set(offers.map(x=>x.id)),new Set(['route_synth_hist','route_synth_future']));
  const response=await dget(env,'a','/api/hub/driver/route?route_id=route_synth_hist'),out=await response.json();assert.equal(response.status,200);assert.equal(out.route.id,'route_synth_hist');assert.equal(out.stops[0].order_id,'ord_synth_hist');
  const wrong=await(await dget(env,'b','/api/hub/driver/route?route_id=route_synth_hist')).json();assert.equal(wrong.route,null);assert.deepEqual(wrong.stops,[]);assert.ok(!wrong.offers.some(x=>x.id==='route_synth_hist'));
 }finally{close(env);}
});

test('explicit accept is ownership-bound, accepts pending manual route, and rejects closed route ids',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_synth_accept');addRoute(env,'route_synth_accept','a',{stops:['ord_synth_accept']});
  const wrong=await dpost(env,'b',{action:'accept',route_id:'route_synth_accept'});assert.equal(wrong.status,404);
  assert.equal(env.DB.one('SELECT offer_status FROM routes WHERE id=?','route_synth_accept').offer_status,'pending');
  const premature=await dpost(env,'a',{action:'start',route_id:'route_synth_accept'});assert.equal(premature.status,409,'a manual assignment must be accepted before starting');
  const accepted=await dpost(env,'a',{action:'accept',route_id:'route_synth_accept'});assert.equal(accepted.status,200);assert.equal((await accepted.json()).offer_status,'accepted');
  assert.equal(env.DB.one('SELECT offer_status FROM routes WHERE id=?','route_synth_accept').offer_status,'accepted');
  for(const status of ['completed','canceled']){
   addOrder(env,'ord_synth_closed_'+status);addRoute(env,'route_synth_closed_'+status,'a',{status,stops:['ord_synth_closed_'+status]});
   const get=await(await dget(env,'a','/api/hub/driver/route?route_id=route_synth_closed_'+status)).json();assert.equal(get.route,null);
   for(const action of ['accept','start']){const res=await dpost(env,'a',{action,route_id:'route_synth_closed_'+status});assert.equal(res.status,404);}
  }
 }finally{close(env);}
});

test('declining owner-selected manual offer retains assignment and raises owner review instead of rotating',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_synth_decline');addRoute(env,'route_synth_decline','a',{stops:['ord_synth_decline'],mode:'manual'});
  const res=await dpost(env,'a',{action:'decline',route_id:'route_synth_decline'}),out=await res.json();assert.equal(res.status,200,JSON.stringify(out));
  assert.equal(out.declined,true);assert.equal(out.reoffered,false);
  const route=env.DB.one('SELECT driver_id,dispatch_mode,offer_status FROM routes WHERE id=?','route_synth_decline');assert.equal(route.driver_id,'stf_driver_a');assert.equal(route.dispatch_mode,'manual');assert.equal(route.offer_status,'declined');
  assert.equal(env.DB.one("SELECT count(*) n FROM route_offers WHERE route_id=? AND driver_id='stf_driver_a' AND outcome='declined'",'route_synth_decline').n,1);
  assert.equal(env.DB.one("SELECT count(*) n FROM alerts WHERE ref_type='route' AND ref_id=? AND status='open'",'route_synth_decline').n,1);
 }finally{close(env);}
});

test('timeout sweep rotates only expired automatic offers for today',async()=>{
 const env=fixture();try{
  const day=today(),prev=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10),future=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  addOrder(env,'ord_synth_timeout_manual');addOrder(env,'ord_synth_timeout_old_auto');addOrder(env,'ord_synth_timeout_future_auto');
  addRoute(env,'route_synth_timeout_manual','a',{date:prev,mode:'manual',offeredAt:NOW-3600000,stops:['ord_synth_timeout_manual']});
  addRoute(env,'route_synth_timeout_old_auto','a',{date:prev,mode:'automatic',offeredAt:NOW-3600000,stops:['ord_synth_timeout_old_auto']});
  addRoute(env,'route_synth_timeout_future_auto','a',{date:future,mode:'automatic',offeredAt:NOW-3600000,stops:['ord_synth_timeout_future_auto']});
  addOrder(env,'ord_synth_timeout_today');addRoute(env,'route_synth_timeout_today','a',{date:day,mode:'automatic',offeredAt:NOW-3600000,stops:['ord_synth_timeout_today']});
  const response=await offersTick({env,request:request('/api/hub/admin/offers-tick',{method:'POST',cookie:OWNER_COOKIE})});assert.equal(response.status,200);
  const manual=env.DB.one('SELECT driver_id,offer_status FROM routes WHERE id=?','route_synth_timeout_manual');assert.equal(manual.driver_id,'stf_driver_a');assert.equal(manual.offer_status,'pending');
  for(const id of ['route_synth_timeout_old_auto','route_synth_timeout_future_auto']){const r=env.DB.one('SELECT driver_id,offer_status FROM routes WHERE id=?',id);assert.equal(r.driver_id,'stf_driver_a');assert.equal(r.offer_status,'pending');}
  const rotated=env.DB.one('SELECT driver_id,offer_status FROM routes WHERE id=?','route_synth_timeout_today');assert.equal(rotated.driver_id,'stf_driver_b');assert.equal(rotated.offer_status,'pending');
 }finally{close(env);}
});

test('conditional accept update does not report success if ownership changes after selection',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_synth_race');addRoute(env,'route_synth_race','a',{stops:['ord_synth_race']});
  env.DB.sqlite.exec("CREATE TRIGGER synthetic_stale_accept BEFORE UPDATE OF offer_status ON routes WHEN OLD.id='route_synth_race' AND NEW.offer_status='accepted' BEGIN SELECT RAISE(IGNORE); END");
  const res=await dpost(env,'a',{action:'accept',route_id:'route_synth_race'}),body=await res.json();
  assert.notEqual(body.ok,true,'a conditional update that changes zero rows must not be reported as accepted');
  assert.equal(env.DB.one('SELECT offer_status FROM routes WHERE id=?','route_synth_race').offer_status,'pending');
  assert.equal(env.DB.one("SELECT count(*) n FROM route_offers WHERE route_id=? AND outcome='accepted'",'route_synth_race').n,0);
 }finally{close(env);}
});

test('manual offer persistence is independent from deferred hanging provider call',async()=>{
 const env=fixture();const waiters=[];let calls=0;const original=globalThis.fetch;globalThis.fetch=()=>{calls++;return new Promise(()=>{});};
 try{
  addOrder(env,'ord_synth_hang');
  // The owner assignment endpoint is the real sendOffer caller; waitUntil must detach the provider promise.
  env.TWILIO_ACCOUNT_SID='test-sid';env.TWILIO_AUTH_TOKEN='test-token';env.TWILIO_FROM='+15550000000';
  const response=await createOwnerRoute({env,waitUntil:p=>waiters.push(p),request:request('/api/hub/owner/routes',{method:'POST',body:{driver_id:'stf_driver_b',route_date:'2026-10-31',order_ids:['ord_synth_hang']}})});
  const out=await response.json();assert.equal(response.status,200,JSON.stringify(out));assert.equal(waiters.length,1);
  const rows=env.DB.one("SELECT count(*) n FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.staff_id='stf_driver_b' AND m.channel='in_app'");assert.equal(rows.n,1);
  // Allow deferred notification code to start. It reaches only the fetch stub, which never resolves.
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);
 }finally{globalThis.fetch=original;close(env);}
});
