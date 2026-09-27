// Actual route handlers + signed staff sessions + migrated SQLite. This proves the HTTP API
// contract locally; it is not browser, Cloudflare deployment or live delivery acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost as executionPost,onRequestGet as executionGet} from '../../functions/api/hub/kitchen/event-execution.js';
import {onRequestPost as ownerPost,onRequestGet as ownerGet} from '../../functions/api/hub/owner/catering-assignment.js';
import {onRequestPost as driverPost,onRequestGet as driverGet} from '../../functions/api/hub/driver/catering.js';
import {etDateOf} from '../../functions/_lib/hub.js';

test('authenticated owner and driver HTTP handlers complete and reload catering lifecycle without sending',async(t)=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('Unexpected external request');});
 const env=ownerEnv();const ts=Date.now(),date=etDateOf(ts),quoteId='cq_api_fixture';
 env.DB.sqlite.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('stf_api_driver','Test driver','driver@test.example','driver',1,?,?)").run(ts,ts);
 await env.SESSIONS.put('session:tok-api-driver',JSON.stringify({type:'staff',role:'driver',uid:'stf_api_driver',email:'driver@test.example',la:ts,created:ts}));
 const DRIVER_COOKIE='anejo_sess=tok-api-driver';
 env.DB.sqlite.prepare(`INSERT INTO catering_quotes(id,customer_name,event_date,serving_time,address,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,terms_version,terms_json,quote_json,created_at,updated_at) VALUES(?,?,?,?,?,12,2000,0.5,1000,1000,'paid','paid','fixture','{}',?,?,?)`).run(quoteId,'API fixture',date,'19:00','Test address',JSON.stringify({lines:[{name:'Congri',qty:'12'},{name:'Lechon',qty:'12'}]}),ts,ts);
 const call=async(handler,path,cookie,body)=>{
  const request=new Request(`https://example.test${path}`,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const response=await handler({env,request});const data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.ok,true,JSON.stringify(data));return data;
 };
 const execPath='/api/hub/kitchen/event-execution';
 let e=await call(executionPost,execPath,OWNER_COOKIE,{quote_id:quoteId,op:'configure',expected_version:0,idempotency_key:'api-configure',delivery_mode:'staff_driver',travel_minutes:25,setup_minutes:15,handling_confirmed:true});
 let assignment=await call(ownerPost,'/api/hub/owner/catering-assignment',OWNER_COOKIE,{quote_id:quoteId,op:'assign',driver_id:'stf_api_driver',expected_version:0,expected_execution_version:e.execution.version,idempotency_key:'api-assignment'});
 assert.equal(assignment.actor_id,'stf_owner');
 for(const target of ['preparing','ready'])e=await call(executionPost,execPath,OWNER_COOKIE,{quote_id:quoteId,op:'transition',target_status:target,packing_confirmed:target==='ready',expected_version:e.execution.version,idempotency_key:`api-kitchen-${target}`});
 const list=await call(driverGet,`/api/hub/driver/catering?date=${date}`,DRIVER_COOKIE);
 assert.equal(list.assignments.length,1);assignment=list.assignments[0];assert.equal(assignment.execution.status,'ready');
 for(const [op,extra] of [['accept',{}],['confirm_pickup',{confirmed_line_keys:['l0','l1']}],['depart',{}],['arrive',{}],['complete',{handoff_confirmed:true}]]){
  assignment=await call(driverPost,'/api/hub/driver/catering',DRIVER_COOKIE,{assignment_id:assignment.assignment.id,op,expected_version:assignment.assignment.version,expected_execution_version:assignment.execution.version,idempotency_key:`api-driver-${op}`,...extra});
  assert.equal(assignment.actor_id,'stf_api_driver');assert.deepEqual(assignment.notifications,{enabled:false,sent:false});
 }
 const reloaded=await call(driverGet,`/api/hub/driver/catering?assignment_id=${assignment.assignment.id}`,DRIVER_COOKIE);
 assert.equal(reloaded.assignment.status,'completed');assert.equal(reloaded.execution.status,'completed');assert.deepEqual(reloaded.available_actions,[]);
 const ownerReload=await call(ownerGet,`/api/hub/owner/catering-assignment?quote_id=${quoteId}`,OWNER_COOKIE);
 assert.equal(ownerReload.assignment.id,reloaded.assignment.id);assert.equal(ownerReload.execution.version,reloaded.execution.version);
 const executionReload=await call(executionGet,`${execPath}?id=${quoteId}`,OWNER_COOKIE);
 assert.deepEqual(executionReload.transitions.slice(-3).map(x=>[x.to_status,x.actor]),[['en_route','stf_api_driver'],['arrived','stf_api_driver'],['completed','stf_api_driver']]);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignment_receipts').n,6);
 for(const table of ['orders','routes','deliveries'])assert.equal(env.DB.one(`SELECT COUNT(*) n FROM ${table}`).n,0);
 assert.deepEqual({...env.DB.one('SELECT total_cents,deposit_cents,balance_cents,deposit_status,balance_status FROM catering_quotes WHERE id=?',quoteId)},{total_cents:2000,deposit_cents:1000,balance_cents:1000,deposit_status:'paid',balance_status:'paid'});
 assert.equal(network.mock.callCount(),0);
});
