import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequest as ownerResolution} from '../../functions/api/hub/owner/delivery-resolution.js';
import {deliveryResolutionContext,resolveOwnerDelivery} from '../../functions/_lib/owner_delivery_resolution.js';

const URL='https://anejo.test/api/hub/owner/delivery-resolution';
const NOW=Date.now();
let n=0;
function fixture(){
 const env=ownerEnv();
 env.DB.sqlite.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('stf_driver_test','Synthetic Driver','driver@test.example','driver',1,?,?)").run(NOW,NOW);
 return env;
}
function addOrder(env,id,status='paid',total=12500){
 env.DB.sqlite.prepare('INSERT INTO orders(id,customer_name,customer_email,items,delivery_date,total_estimate_cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
  .run(id,'Synthetic Guest','guest@test.example','[]','2026-10-31',total,status,NOW,NOW);
}
function addRoute(env,id,orders,{status='assigned',offer='accepted',total=25000}={}){
 env.DB.sqlite.prepare('INSERT INTO routes(id,driver_id,route_date,stop_count,status,offer_status,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,NULL)')
  .run(id,'stf_driver_test','2026-10-31',orders.length,status,offer,NOW,NOW);
 for(let i=0;i<orders.length;i++) env.DB.sqlite.prepare("INSERT INTO route_stops(id,route_id,order_id,seq,status,created_at,updated_at) VALUES(?,?,?,?, 'pending',?,?)")
  .run('stop_'+orders[i],id,orders[i],i+1,NOW,NOW);
 env.DB.sqlite.prepare('UPDATE orders SET total_estimate_cents=? WHERE id IN ('+orders.map(()=>'?').join(',')+')').run(total,...orders);
}
function request(body=null,{cookie=OWNER_COOKIE,method=body?'POST':'GET',origin}={}){
 const headers={};if(cookie)headers.Cookie=cookie;if(body)headers['Content-Type']='application/json';if(origin)headers.Origin=origin;
 return new Request(URL,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
async function get(env,scope){return ownerResolution({env,request:new Request(URL+(scope?'?'+new URLSearchParams(scope):''),{headers:{Cookie:OWNER_COOKIE}})});}
async function post(env,body,options={}){return ownerResolution({env,request:request(body,options)});}
async function confirmedBody(env,scope,extra={}){
 const c=await deliveryResolutionContext(env,scope);assert.equal(c.ok,true,JSON.stringify(c));
 return {...scope,snapshot_hash:c.snapshot_hash,request_id:`synthetic_req_${String(++n).padStart(16,'0')}`,confirmed:true,reason:'Owner verified completed delivery',on_time:null,occurred_at:null,...extra};
}
function close(env){env.DB.sqlite.close();}

test('route resolution returns a hash-bound snapshot with orders, stops, deliveries and history',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_test_snapshot');addRoute(env,'route_test_snapshot',['ord_test_snapshot']);
  env.DB.sqlite.prepare("INSERT INTO activity_log(id,event,actor_id,actor_role,actor_type,properties,created_at) VALUES('delivery_resolution_history_test','delivery.owner_confirmed','stf_owner','owner','human',?,?)").run(JSON.stringify({route_id:'route_test_snapshot',reason:'Synthetic earlier owner confirmation'}),NOW-1000);
  const res=await get(env,{route_id:'route_test_snapshot'}),out=await res.json();
  assert.equal(res.status,200);assert.equal(out.ok,true);assert.match(out.snapshot_hash,/^[a-f0-9]{64}$/);
  assert.equal(out.orders[0].id,'ord_test_snapshot');assert.equal(out.stops[0].order_id,'ord_test_snapshot');assert.deepEqual(out.deliveries,[]);assert.equal(out.history.length,1);assert.match(out.history[0].properties,/Synthetic earlier owner confirmation/);
  const bad=await get(env,{route_id:'route_test_snapshot',order_id:'ord_test_snapshot'});assert.equal(bad.status,400);
 }finally{close(env);}
});

test('orphan order resolution is allowed and unknown scope is rejected',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_test_orphan');const c=await deliveryResolutionContext(env,{order_id:'ord_test_orphan'});
  assert.equal(c.ok,true);assert.equal(c.route,null);assert.deepEqual(c.stops,[]);
  assert.equal((await deliveryResolutionContext(env,{order_id:'ord_absent'})).status,404);
 }finally{close(env);}
});

