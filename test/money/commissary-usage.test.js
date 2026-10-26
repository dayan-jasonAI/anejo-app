import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {commissaryUsageView,mutateCommissaryUsage,COMMISSARY_FORM_URL} from '../../functions/_lib/commissary_usage.js';
import {onRequestGet,onRequestPost} from '../../functions/api/hub/kitchen/commissary.js';
const AT=Date.parse('2026-10-26T14:00:00Z'),HOUR=3600000;
const cook={role:'kitchen',distinct_id:'stf_k'},owner={role:'owner',distinct_id:'stf_owner'};
const start=(key='start-visit-001')=>({op:'start',request_id:key,services:['Kitchen Use'],confirm_actual:true,note:'Actual synthetic use'});
async function visit(env,who=cook,at=AT,key='start-visit-001'){const r=await mutateCommissaryUsage(env,start(key),who,{at});assert.equal(r.ok,true);return r.visit_id;}
const finish=(id,v=1,key='finish-visit-001')=>({op:'finish',visit_id:id,expected_version:v,request_id:key,services:['Kitchen Use'],confirm_actual:true});
const correction=(id,v=1)=>({op:'correct',visit_id:id,expected_version:v,request_id:'correct-visit-001',services:['Kitchen Use'],started_at:AT-HOUR,ended_at:AT+HOUR,reason:'Actual times verified against staff record',confirm_actual:true});
test('actual visit is server-timestamped, self-attributed, and cannot start without real-use confirmation',async()=>{
 const env=ownerEnv();assert.equal((await mutateCommissaryUsage(env,{...start(),confirm_actual:false},cook,{at:AT})).ok,false);
 const id=await visit(env),row=env.DB.one('SELECT * FROM commissary_visits WHERE id=?',id);assert.equal(row.staff_id,'stf_k');assert.equal(row.started_at,AT);assert.equal(row.staff_name,'Cook');
 const r=await mutateCommissaryUsage(env,{...finish(id),ended_at:AT+5*HOUR},cook,{at:AT+HOUR});assert.equal(r.ok,true);assert.equal(env.DB.one('SELECT ended_at FROM commissary_visits').ended_at,AT+HOUR);
 assert.equal(env.DB.one('SELECT count(*) n FROM commissary_usage_events').n,2);
});
test('idempotent replay after lost acknowledgement creates one visit and stable audit; changed request is rejected',async()=>{
 const env=ownerEnv(),b=start();const r=await mutateCommissaryUsage(env,b,cook,{at:AT});const again=await mutateCommissaryUsage(env,b,cook,{at:AT+1000});assert.equal(again.replayed,true);assert.equal(again.visit_id,r.visit_id);
 assert.equal((await mutateCommissaryUsage(env,{...b,note:'Changed'},cook,{at:AT+2000})).ok,false);assert.equal(env.DB.one('SELECT count(*) n FROM commissary_visits').n,1);assert.equal(env.DB.one('SELECT count(*) n FROM commissary_usage_events').n,1);
});
test('overlapping/open self-visits and stale competing finish are rejected without stray receipt or audit',async()=>{
 const env=ownerEnv(),id=await visit(env);assert.equal((await mutateCommissaryUsage(env,start('different-start-001'),cook,{at:AT+1000})).ok,false);
 assert.equal((await mutateCommissaryUsage(env,finish(id),cook,{at:AT+HOUR})).ok,true);assert.equal((await mutateCommissaryUsage(env,finish(id,1,'competing-finish-001'),cook,{at:AT+2*HOUR})).ok,false);
 assert.equal(env.DB.one('SELECT count(*) n FROM commissary_usage_receipts').n,2);assert.equal(env.DB.one('SELECT count(*) n FROM commissary_usage_events').n,2);
});
test('owner corrections retain immutable history, require actual evidence reason and cannot overlap another visit',async()=>{
 const env=ownerEnv(),id=await visit(env);assert.equal((await mutateCommissaryUsage(env,correction(id),cook,{at:AT+2*HOUR})).status,403);
 assert.equal((await mutateCommissaryUsage(env,{...correction(id),reason:''},owner,{at:AT+2*HOUR})).ok,false);
 assert.equal((await mutateCommissaryUsage(env,correction(id),owner,{at:AT+2*HOUR})).ok,true);const e=env.DB.one("SELECT * FROM commissary_usage_events WHERE operation='correct'");assert.equal(JSON.parse(e.before_json).started_at,AT);assert.equal(JSON.parse(e.after_json).started_at,AT-HOUR);
 const id2=await visit(env,cook,AT+3*HOUR,'second-start-001');await mutateCommissaryUsage(env,finish(id2,1,'second-finish-001'),cook,{at:AT+4*HOUR});
 const overlap={...correction(id,2),request_id:'overlap-correct-001',ended_at:AT+3.5*HOUR};assert.equal((await mutateCommissaryUsage(env,overlap,owner,{at:AT+5*HOUR})).ok,false);assert.equal(env.DB.one('SELECT ended_at FROM commissary_visits WHERE id=?',id).ended_at,AT+HOUR);
 assert.throws(()=>env.DB.exec("UPDATE commissary_usage_events SET reason='rewrite'"),/append-only/);assert.throws(()=>env.DB.exec('DELETE FROM commissary_usage_events'),/append-only/);
});
test('external form is never submitted automatically and reporting requires ended visit plus both confirmations',async()=>{
 const env=ownerEnv(),id=await visit(env),report={op:'report_submission',visit_id:id,expected_version:1,request_id:'report-signin-001',reference:'Response receipt in owner inbox',confirm_actual:true,confirm_submitted:true};
 assert.equal((await mutateCommissaryUsage(env,report,cook,{at:AT+1000})).ok,false);await mutateCommissaryUsage(env,finish(id),cook,{at:AT+HOUR});report.expected_version=2;
 assert.equal((await mutateCommissaryUsage(env,{...report,confirm_submitted:false},cook,{at:AT+HOUR+1000})).ok,false);assert.equal((await mutateCommissaryUsage(env,report,cook,{at:AT+HOUR+1000})).ok,true);
 const v=await commissaryUsageView(env,cook,{month:'2026-10',at:AT+2*HOUR});assert.equal(v.form.url,COMMISSARY_FORM_URL);assert.equal(v.form.external_submission_automatic,false);assert.equal(v.visits[0].external_status,'user_reported_submitted');assert.equal(v.visits[0].external_verified,false);
 assert.equal((await mutateCommissaryUsage(env,{...correction(id,3),request_id:'correction-after-form'},owner,{at:AT+2*HOUR})).ok,true);assert.equal(env.DB.one('SELECT external_status FROM commissary_visits').external_status,'not_recorded');
});
test('staff privacy, owner oversight and real monthly totals are separate from plans and active visits',async()=>{
 const env=ownerEnv(),id=await visit(env);await mutateCommissaryUsage(env,finish(id),cook,{at:AT+2*HOUR});await visit(env,owner,AT,'owner-start-001');
 const mine=await commissaryUsageView(env,cook,{month:'2026-10',at:AT+3*HOUR}),all=await commissaryUsageView(env,owner,{month:'2026-10',at:AT+3*HOUR});assert.equal(mine.visits.length,1);assert.equal(mine.totals.actual_hours,2);assert.equal(all.visits.length,2);assert.equal(all.totals.in_progress,1);assert.equal(all.totals.actual_hours,2);
 assert.equal((await mutateCommissaryUsage(env,{op:'review',visit_id:id,expected_version:2,request_id:'review-record-001',confirm_actual:true},owner,{at:AT+3*HOUR})).ok,true);assert.equal(env.DB.one('SELECT reviewed_by FROM commissary_visits WHERE id=?',id).reviewed_by,'stf_owner');
 assert.equal((await commissaryUsageView(env,cook,{month:'2026-13'})).ok,false);
});
test('ET month clipping and DST do not turn planned hours into attendance',async()=>{
 const env=ownerEnv(),before=Date.parse('2026-11-01T03:30:00Z'),id=await visit(env,cook,before);await mutateCommissaryUsage(env,finish(id),cook,{at:before+HOUR});
 assert.equal((await commissaryUsageView(env,cook,{month:'2026-10'})).totals.actual_hours,.5);assert.equal((await commissaryUsageView(env,cook,{month:'2026-11'})).totals.actual_hours,.5);
 assert.equal((await commissaryUsageView(env,cook,{month:'2026-09'})).totals.actual_hours,0);
});
test('profile stays owner-controlled and visits preserve their original snapshot',async()=>{
 const env=ownerEnv(),b={op:'save_profile',request_id:'profile-save-001',expected_version:0,profile:{business_name:'Synthetic Caterer',email:'test@example.test',license_type:'DBPR - CAT',license_number:'1234567'}};
 assert.equal((await mutateCommissaryUsage(env,b,cook,{at:AT})).status,403);assert.equal((await mutateCommissaryUsage(env,b,owner,{at:AT})).ok,true);const id=await visit(env);
 assert.equal((await mutateCommissaryUsage(env,{...b,request_id:'profile-save-002',expected_version:1,profile:{...b.profile,license_number:'ABC'}},owner,{at:AT+100})).ok,false);
 await mutateCommissaryUsage(env,{...b,request_id:'profile-save-003',expected_version:1,profile:{...b.profile,business_name:'Renamed'}},owner,{at:AT+100});assert.equal(JSON.parse(env.DB.one('SELECT profile_json FROM commissary_visits WHERE id=?',id).profile_json).business_name,'Synthetic Caterer');
});
test('transaction fails closed on lost permission/CAS and audit failure rolls back real update',async()=>{
 const env=ownerEnv(),id=await visit(env),prepare=env.DB.prepare.bind(env.DB);let fired=false;
 env.DB.prepare=sql=>{const stmt=prepare(sql);if(!sql.startsWith('INSERT INTO commissary_usage_receipts'))return stmt;return {...stmt,bind:(...args)=>{if(!fired){fired=true;env.DB.exec("UPDATE staff SET active=0 WHERE id='stf_k'");}return stmt.bind(...args);}};};
 assert.equal((await mutateCommissaryUsage(env,finish(id),cook,{at:AT+HOUR})).ok,false);assert.equal(env.DB.one('SELECT ended_at FROM commissary_visits').ended_at,null);assert.equal(env.DB.one('SELECT count(*) n FROM commissary_usage_receipts').n,1);
 const env2=ownerEnv(),id2=await visit(env2);env2.DB.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON commissary_usage_events WHEN NEW.operation='finish' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");await assert.rejects(mutateCommissaryUsage(env2,finish(id2),cook,{at:AT+HOUR}),/audit unavailable/);assert.equal(env2.DB.one('SELECT ended_at FROM commissary_visits').ended_at,null);
});
test('HTTP endpoint enforces existing owner/kitchen auth, denies marketing and no-session requests',async()=>{
 const env=ownerEnv();assert.equal((await onRequestGet({env,request:new Request('https://example.test/api/hub/kitchen/commissary')})).status,401);
 assert.equal((await onRequestGet({env,request:new Request('https://example.test/api/hub/kitchen/commissary',{headers:{cookie:'anejo_sess=tok-marketing'}})})).status,403);
 const r=await onRequestPost({env,request:new Request('https://example.test/api/hub/kitchen/commissary',{method:'POST',headers:{cookie:OWNER_COOKIE,'Content-Type':'application/json'},body:JSON.stringify(start())})});assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);
});
