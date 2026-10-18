import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runCallbackDelivery,callbackEventId,calendarReadbackMatches,callbackDeliveryReadiness,googleCallbackAdapter,CALLBACK_EMAIL_VERSION } from '../../functions/_lib/catering_callback_delivery.js';
const now=Date.parse('2027-01-18T14:00Z'),start=Date.parse('2027-01-19T15:00Z');
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON;CREATE TABLE catering_quotes(id TEXT PRIMARY KEY,customer_name TEXT,customer_email TEXT,event_date TEXT,deposit_status TEXT)');
 for(const f of ['0151_catering_callbacks.sql','0152_callback_calendar_delivery.sql'])sql.exec(readFileSync(new URL('../../migrations/'+f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO catering_quotes VALUES('q1','Guest','guest@example.test','2027-02-01','unpaid')");
 sql.prepare("INSERT INTO catering_callback_requests(id,quote_id,request_key,requested_start_at,timezone,phone,created_at,updated_at) VALUES('r1','q1','key',?,'America/New_York','+15615550101',?,?)").run(start,now,now);
 function prep(query,args=[]){return {bind:(...values)=>prep(query,values),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({meta:{changes:sql.prepare(query).run(...args).changes}}),_run:()=>sql.prepare(query).run(...args)};}
 const env={GOOGLE_CALENDAR_CLIENT_ID:'test',GOOGLE_CALENDAR_CLIENT_SECRET:'test',GOOGLE_CALENDAR_REFRESH_TOKEN:'test',RESEND_API_KEY:'test',DB:{prepare:prep,batch:async ss=>{sql.exec('BEGIN');try{for(const s of ss)s._run();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}}};
 function enable(){sql.prepare('UPDATE catering_callback_settings SET enabled=1,enabled_at=?,duration_minutes=15,availability_json=?').run(now,JSON.stringify({1:[['09:00','17:00']],2:[['09:00','17:00']]}));}
 return {env,sql,enable};
}
function provider({busy=false,unknownCreate=false,readbackMismatch=false}={}){
 const calls=[],events=new Map();let attempts=0;
 const adapter={get:async p=>{calls.push('GET');const e=events.get(p.event_id);return e||{missing:true};},busy:async()=>{calls.push('BUSY');return busy;},create:async p=>{calls.push('CREATE');attempts++;events.set(p.event_id,{id:p.event_id,status:'confirmed',start:{dateTime:new Date(p.start_at+(readbackMismatch?60000:0)).toISOString()},end:{dateTime:new Date(p.end_at).toISOString()},extendedProperties:{private:{anejo_callback_id:p.request_id}}});if(unknownCreate&&attempts===1)throw Error('network_unknown');return events.get(p.event_id);}};
 return {adapter,calls,events};
}
function emails(sql){sql.exec(`UPDATE catering_callback_settings SET customer_emails_enabled=1,email_template_version='${CALLBACK_EMAIL_VERSION}'`);}
test('migration is disabled and missing credentials/duration/hours block every provider effect',async()=>{
 const f=fixture(),p=provider();const send=async()=>{throw Error('must not send');};
 assert.equal((await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:send,now})).reason,'disabled');
 f.enable();const save=f.env.GOOGLE_CALENDAR_REFRESH_TOKEN;delete f.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
 assert.equal((await runCallbackDelivery(f.env,{adapter:p.adapter,now})).reason,'calendar_credentials_missing');f.env.GOOGLE_CALENDAR_REFRESH_TOKEN=save;
 f.sql.exec('UPDATE catering_callback_settings SET duration_minutes=NULL');assert.equal((await runCallbackDelivery(f.env,{adapter:p.adapter,now})).reason,'duration_missing');
 f.sql.exec('UPDATE catering_callback_settings SET duration_minutes=15,availability_json=NULL');assert.equal((await runCallbackDelivery(f.env,{adapter:p.adapter,now})).reason,'availability_missing');
 assert.equal(p.calls.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM catering_callback_jobs').get().n,0);
});
test('calendar is confirmed only after matching GET readback; replays create no duplicate or email',async()=>{
 const f=fixture(),p=provider();f.enable();const r=await runCallbackDelivery(f.env,{adapter:p.adapter,now});
 assert.equal(r.verified,1);assert.deepEqual(p.calls,['GET','BUSY','CREATE','GET']);
 const row=f.sql.prepare('SELECT * FROM catering_callback_requests').get();assert.ok(row.calendar_confirmed_at);assert.equal(row.booked_end_at,start+900000);assert.equal(row.calendar_event_id,await callbackEventId('r1'));
 await runCallbackDelivery(f.env,{adapter:p.adapter,now:now+60001});assert.equal(p.calls.filter(x=>x==='CREATE').length,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM catering_callback_jobs WHERE kind!='calendar'").get().n,0);
});
test('provider accepted but network unknown retries deterministic ID by GET before another create',async()=>{
 const f=fixture(),p=provider({unknownCreate:true});f.enable();
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(f.sql.prepare('SELECT calendar_confirmed_at FROM catering_callback_requests').get().calendar_confirmed_at,null);
 const r=await runCallbackDelivery(f.env,{adapter:p.adapter,now:now+60001});assert.equal(r.verified,1);assert.equal(p.calls.filter(x=>x==='CREATE').length,1);
});
test('POST response without matching GET is never booking evidence',async()=>{
 const f=fixture(),p=provider({readbackMismatch:true});f.enable();await runCallbackDelivery(f.env,{adapter:p.adapter,now});
 assert.equal(f.sql.prepare('SELECT calendar_confirmed_at FROM catering_callback_requests').get().calendar_confirmed_at,null);
 await runCallbackDelivery(f.env,{adapter:p.adapter,now:now+60001});
 assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='calendar'").get().status,'needs_review');
 assert.equal(p.calls.filter(x=>x==='CREATE').length,1);
});
test('busy calendar and out of hours remain review requests without any create',async()=>{
 for(const outside of [false,true]){const f=fixture(),p=provider({busy:!outside});f.enable();if(outside)f.sql.exec(`UPDATE catering_callback_settings SET availability_json='{"2":[["12:00","13:00"]]}'`);
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(p.calls.includes('CREATE'),false);assert.equal(f.sql.prepare('SELECT calendar_confirmed_at FROM catering_callback_requests').get().calendar_confirmed_at,null);assert.equal(f.sql.prepare('SELECT status FROM catering_callback_jobs').get().status,'needs_review');}
});
test('durable overlapping slot blocks a second request even when freebusy is stale',async()=>{
 const f=fixture(),p=provider();f.enable();f.sql.prepare("INSERT INTO catering_callback_requests(id,quote_id,request_key,requested_start_at,timezone,phone,created_at,updated_at) VALUES('r2','q1','key2',?,'America/New_York','+15615550101',?,?)").run(start,now+1,now+1);
 await runCallbackDelivery(f.env,{adapter:p.adapter,now:now+1});assert.equal(p.calls.filter(x=>x==='CREATE').length,1);
 assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE request_id='r2'").get().status,'needs_review');
});
test('pre-activation requests and canceled requests do not schedule',async()=>{
 const f=fixture(),p=provider();f.enable();f.sql.prepare('UPDATE catering_callback_settings SET enabled_at=?').run(now+1);
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(p.calls.length,0);
 f.sql.prepare('UPDATE catering_callback_settings SET enabled_at=?').run(now);f.sql.exec("UPDATE catering_callback_requests SET status='canceled'");await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(p.calls.length,0);
});
test('calendar locks prevent concurrent scheduling work',async()=>{
 const f=fixture(),p=provider();f.enable();f.sql.prepare('INSERT INTO catering_callback_calendar_locks VALUES(?,?,?)').run('dayan@anejocateringco.com','other-run',now+120000);
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(p.calls.length,0);assert.equal(f.sql.prepare('SELECT status FROM catering_callback_jobs').get().status,'pending');
});
test('approved confirmations and one-hour reminders use immutable distinct idempotency keys',async()=>{
 const f=fixture(),p=provider(),sent=[];f.enable();emails(f.sql);const sender=async(_env,payload)=>{sent.push(payload);return {id:'email'+sent.length};};
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now});assert.equal(sent.length,1);assert.equal(sent[0].idempotencyKey,'callback:r1:confirmation');
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now:start-3600000});assert.equal(sent.length,2);assert.equal(sent[1].idempotencyKey,'callback:r1:reminder');
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now:start-3590000});assert.equal(sent.length,2);
 assert.ok(sent[0].html.includes('AÑEJO'));assert.ok(!sent[0].html.includes('<script>'));
});
test('suppressed messages do not count as accepted and unapproved templates do not send',async()=>{
 const f=fixture(),p=provider();f.enable();emails(f.sql);f.sql.exec("UPDATE catering_callback_settings SET email_template_version='unapproved'");let calls=0;
 const sender=async()=>{calls++;return {skipped:true,suppressed:'bounced'};};
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now});assert.equal(calls,0);
 emails(f.sql);const r=await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now:now+60001});assert.equal(calls,1);assert.equal(r.accepted,0);assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='confirmation'").get().status,'suppressed');
});
test('calendar cancellation or move blocks confirmation and elapsed calls block reminders',async()=>{
 const f=fixture(),p=provider();f.enable();await runCallbackDelivery(f.env,{adapter:p.adapter,now});emails(f.sql);p.events.clear();let calls=0;
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:async()=>{calls++;return{id:'x'};},now:now+60001});assert.equal(calls,0);
 assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='confirmation'").get().status,'needs_review');
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:async()=>{calls++;},now:start+100});assert.equal(calls,0);
});
test('uncertain email retries same payload and blocks beyond provider idempotency window',async()=>{
 const f=fixture(),p=provider(),sent=[];f.enable();emails(f.sql);const sender=async(_,payload)=>{sent.push(payload);throw Error('unknown');};
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now});
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now:now+60001});assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:sender,now:now+23*3600000});assert.equal(sent.length,2);assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='confirmation'").get().status,'needs_review');
});
test('Google adapter refreshes credentials once, performs freebusy and creates without attendees',async()=>{
 const f=fixture(),calls=[];const p={request_id:'r1',event_id:await callbackEventId('r1'),calendar_id:'dayan@anejocateringco.com',start_at:start,end_at:start+900000,customer_name:'Guest',phone:'+15615550101'};
 const fetcher=async(url,init={})=>{calls.push({url,init});if(url.includes('oauth2'))return Response.json({access_token:'synthetic'});if(url.includes('freeBusy'))return Response.json({calendars:{[p.calendar_id]:{busy:[]}}});if(init.method==='POST')return Response.json({id:p.event_id});return new Response('',{status:404});};
 const a=googleCallbackAdapter(f.env,{fetcher});assert.equal((await a.get(p)).missing,true);assert.equal(await a.busy(p),false);await a.create(p);
 assert.equal(calls.filter(x=>x.url.includes('oauth2')).length,1);const create=calls.find(x=>x.url.includes('sendUpdates=none'));assert.ok(create);const payload=JSON.parse(create.init.body);assert.equal(payload.attendees,undefined);assert.equal(payload.id,p.event_id);
});
test('readiness and readback fail closed for malformed hours, provider errors and mismatched event identity',async()=>{
 const f=fixture();f.enable();const s=f.sql.prepare('SELECT * FROM catering_callback_settings').get();assert.equal(callbackDeliveryReadiness(f.env,{...s,availability_json:'{"2":[["99:00","99:30"]]}'}).ready,false);
 assert.equal(calendarReadbackMatches({id:'wrong',status:'confirmed'},{event_id:'right'}),false);
 const a=googleCallbackAdapter(f.env,{fetcher:async url=>Response.json(url.includes('oauth2')?{access_token:'test'}:{calendars:{'dayan@anejocateringco.com':{errors:[{reason:'forbidden'}]}}})});
 await assert.rejects(a.busy({calendar_id:'dayan@anejocateringco.com',start_at:start,end_at:start+900000}));
});
test('cancellation during calendar readback cannot manufacture a confirmed booking',async()=>{
 const f=fixture(),p=provider();f.enable();const get=p.adapter.get;let gets=0;
 p.adapter.get=async payload=>{const e=await get(payload);if(++gets===2)f.sql.exec("UPDATE catering_callback_requests SET status='canceled'");return e;};
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});
 assert.equal(f.sql.prepare('SELECT calendar_confirmed_at FROM catering_callback_requests').get().calendar_confirmed_at,null);
 assert.equal(f.sql.prepare('SELECT status FROM catering_callback_jobs').get().status,'needs_review');
});
test('changed calendar settings do not move or recreate an uncertain event on a different calendar',async()=>{
 const f=fixture(),p=provider({unknownCreate:true});f.enable();await runCallbackDelivery(f.env,{adapter:p.adapter,now});const count=p.calls.length;
 f.sql.exec("UPDATE catering_callback_settings SET calendar_email='different@example.test'");await runCallbackDelivery(f.env,{adapter:p.adapter,now:now+60001});
 assert.equal(p.calls.length,count);assert.equal(f.sql.prepare('SELECT status FROM catering_callback_jobs').get().status,'needs_review');
});
test('cancellation during the last email readback prevents the customer send',async()=>{
 const f=fixture(),p=provider();f.enable();await runCallbackDelivery(f.env,{adapter:p.adapter,now});emails(f.sql);const get=p.adapter.get;let sends=0;
 p.adapter.get=async payload=>{const event=await get(payload);f.sql.exec("UPDATE catering_callback_requests SET status='canceled'");return event;};
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:async()=>{sends++;return {id:'must-not-send'};},now:now+60001});
 assert.equal(sends,0);assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='confirmation'").get().status,'suppressed');
});
test('owner disabling automation during freebusy prevents calendar creation',async()=>{
 const f=fixture(),p=provider();f.enable();p.adapter.busy=async()=>{f.sql.exec('UPDATE catering_callback_settings SET enabled=0');return false;};
 await runCallbackDelivery(f.env,{adapter:p.adapter,now});assert.equal(p.calls.includes('CREATE'),false);assert.equal(f.sql.prepare('SELECT status FROM catering_callback_jobs').get().status,'needs_review');
});
test('malformed busy intervals never count as an available calendar',async()=>{
 const f=fixture();
 const a=googleCallbackAdapter(f.env,{fetcher:async url=>Response.json(url.includes('oauth2')?{access_token:'test'}:{calendars:{'dayan@anejocateringco.com':{busy:[{start:'invalid',end:'invalid'}]}}})});
 await assert.rejects(a.busy({calendar_id:'dayan@anejocateringco.com',start_at:start,end_at:start+900000}),/availability_unknown/);
});
test('changing the configured calendar suppresses old calendar confirmation sends',async()=>{
 const f=fixture(),p=provider();f.enable();await runCallbackDelivery(f.env,{adapter:p.adapter,now});emails(f.sql);
 f.sql.exec("UPDATE catering_callback_settings SET calendar_email='other@example.test'");let sent=0;
 await runCallbackDelivery(f.env,{adapter:p.adapter,emailSender:async()=>{sent++;return {id:'unexpected'};},now:now+60001});
 assert.equal(sent,0);assert.equal(f.sql.prepare("SELECT status FROM catering_callback_jobs WHERE kind='confirmation'").get().status,'needs_review');
});