test('order-scoped resolution closes only that stop and leaves a multi-stop route active',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_test_one');addOrder(env,'ord_test_two');addRoute(env,'route_test_partial',['ord_test_one','ord_test_two']);
  const body=await confirmedBody(env,{order_id:'ord_test_one'}),r=await resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'});
  assert.equal(r.ok,true);assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_one').status,'fulfilled');
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_two').status,'paid');
  assert.equal(env.DB.one('SELECT status FROM route_stops WHERE order_id=?','ord_test_one').status,'done');
  assert.equal(env.DB.one('SELECT status FROM route_stops WHERE order_id=?','ord_test_two').status,'pending');
  assert.equal(env.DB.one('SELECT status FROM routes WHERE id=?','route_test_partial').status,'assigned');
  assert.equal(env.DB.one('SELECT stops_completed FROM routes WHERE id=?','route_test_partial').stops_completed,1);
 }finally{close(env);}
});

test('explicit occurrence time is retained and existing proof is never overwritten',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_test_proof');addRoute(env,'route_test_proof',['ord_test_proof']);
  env.DB.sqlite.prepare("INSERT INTO deliveries(id,order_id,route_id,driver_id,status,proof_photo,signature,on_time,completed_at,created_at,updated_at) VALUES('del_test_proof','ord_test_proof','route_test_proof','stf_driver_test','completed','synthetic-proof-ref','synthetic-signature-ref',1,12345,100,100)").run();
  const body=await confirmedBody(env,{route_id:'route_test_proof'},{on_time:false,occurred_at:23456});
  const r=await resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'});assert.equal(r.ok,true);
  const d=env.DB.one('SELECT * FROM deliveries WHERE id=?','del_test_proof');
  assert.equal(d.proof_photo,'synthetic-proof-ref');assert.equal(d.signature,'synthetic-signature-ref');assert.equal(d.completed_at,12345);assert.equal(d.on_time,1);
  const stop=env.DB.one('SELECT delivered_at FROM route_stops WHERE route_id=?','route_test_proof');assert.equal(stop.delivered_at,23456);
 }finally{close(env);}
});

test('unknown occurrence time remains NULL; no proof or completion time is invented',async()=>{
 const env=fixture();try{
  addOrder(env,'ord_test_unknown_time');addRoute(env,'route_test_unknown_time',['ord_test_unknown_time']);
  const r=await resolveOwnerDelivery(env,await confirmedBody(env,{route_id:'route_test_unknown_time'}),{distinct_id:'stf_owner'});assert.equal(r.ok,true);assert.equal(r.occurred_at,null);
  const d=env.DB.one('SELECT completed_at,proof_photo,signature,proof_skipped FROM deliveries WHERE order_id=?','ord_test_unknown_time');
  assert.equal(d.completed_at,null);assert.equal(d.proof_photo,null);assert.equal(d.signature,null);assert.equal(d.proof_skipped,1);
  const route=env.DB.one('SELECT status,completed_at FROM routes WHERE id=?','route_test_unknown_time');assert.equal(route.status,'completed');assert.equal(route.completed_at,null);
 }finally{close(env);}
});

