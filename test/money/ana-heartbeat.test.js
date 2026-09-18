import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANA_HEARTBEAT_KEY, loadAnaHeartbeat, recordAnaTick, anaHeartbeatText } from '../../functions/_lib/ana_heartbeat.js';
import { onRequestPost as tick } from '../../functions/api/hub/admin/social-inbox-tick.js';
import { marketingStatus } from '../../functions/api/hub/owner/operator.js';
function fixture() {
  const records=new Map(),writes=[];
  const env={DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){if(sql.startsWith('SELECT value FROM app_settings WHERE key=?'))return records.has(args[0])?{value:records.get(args[0])}:null;if(sql.includes('social.auto_reply'))return {value:'off'};return null;},async all(){return {results:[]};},async run(){assert.match(sql,/^INSERT INTO app_settings/);assert.equal(args[0],ANA_HEARTBEAT_KEY);records.set(args[0],args[1]);writes.push(args);return {success:true,meta:{changes:1}};}};}}};return {env,records,writes};
}
const result=counts=>new Response(JSON.stringify({ok:true,...counts}),{headers:{'Content-Type':'application/json'}});
test('records distinct cron evidence and preserves counters without provider or PII',async()=>{
 const f=fixture();const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('provider forbidden');};
 try{await recordAnaTick(f.env,'cron',async()=>result({drafted:2,sent:0,skipped:1}));const r=await loadAnaHeartbeat(f.env);assert.equal(r.source,'cron');assert.equal(r.status,'recent');assert.equal(r.counts.drafted,2);assert.equal(r.counts.sent,0);assert.ok(r.last_success_at);assert.equal(f.writes.length,2);assert.match(anaHeartbeatText(r),/not proof of current execution/);}finally{globalThis.fetch=old;}
});
test('degraded checks do not advance success; errors are fixed codes only',async()=>{
 const f=fixture();await recordAnaTick(f.env,'cron',async()=>result({}));const success=(await loadAnaHeartbeat(f.env)).last_success_at;
 await recordAnaTick(f.env,'owner',async observe=>{observe('queue_read_failed');observe('sensitive free text');return result({});});
 const r=await loadAnaHeartbeat(f.env);assert.equal(r.status,'error');assert.equal(r.source,'owner');assert.equal(r.last_success_at,success);assert.deepEqual(r.errors,['queue_read_failed']);assert.doesNotMatch(f.records.get(ANA_HEARTBEAT_KEY),/sensitive/);
 assert.equal((await loadAnaHeartbeat(f.env,Date.now()+600000)).status,'stale');
});
test('missing records, storage failure, missing configuration and exceptions stay distinct',async()=>{
 const f=fixture();assert.equal((await loadAnaHeartbeat(f.env)).reason,'no_record');assert.equal((await loadAnaHeartbeat({})).reason,'storage_unavailable');
 await recordAnaTick(f.env,'cron',async()=>result({skipped:'anthropic_not_configured'}));assert.deepEqual((await loadAnaHeartbeat(f.env)).errors,['anthropic_not_configured']);
 await assert.rejects(recordAnaTick(f.env,'cron',async()=>{throw Error('private error');}),/private error/);assert.deepEqual((await loadAnaHeartbeat(f.env)).errors,['tick_exception']);assert.doesNotMatch(f.records.get(ANA_HEARTBEAT_KEY),/private error/);
});
test('actual tick reports caught queue-read failure with no provider calls or new reply writes',async()=>{
 const f=fixture(),base=f.env.DB.prepare;f.env.CRON_KEY='fixture';f.env.ANTHROPIC_API_KEY='fixture';
 f.env.DB.prepare=sql=>{const q=base(sql);if(sql.includes('FROM social_events')||sql.includes("WHERE audience='instagram' AND status='open'"))q.all=async()=>{throw Error('broken queue');};return q;};
 const old=globalThis.fetch;let calls=0;globalThis.fetch=()=>{calls++;throw Error('provider forbidden');};
 try{const r=await tick({request:new Request('https://example.test/api/hub/admin/social-inbox-tick',{method:'POST',headers:{'x-cron-key':'fixture'}}),env:f.env});assert.equal(r.status,200);assert.equal(calls,0);const h=await loadAnaHeartbeat(f.env);assert.equal(h.status,'error');assert.ok(h.errors.includes('queue_read_failed'));assert.equal(h.last_success_at,null);assert.equal(f.writes.length,2);}finally{globalThis.fetch=old;}
});
test('owner status reads Ana evidence without writes or provider calls',async()=>{
 const f=fixture();await recordAnaTick(f.env,'cron',async()=>result({sent:0}));f.writes.length=0;
 const base=f.env.DB.prepare;f.env.DB.prepare=sql=>{const q=base(sql);q.run=async()=>{throw Error('readonly violation');};return q;};
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('provider forbidden');};
 try{const s=await marketingStatus(f.env);assert.equal(s.ana_inbox.source,'cron');assert.equal(s.ana_inbox.counts.sent,0);assert.equal(s.execution_health,'unverified');assert.deepEqual(f.writes,[]);}finally{globalThis.fetch=old;}
});
