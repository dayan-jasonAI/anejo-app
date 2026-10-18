import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {callbackCalendarEvidence,onRequestGet} from '../../functions/api/hub/owner/callbacks.js';
const row={id:'r1',status:'requested',requested_start_at:1000,calendar_event_id:'event1',calendar_confirmed_at:500,duration_minutes:15,booked_end_at:901000};
const job={request_id:'r1',kind:'calendar',status:'verified',provider_id:'event1',updated_at:500,payload_json:JSON.stringify({event_id:'event1',request_id:'r1',start_at:1000,end_at:901000,duration_minutes:15})};
test('confirmed state requires matching persisted request, calendar job and provider receipt',()=>{
 assert.equal(callbackCalendarEvidence(row,[job]).state,'confirmed');
 for(const [r,j] of [[{...row,calendar_event_id:null},job],[{...row,calendar_confirmed_at:null},job],[{...row,booked_end_at:999},job],[row,{...job,status:'pending'}],[row,{...job,provider_id:'wrong'}],[row,{...job,payload_json:'invalid'}],[row,{...job,payload_json:JSON.stringify({event_id:'event1'})}]])assert.notEqual(callbackCalendarEvidence(r,[j]).state,'confirmed');
 const result=callbackCalendarEvidence(row,[job]);assert.equal(result.verified_at,500);assert.equal(result.event_id,'event1');
});
test('cancellation and needs-review override a prior calendar receipt; delivery receipts stay distinct',()=>{
 assert.equal(callbackCalendarEvidence({...row,status:'canceled'},[job]).state,'canceled');
 assert.equal(callbackCalendarEvidence({...row,status:'needs_review'},[job]).state,'needs_review');
 const r=callbackCalendarEvidence(row,[{...job,status:'needs_review',last_error:'calendar_busy'},{kind:'confirmation',status:'accepted',provider_id:'email1'}]);
 assert.equal(r.state,'needs_review');assert.equal(r.reason,'calendar_busy');assert.equal(r.jobs[1].status,'accepted');assert.equal(r.event_id,null);
});
test('owner API reports disabled readiness, scoped evidence and never exposes job payloads',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE catering_quotes(id TEXT PRIMARY KEY,customer_name TEXT,customer_email TEXT,event_date TEXT);CREATE TABLE staff(id TEXT,email TEXT,role TEXT,team TEXT,is_lead INTEGER,active INTEGER);INSERT INTO staff VALUES(\'owner\',\'owner@example.test\',\'owner\',NULL,0,1);INSERT INTO catering_quotes VALUES(\'q1\',\'Guest\',\'guest@example.test\',\'2027-01-01\')');
 for(const f of ['0151_catering_callbacks.sql','0152_callback_calendar_delivery.sql'])sql.exec(readFileSync(new URL('../../migrations/'+f,import.meta.url),'utf8'));
 sql.prepare('INSERT INTO catering_callback_requests(id,quote_id,request_key,requested_start_at,timezone,phone,created_at,updated_at,calendar_event_id,calendar_confirmed_at,duration_minutes,booked_end_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('r1','q1','key',1000,'America/New_York','+15615550101',1,1,'event1',500,15,901000);
 sql.prepare('INSERT INTO catering_callback_jobs(id,request_id,kind,payload_json,due_at,status,provider_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('j1','r1','calendar',job.payload_json,1,'verified','event1',1,500);
 function prep(q,a=[]){return{bind:(...v)=>prep(q,v),first:async()=>sql.prepare(q).get(...a)||null,all:async()=>({results:sql.prepare(q).all(...a)})};}
 const env={DB:{prepare:prep},SESSIONS:{get:async()=>JSON.stringify({type:'staff',uid:'owner',role:'owner'}),put:async()=>{}}};
 const r=await onRequestGet({env,request:new Request('https://anejocateringco.com/api/hub/owner/callbacks',{headers:{Cookie:'anejo_sess=test'}})});
 assert.equal(r.status,200);const b=await r.json();assert.deepEqual(b.readiness,{ready:false,reason:'disabled'});assert.equal(b.customer_emails_enabled,false);assert.equal(b.requests[0].calendar_evidence.state,'confirmed');assert.equal(b.requests[0].calendar_evidence.jobs[0].payload_json,undefined);assert.equal(b.capabilities.booking_available,false);
});