test('unpaid, canceled, refunded orders and closed routes are rejected without mutations',async()=>{
 for(const status of ['pending','canceled','refunded']){
  const env=fixture();try{addOrder(env,'ord_test_block_'+status,status);addRoute(env,'route_test_block_'+status,['ord_test_block_'+status]);const before=env.DB.one('SELECT status,updated_at,total_estimate_cents FROM orders WHERE id=?','ord_test_block_'+status);const c=await deliveryResolutionContext(env,{order_id:'ord_test_block_'+status});assert.equal(c.ok,false);
   const out=await resolveOwnerDelivery(env,{...(await confirmedBody(env,{order_id:'ord_test_block_'+status}).catch(()=>({order_id:'ord_test_block_'+status}))),confirmed:true,reason:'Owner confirmed by review',request_id:`synthetic_block_${status}_00001`,snapshot_hash:'a'.repeat(64),on_time:null,occurred_at:null},{distinct_id:'stf_owner'});
   assert.equal(out.ok,false);assert.deepEqual(env.DB.one('SELECT status,updated_at,total_estimate_cents FROM orders WHERE id=?','ord_test_block_'+status),before);assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,0);
  }finally{close(env);}
 }
 for(const status of ['completed','canceled']){const env=fixture();try{addOrder(env,'ord_test_closed_'+status);addRoute(env,'route_test_closed_'+status,['ord_test_closed_'+status],{status});const c=await deliveryResolutionContext(env,{route_id:'route_test_closed_'+status});assert.equal(c.ok,false);assert.equal(c.status,409);}finally{close(env);}}
});

test('confirmation, reason, time and request input are validated',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_validation');addRoute(env,'route_test_validation',['ord_test_validation']);const valid=await confirmedBody(env,{route_id:'route_test_validation'});
  for(const patch of [{confirmed:false},{reason:'short'},{reason:'x'.repeat(1001)},{request_id:'short'},{snapshot_hash:'not-hash'},{on_time:'yes'},{occurred_at:Date.now()+600000},{occurred_at:1.5}]){const out=await resolveOwnerDelivery(env,{...valid,...patch},{distinct_id:'stf_owner'});assert.equal(out.ok,false,JSON.stringify(patch));}
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_validation').status,'paid');assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,0);
 }finally{close(env);}
});

test('endpoint requires owner auth, rejects cross-origin POST, supports GET preview and valid POST',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_endpoint');addRoute(env,'route_test_endpoint',['ord_test_endpoint']);
  assert.ok([401,403].includes((await post(env,{confirmed:true},{cookie:'anejo_sess=tok-kitchen'})).status));
  assert.equal((await ownerResolution({env,request:request(null,{method:'GET',cookie:'anejo_sess=tok-kitchen'})})).status,403);
  assert.equal((await post(env,{confirmed:true},{origin:'https://attacker.test'})).status,403);
  const preview=await get(env,{route_id:'route_test_endpoint'});assert.equal((await preview.json()).ok,true);
  const body=await confirmedBody(env,{route_id:'route_test_endpoint'}),r=await post(env,body);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
 }finally{close(env);}
});

test('idempotent retry returns the saved result; request reuse with changed details conflicts',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_retry');addRoute(env,'route_test_retry',['ord_test_retry']);const body=await confirmedBody(env,{route_id:'route_test_retry'});
  const first=await resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'});const retry=await resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'});assert.equal(retry.ok,true);assert.equal(retry.already,true);assert.equal(retry.audit_id,first.audit_id);
  assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,1);
  const reuse=await resolveOwnerDelivery(env,{...body,reason:'Different reason for same key'},{distinct_id:'stf_owner'});assert.equal(reuse.ok,false);assert.equal(reuse.status,409);
 }finally{close(env);}
});

test('stale snapshot causes no mutations',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_stale');addRoute(env,'route_test_stale',['ord_test_stale']);const body=await confirmedBody(env,{route_id:'route_test_stale'});env.DB.sqlite.prepare('UPDATE orders SET updated_at=updated_at+1 WHERE id=?').run('ord_test_stale');
  const out=await resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'});assert.equal(out.ok,false);assert.equal(out.status,409);
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_stale').status,'paid');assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,0);
 }finally{close(env);}
});

