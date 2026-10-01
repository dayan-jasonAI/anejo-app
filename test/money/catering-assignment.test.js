import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {ownerEnv} from '../helpers/sqlite-d1.js';
import {executionQuoteSnapshot,mutateExecution} from '../../functions/_lib/catering_execution.js';
import {mutateCateringAssignment,readCateringAssignments} from '../../functions/_lib/catering_assignment.js';
import {onRequestPost as driverPost} from '../../functions/api/hub/driver/catering.js';
const at=Date.parse('2026-09-28T14:00Z');
const owner={distinct_id:'stf_owner',role:'owner',email:'owner@test.example'};
const driver={distinct_id:'driver-one',role:'driver'};
function seed(db){
 db.prepare("INSERT INTO catering_quotes(id,customer_name,event_date,serving_time,address,guests,quote_json,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,terms_version,terms_json,created_at,updated_at) VALUES('cq_driver','Test','2026-09-28','17:00','123 Test St',12,?,2000,0.5,1000,1000,'paid','due','test','{}',?,?)").run(JSON.stringify({lines:[{name:'Congri',qty:'12'},{name:'Pork',qty:'12'}]}),at,at);
 const q=db.prepare('SELECT * FROM catering_quotes').get();
 db.prepare("INSERT INTO catering_execution(quote_id,status,version,delivery_mode,travel_minutes,setup_minutes,handling_confirmed,packing_confirmed,quote_snapshot,created_at,updated_at) VALUES('cq_driver','ready',3,'owner_self',30,20,1,1,?,?,?)").run(executionQuoteSnapshot(q),at,at);
}
function fixture(){const env=ownerEnv();seed(env.DB.sqlite);env.DB.exec("UPDATE catering_execution SET delivery_mode='staff_driver'; INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('driver-one','Driver','driver@test.example','driver',1,0,0),('driver-two','Other','other@test.example','driver',1,0,0)");return env;}
const assign=()=>({quote_id:'cq_driver',op:'assign',driver_id:driver.distinct_id,expected_version:0,expected_execution_version:3,idempotency_key:'assign-first'});
const mutate=(env,b,ctx=driver)=>mutateCateringAssignment(env,b,ctx,{at});
function action(view,op,extra={}){return {assignment_id:view.assignment.id,op,expected_version:view.assignment.version,expected_execution_version:view.execution.version,idempotency_key:`${op}-${view.assignment.version}-request`,...extra};}
async function accepted(env){const a=await mutate(env,assign(),owner);assert.equal(a.ok,true);return mutate(env,action(a,'accept'));}
async function departed(env){let v=await accepted(env);v=await mutate(env,action(v,'confirm_pickup',{confirmed_line_keys:['l0','l1']}));return mutate(env,action(v,'depart'));}
test('populated0137 migration preserves execution and history and permits staff_driver with FK integrity',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const dir=new URL('../../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0139').sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 seed(db);db.exec("INSERT INTO catering_execution_transitions VALUES('history','cq_driver','history-key','{}','preparing','ready',3,'owner','packed',123)");
 const before=db.prepare('SELECT * FROM catering_execution').get(),hist=db.prepare('SELECT * FROM catering_execution_transitions').get();
 db.exec('BEGIN');db.exec(readFileSync(new URL('0139_catering_assignments.sql',dir),'utf8'));db.exec('COMMIT');
 assert.deepEqual(db.prepare('SELECT * FROM catering_execution').get(),before);assert.deepEqual(db.prepare('SELECT * FROM catering_execution_transitions').get(),hist);
 db.exec("UPDATE catering_execution SET delivery_mode='staff_driver'");assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('driver completes assigned catering without network, ordinary orders or finance mutation',async(t)=>{
 const spy=t.mock.method(globalThis,'fetch',async()=>{throw Error('network prohibited');});const env=fixture();let v=await departed(env);assert.equal(v.execution.status,'en_route');v=await mutate(env,action(v,'arrive'));
 assert.equal((await mutate(env,action(v,'complete',{handoff_confirmed:true}))).ok,false);
 env.DB.exec("UPDATE catering_quotes SET balance_status='paid'");const body=action(v,'complete',{handoff_confirmed:true});v=await mutate(env,body);assert.equal(v.execution.status,'completed');assert.equal(v.assignment.status,'completed');assert.equal((await mutate(env,body)).replayed,true);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM orders').n,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM routes').n,0);assert.equal(env.DB.one('SELECT balance_cents FROM catering_quotes').balance_cents,1000);assert.equal(spy.mock.callCount(),0);
 assert.equal(env.DB.one("SELECT actor FROM catering_execution_transitions WHERE to_status='completed'").actor,driver.distinct_id);
});
test('simultaneous assignment requests preserve one winner and same key replays',async()=>{
 const env=fixture();const results=await Promise.all([mutate(env,assign(),owner),mutate(env,assign(),owner)]);assert.ok(results.every(r=>r.ok));assert.equal(results.filter(r=>r.replayed).length,1);
 assert.equal((await mutate(env,{...assign(),idempotency_key:'assign-other',driver_id:'driver-two'},owner)).ok,false);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignments').n,1);
 assert.equal((await mutate(env,{...assign(),driver_id:'driver-two'},owner)).ok,false);
});
test('unrelated, inactive, wrong-role and fake owner contexts cannot mutate',async()=>{
 const env=fixture();const v=await mutate(env,assign(),owner);const body=action(v,'accept');assert.equal((await mutate(env,body,{distinct_id:'driver-two',role:'driver'})).status,404);
 assert.equal((await mutate(env,body,{distinct_id:'stf_k',role:'owner'})).status,403);env.DB.exec("UPDATE staff SET active=0 WHERE id='driver-one'");assert.equal((await mutate(env,body)).status,403);
 assert.equal((await readCateringAssignments(env,{distinct_id:'driver-two',role:'driver'},{assignment_id:v.assignment.id,at})).status,404);
});
test('exact package confirmation and current execution version are mandatory',async()=>{
 const env=fixture();let v=await accepted(env);assert.equal((await mutate(env,action(v,'depart'))).ok,false);
 for(const keys of [['l0'],['l0','l1','l1'],['wrong','l1']])assert.equal((await mutate(env,action(v,'confirm_pickup',{confirmed_line_keys:keys}))).ok,false);
 v=await mutate(env,action(v,'confirm_pickup',{confirmed_line_keys:['l1','l0']}));
 await mutateExecution(env,{quote_id:'cq_driver',op:'reopen',expected_version:3,idempotency_key:'reopen-driver',note:'Physical recheck'},owner,{at});
 assert.equal((await mutate(env,action(v,'depart'))).ok,false);
 env.DB.exec("UPDATE catering_execution SET status='ready',version=6,handling_confirmed=1,packing_confirmed=1");const q=env.DB.one('SELECT * FROM catering_quotes');env.DB.sqlite.prepare('UPDATE catering_execution SET quote_snapshot=?').run(executionQuoteSnapshot(q));
 assert.equal((await mutate(env,{...action(v,'depart'),expected_execution_version:6})).ok,false);
});
test('release before departure requires reason; reassign is new record and cannot steal in-transit event',async()=>{
 const env=fixture();let v=await accepted(env);assert.equal((await mutate(env,action(v,'release'),owner)).ok,false);
 v=await mutate(env,action(v,'release',{note:'Driver unavailable'}),owner);assert.equal(v.assignment.status,'released');
 const second=await mutate(env,{...assign(),driver_id:'driver-two',idempotency_key:'assign-second'},owner);assert.equal(second.ok,true);
 const other=fixture();v=await departed(other);assert.equal((await mutate(other,action(v,'release',{note:'No'}),owner)).ok,false);
});
test('lost quote/roster CAS and failed audit roll back receipt and assignment',async()=>{
 for(const change of ["UPDATE catering_quotes SET dietary_notes='New allergy'","UPDATE staff SET active=0 WHERE id='driver-one'"]){const env=fixture();const batch=env.DB.batch;env.DB.batch=async s=>{env.DB.exec(change);return batch(s);};assert.equal((await mutate(env,assign(),owner)).ok,false);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignment_receipts').n,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignments').n,0);}
 const env=fixture();env.DB.exec("CREATE TRIGGER fail_assignment_audit BEFORE INSERT ON catering_assignment_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");await assert.rejects(mutate(env,assign(),owner),/audit unavailable/);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignment_receipts').n,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignments').n,0);
});
test('driver endpoint rejects unauthenticated and owner sessions',async()=>{
 const env=fixture();for(const [cookie,status] of [['',401],['anejo_sess=tok-owner',403]]){const request=new Request('https://example.test/api/hub/driver/catering',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal((await driverPost({env,request})).status,status);}
});
test('every driver action has stable receipts across concurrent retries',async()=>{
 const env=fixture();let v=await mutate(env,assign(),owner);
 for(const [op,extra] of [['accept',{}],['confirm_pickup',{confirmed_line_keys:['l0','l1']}],['depart',{}],['arrive',{}]]){
  const b=action(v,op,extra);const results=await Promise.all([mutate(env,b),mutate(env,b)]);assert.ok(results.every(r=>r.ok),JSON.stringify(results));assert.equal(results.filter(r=>r.replayed).length,1);v=results[0];
 }
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignment_events').n,5);
});
test('past/unpaid/void/snapshot changes block assignment and driver progress',async()=>{
 for(const change of ["event_date='2026-09-27'","deposit_status='void'","deposit_status='unpaid'","address='Changed'","dietary_notes='New allergy'"]){const env=fixture();env.DB.exec(`UPDATE catering_quotes SET ${change}`);assert.equal((await mutate(env,assign(),owner)).ok,false);}
 const env=fixture();const v=await accepted(env);env.DB.exec("UPDATE catering_quotes SET event_date='2026-09-27'");assert.equal((await mutate(env,action(v,'release',{note:'Old'}),owner)).ok,false);
});
test('decline releases capacity and request replay does not recreate assignment',async()=>{
 const env=fixture();const v=await mutate(env,assign(),owner);const b=action(v,'decline',{note:'Unavailable'});assert.equal((await mutate(env,b)).assignment.status,'declined');assert.equal((await mutate(env,b)).replayed,true);assert.equal((await mutate(env,{...assign(),idempotency_key:'assign-after-decline',driver_id:'driver-two'},owner)).ok,true);
});
test('failed execution-history audit rolls back both assignment and execution versions',async()=>{
 const env=fixture();let v=await accepted(env);v=await mutate(env,action(v,'confirm_pickup',{confirmed_line_keys:['l0','l1']}));
 env.DB.exec("CREATE TRIGGER fail_execution_audit BEFORE INSERT ON catering_execution_transitions BEGIN SELECT RAISE(ABORT,'execution audit unavailable'); END;");
 await assert.rejects(mutate(env,action(v,'depart')),/execution audit unavailable/);
 assert.equal(env.DB.one('SELECT version FROM catering_execution').version,v.execution.version);assert.equal(env.DB.one('SELECT version FROM catering_assignments').version,v.assignment.version);assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_assignment_receipts').n,3);
});
test('owner cannot bypass assigned driver stages or switch fulfillment while assignment is active',async()=>{
 const env=fixture();let v=await accepted(env);
 assert.equal((await mutateExecution(env,{quote_id:'cq_driver',op:'transition',target_status:'en_route',expected_version:3,idempotency_key:'owner-bypass'},owner,{at})).ok,false);
 await mutateExecution(env,{quote_id:'cq_driver',op:'reopen',expected_version:3,idempotency_key:'owner-reopen',note:'Recheck'},owner,{at});
 const config={quote_id:'cq_driver',op:'configure',delivery_mode:'owner_self',travel_minutes:20,setup_minutes:20,handling_confirmed:true,expected_version:4,idempotency_key:'owner-switch'};
 assert.equal((await mutateExecution(env,config,owner,{at})).ok,false);
 v=await readCateringAssignments(env,owner,{assignment_id:v.assignment.id,at});await mutate(env,action(v,'release',{note:'Owner taking delivery'}),owner);
 assert.equal((await mutateExecution(env,config,owner,{at})).ok,true);
});
test('assignment created between fulfillment read and write blocks owner switch atomically',async()=>{
 const env=fixture();env.DB.exec("UPDATE catering_execution SET status='preparing'");
 const batch=env.DB.batch;let once=false;env.DB.batch=async statements=>{
  if(!once){once=true;env.DB.batch=batch;const assigned=await mutate(env,assign(),owner);assert.equal(assigned.ok,true);}
  return batch(statements);
 };
 const r=await mutateExecution(env,{quote_id:'cq_driver',op:'configure',delivery_mode:'owner_self',travel_minutes:20,setup_minutes:20,handling_confirmed:true,expected_version:3,idempotency_key:'owner-race-switch'},owner,{at});
 assert.equal(r.ok,false);assert.equal(env.DB.one('SELECT delivery_mode FROM catering_execution').delivery_mode,'staff_driver');
});
test('assignment responses expose authenticated actor for client retry scoping',async()=>{
 const env=fixture();const initial=await readCateringAssignments(env,owner,{quote_id:'cq_driver',at});assert.equal(initial.actor_id,owner.distinct_id);
 const assigned=await mutate(env,assign(),owner);assert.equal(assigned.actor_id,owner.distinct_id);
 assert.equal((await readCateringAssignments(env,driver,{assignment_id:assigned.assignment.id,at})).actor_id,driver.distinct_id);
 assert.equal((await readCateringAssignments(env,driver,{at})).actor_id,driver.distinct_id);
});
