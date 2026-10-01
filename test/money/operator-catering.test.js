import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSqliteD1} from '../helpers/sqlite-d1.js';
import {readCateringStatus,summarizeCateringStatus} from '../../functions/_lib/operator_catering.js';
const at=Date.parse('2026-11-01T03:30:00Z'); // Still Oct31 Eastern; window crosses DST.
function seed(DB,id,date='2026-10-31',status='paid'){
 DB.sqlite.prepare("INSERT INTO catering_quotes(id,event_date,serving_time,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,terms_version,terms_json,created_at,updated_at) VALUES(?,?,?,10,1000,0.5,500,500,?,'test','{}',0,0)").run(id,date,'19:00',status);
}
test('status read uses14 Eastern dates includingtoday across DST and excludes unpaid/void/outside',async()=>{
 const DB=makeSqliteD1();seed(DB,'today');seed(DB,'last','2026-11-13');seed(DB,'past','2026-10-30');seed(DB,'later','2026-11-14');seed(DB,'unpaid','2026-11-02','unpaid');seed(DB,'void','2026-11-02','void');
 const result=await readCateringStatus({DB},{at});assert.equal(result.available,true);assert.deepEqual(result.events.map(e=>e.quote_id),['today','last']);assert.equal(result.scope.date_from,'2026-10-31');assert.equal(result.scope.date_through,'2026-11-13');assert.equal(result.scope.days,14);assert.equal(result.timezone,'America/New_York');assert.equal(result.observed_at,'2026-11-01T03:30:00.000Z');assert.equal(result.truncated,false);
 assert.equal(result.events[0].recorded_status,null);assert.equal(result.events[0].assignment_status,null);
});
test('saved execution and assignment are explicitly recorded facts with no customer contact fields',async()=>{
 const DB=makeSqliteD1();seed(DB,'saved');
 DB.exec("INSERT INTO catering_execution(quote_id,status,version,created_at,updated_at) VALUES('saved','completed',7,1,2); INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('drv','Test','test@example.test','driver',1,0,0); INSERT INTO catering_assignments(id,quote_id,driver_id,status,version,quote_snapshot,assigned_by,created_at,updated_at) VALUES('old','saved','drv','released',2,'[]','owner',100,100),('active','saved','drv','accepted',2,'[]','owner',1,3)");
 const r=await readCateringStatus({DB},{at});assert.equal(r.events.length,1);assert.equal(r.events[0].recorded_status,'completed');assert.equal(r.events[0].execution_recorded_at,2);assert.equal(r.events[0].assignment_id,'active');assert.equal(r.events[0].assignment_status,'accepted');assert.ok(!('customer_email' in r.events[0]));assert.ok(!('customer_name' in r.events[0]));assert.match(r.scope.meaning,/not verified/);
});
test('query limits21 results to report20 plus explicit truncation without claiming totalcount',async()=>{
 const DB=makeSqliteD1();for(let i=0;i<22;i++)seed(DB,`event${String(i).padStart(2,'0')}`);
 const r=await readCateringStatus({DB},{at});assert.equal(r.events.length,20);assert.equal(r.truncated,true);assert.ok(!('total' in r));assert.match(DB.calls.at(-1).sql,/LIMIT 21/);assert.match(summarizeCateringStatus(r),/More events exist/);
});
test('missing schema and malformed failed reads fail closed instead of claiming no events',async()=>{
 const DB=makeSqliteD1();DB.exec('DROP TABLE catering_assignments');
 for(const env of [{DB},{},{DB:{prepare:()=>({bind:()=>({all:async()=>({success:false,results:[]})})})}},{DB:{prepare:()=>({bind:()=>({all:async()=>({success:true})})})}}]){
  const r=await readCateringStatus(env,{at});assert.equal(r.available,false);assert.equal(r.events,null);assert.match(summarizeCateringStatus(r),/could not verify/);
 }
});
test('no writes or network; empty validread differs from unavailable and Spanish is deterministic',async(t)=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('No network');});const DB=makeSqliteD1();seed(DB,'unchanged');const before=DB.one('SELECT total_changes() n').n;
 const r=await readCateringStatus({DB},{at});assert.equal(DB.one('SELECT total_changes() n').n,before);assert.ok(DB.calls.every(c=>c.kind==='all'&&/^SELECT/.test(c.sql)));assert.equal(network.mock.callCount(),0);assert.match(summarizeCateringStatus(r,'es'),/registros guardados/);
 const empty=await readCateringStatus({DB:makeSqliteD1()},{at});assert.equal(empty.available,true);assert.deepEqual(empty.events,[]);assert.match(summarizeCateringStatus(empty),/^No catering events/);
 const invalid=await readCateringStatus({DB},{at:NaN});assert.equal(invalid.available,false);
});