test('audit insert failure rolls back all delivery mutations',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_audit_fail');addRoute(env,'route_test_audit_fail',['ord_test_audit_fail']);const body=await confirmedBody(env,{route_id:'route_test_audit_fail'});
  env.DB.sqlite.exec("CREATE TRIGGER reject_resolution_audit BEFORE INSERT ON activity_log WHEN NEW.event='delivery.owner_confirmed' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
  await assert.rejects(()=>resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'}));
  assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_audit_fail').status,'paid');assert.equal(env.DB.one('SELECT status FROM route_stops WHERE route_id=?','route_test_audit_fail').status,'pending');assert.equal(env.DB.one('SELECT status FROM routes WHERE id=?','route_test_audit_fail').status,'assigned');assert.equal(env.DB.one('SELECT count(*) n FROM deliveries WHERE order_id=?','ord_test_audit_fail').n,0);
 }finally{close(env);}
});

test('intermediate SQL failure rolls back audit, order, stop, delivery and route changes',async()=>{
 const env=fixture();try{addOrder(env,'ord_test_sql_fail');addRoute(env,'route_test_sql_fail',['ord_test_sql_fail']);const body=await confirmedBody(env,{route_id:'route_test_sql_fail'});
  env.DB.sqlite.exec("CREATE TRIGGER reject_order_update BEFORE UPDATE ON orders WHEN OLD.id='ord_test_sql_fail' BEGIN SELECT RAISE(ABORT,'synthetic order failure'); END");
  await assert.rejects(()=>resolveOwnerDelivery(env,body,{distinct_id:'stf_owner'}));
  assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,0);assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?','ord_test_sql_fail').status,'paid');assert.equal(env.DB.one('SELECT status FROM route_stops WHERE route_id=?','route_test_sql_fail').status,'pending');assert.equal(env.DB.one('SELECT status FROM routes WHERE id=?','route_test_sql_fail').status,'assigned');assert.equal(env.DB.one('SELECT count(*) n FROM deliveries WHERE order_id=?','ord_test_sql_fail').n,0);
 }finally{close(env);}
});

test('resolution is local-only and leaves order/route money unchanged',async()=>{
 const env=fixture(),realFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('provider/network call forbidden in synthetic test');};
 try{addOrder(env,'ord_test_local_only','paid',48321);addRoute(env,'route_test_local_only',['ord_test_local_only'],{total:48321});const before={order:env.DB.one('SELECT total_estimate_cents FROM orders WHERE id=?','ord_test_local_only'),route:env.DB.one('SELECT pay_cents,total_miles_est FROM routes WHERE id=?','route_test_local_only')};const body=await confirmedBody(env,{route_id:'route_test_local_only'});const response=await post(env,body);const out=await response.json();assert.equal(response.status,200);assert.equal(out.ok,true);assert.equal(calls,0);assert.deepEqual(env.DB.one('SELECT total_estimate_cents FROM orders WHERE id=?','ord_test_local_only'),before.order);assert.deepEqual(env.DB.one('SELECT pay_cents,total_miles_est FROM routes WHERE id=?','route_test_local_only'),before.route);
  const audit=env.DB.one("SELECT actor_id,actor_role,actor_type,properties FROM activity_log WHERE event='delivery.owner_confirmed'");const props=JSON.parse(audit.properties);assert.equal(audit.actor_id,'stf_owner');assert.equal(audit.actor_role,'owner');assert.equal(audit.actor_type,'human');assert.equal(props.reason,body.reason);assert.equal(props.occurred_at,null);assert.equal(props.client_notifications_sent,false);assert.equal(props.money_changed,false);assert.equal(props.proof_supplied,false);assert.ok(props.recorded_at);assert.equal(props.previous_route_status,'assigned');assert.equal(props.request_hash.length,64);
 }finally{globalThis.fetch=realFetch;close(env);}
});
