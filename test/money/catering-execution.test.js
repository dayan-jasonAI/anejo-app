import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv, OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {mutateExecution,readExecution} from '../../functions/_lib/catering_execution.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/kitchen/event-execution.js';
const at=Date.parse('2026-09-27T16:00:00Z');
const owner={role:'owner',email:'owner@test.example'};
function fixture() {
 const env=ownerEnv();
 env.DB.sqlite.prepare(`INSERT INTO catering_quotes (total_cents,deposit_pct,deposit_cents,terms_version,terms_json,id,customer_name,event_date,serving_time,address,guests,quote_json,deposit_status,balance_status,balance_cents,created_at,updated_at) VALUES (2000,0.5,1000,'test','{}',?,?,?,?,?,?,?,?,?,?,?,?)`).run('cq_execution','Test','2026-09-28','17:00','123 Test St',12,JSON.stringify({lines:[{name:'Congri',qty:'12'}]}),'paid','due',1000,at,at);
 return env;
}
const configure=(extra={})=>({quote_id:'cq_execution',op:'configure',expected_version:0,idempotency_key:'configure-1',delivery_mode:'owner_self',travel_minutes:30,setup_minutes:20,handling_confirmed:true,...extra});
const transition=(version,target)=>({quote_id:'cq_execution',op:'transition',expected_version:version,idempotency_key:`transition-${version}`,target_status:target,packing_confirmed:true});
const mutate=(env,b)=>mutateExecution(env,b,owner,{at});
test('owner delivery transitions persist a single audit per version and require recorded settlement',async()=>{
 const env=fixture();
 assert.equal((await mutate(env,configure())).execution.version,1);
 for(const [version,target] of [[1,'preparing'],[2,'ready'],[3,'en_route'],[4,'arrived']]) assert.equal((await mutate(env,transition(version,target))).execution.status,target);
 assert.equal((await mutate(env,transition(5,'completed'))).ok,false);
 env.DB.exec("UPDATE catering_quotes SET balance_status='paid'");
 const done=await mutate(env,transition(5,'completed'));
 assert.equal(done.execution.status,'completed'); assert.equal(done.transitions.length,6);
 assert.deepEqual(done.notifications,{enabled:false,sent:false});
 assert.equal(env.DB.one('SELECT balance_cents FROM catering_quotes').balance_cents,1000);
});
test('pickup can use a quote without delivery address and completes directly from ready',async()=>{
 const env=fixture();env.DB.exec("UPDATE catering_quotes SET address=NULL,balance_cents=0");
 assert.equal((await mutate(env,configure({delivery_mode:'pickup',travel_minutes:0}))).ok,true);
 await mutate(env,transition(1,'preparing'));await mutate(env,transition(2,'ready'));
 assert.equal((await mutate(env,transition(3,'en_route'))).ok,false);
 assert.equal((await mutate(env,transition(3,'completed'))).execution.status,'completed');
});
test('same-key concurrent retries yield one mutation and replay; changed request is rejected',async()=>{
 const env=fixture(); const results=await Promise.all([mutate(env,configure()),mutate(env,configure())]);
 assert.ok(results.every(r=>r.ok)); assert.equal(results.filter(r=>r.replayed).length,1);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_execution_transitions').n,1);
 assert.equal((await mutate(env,configure({travel_minutes:31}))).ok,false);
});
test('different-key stale concurrent actions cannot overwrite the winning configuration',async()=>{
 const env=fixture();const results=await Promise.all([mutate(env,configure()),mutate(env,configure({idempotency_key:'configure-2',travel_minutes:50}))]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(env.DB.one('SELECT version FROM catering_execution').version,1);
});
test('audit insertion failure rolls back execution state',async()=>{
 const env=fixture();env.DB.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON catering_execution_transitions BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
 await assert.rejects(mutate(env,configure()),/audit unavailable/);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_execution').n,0);
});
test('quote mutation between read and CAS cannot advance state',async()=>{
 const env=fixture();const batch=env.DB.batch;env.DB.batch=async statements=>{env.DB.exec("UPDATE catering_quotes SET deposit_status='void'");return batch(statements);};
 assert.equal((await mutate(env,configure())).ok,false);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM catering_execution_transitions').n,0);
});
test('past, unpaid, missing menu, missing delivery address and unconfirmed handling are blocked',async()=>{
 for(const sql of ["event_date='2026-09-26'","deposit_status='void'","quote_json='{}'","address=NULL"]){const env=fixture();env.DB.exec(`UPDATE catering_quotes SET ${sql}`);assert.equal((await mutate(env,configure())).ok,false);}
 const env=fixture(); assert.equal((await mutate(env,configure({handling_confirmed:false}))).ok,false);
 assert.equal((await mutateExecution(env,configure(),{role:'kitchen',email:'cook'},{at})).status,403);
});
test('changed event requires explicit reconfirmation and packing is mandatory',async()=>{
 const env=fixture();await mutate(env,configure());
 env.DB.exec("UPDATE catering_quotes SET serving_time='18:00'");
 assert.equal((await readExecution(env,'cq_execution',{at})).available_actions.length,0);
 assert.equal((await mutate(env,transition(1,'preparing'))).ok,false);
 await mutate(env,configure({expected_version:1,idempotency_key:'reconfigure-1'}));
 await mutate(env,transition(2,'preparing'));
 assert.equal((await mutate(env,{...transition(3,'ready'),packing_confirmed:false})).ok,false);
});
test('HTTP endpoint requires owner for writes and allows kitchen read only',async()=>{
 const env=fixture();
 const request=(cookie,method='GET')=>new Request('https://example.test/api/hub/kitchen/event-execution?id=cq_execution',{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(configure())}:{})});
 assert.equal((await onRequestGet({env,request:request('anejo_sess=tok-kitchen')})).status,200);
 assert.equal((await onRequestPost({env,request:request('anejo_sess=tok-kitchen','POST')})).status,403);
 assert.equal((await onRequestGet({env,request:request('')})).status,401);
 assert.equal((await onRequestGet({env,request:request(OWNER_COOKIE)})).status,200);
});
test('allergy updates invalidate handling confirmation and fail the write-race guard',async()=>{
 const env=fixture();await mutate(env,configure());
 env.DB.exec("UPDATE catering_quotes SET dietary_notes='Nut allergy'");
 assert.equal((await mutate(env,transition(1,'preparing'))).ok,false);
 const batch=env.DB.batch;env.DB.batch=async statements=>{env.DB.exec("UPDATE catering_quotes SET dietary_notes='Egg allergy'");return batch(statements);};
 assert.equal((await mutate(env,configure({expected_version:1,idempotency_key:'reconfirm-allergy'}))).ok,false);
 assert.equal(env.DB.one('SELECT version FROM catering_execution').version,1);
});
test('ready plan is locked and execution makes no network calls',async(t)=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw new Error('External calls prohibited');});
 const env=fixture();await mutate(env,configure());await mutate(env,transition(1,'preparing'));await mutate(env,transition(2,'ready'));
 assert.equal((await mutate(env,configure({expected_version:3,idempotency_key:'change-ready'}))).ok,false);
 assert.equal((await mutate(env,transition(3,'completed'))).ok,false);
 assert.equal(network.mock.callCount(),0);
});
