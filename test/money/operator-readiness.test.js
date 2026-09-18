import { test } from 'node:test';
import assert from 'node:assert/strict';
import { operatorBusinessDate, buildContext, marketingStatus, onRequestGet, onRequestPost } from '../../functions/api/hub/owner/operator.js';

function env({ fail = false, role = 'owner' } = {}) {
  const writes = [], dates = [];
  const db = { prepare(sql) {
    return {
      bind(...value) { dates.push(...value.filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v))); return this; },
      async first() {
        if (sql.includes('FROM staff')) return { id: 'owner1', email: 'owner@example.test', role, active: 1 };
        if (fail) throw Error('storage unavailable');
        if (sql.includes('FROM ai_spend')) return { c: 0 };
        if (sql.includes('social.auto_reply')) return { value: 'off' };
        return { n: 0, pts: 0 };
      },
      async all() {
        if (fail) throw Error('storage unavailable');
        return { results: sql.includes('GROUP BY status') ? [{ status: 'draft', n: 3 }] : [] };
      },
      async run() { writes.push(sql); throw Error('No writes allowed'); },
    };
  } };
  return { DB: db, SESSIONS: { async get(key) { return key === 'session:tok' ? JSON.stringify({ type: 'staff', role, uid: 'owner1', email: 'owner@example.test', la: Date.now(), created: Date.now() }) : null; } }, writes, dates };
}
const request = message => new Request('https://example.test/api/hub/owner/operator', { method: 'POST', headers: { cookie: 'anejo_sess=tok', 'content-type': 'application/json' }, body: JSON.stringify({ message }) });

test('operator uses Eastern business date across winter, summer and DST transitions', () => {
  for (const [instant, expected] of [
    ['2026-01-02T03:00:00Z', '2026-01-01'],
    ['2026-07-02T03:00:00Z', '2026-07-01'],
    ['2026-07-02T04:00:00Z', '2026-07-02'],
    ['2026-03-08T07:00:00Z', '2026-03-08'],
    ['2026-11-01T06:00:00Z', '2026-11-01'],
  ]) assert.equal(operatorBusinessDate(Date.parse(instant)), expected);
});
test('context queries bind the same Eastern date and preserve genuine zeros', async () => {
  const e = env();
  const data = await buildContext(e, Date.parse('2026-07-02T03:00:00Z'));
  assert.deepEqual([...new Set(e.dates)], ['2026-07-01']);
  assert.equal(data.counts.deliveringToday, 0);
  assert.deepEqual(data.unavailable, []);
  assert.match(data.text, /America\/New_York/);
});
test('database failures produce unavailable counts, never fabricated empty deliveries', async () => {
  const data = await buildContext(env({ fail: true }));
  assert.equal(data.counts.orders, null);
  assert.equal(data.counts.deliveringToday, null);
  assert.ok(data.unavailable.includes('dueToday'));
  assert.doesNotMatch(data.text, /nothing scheduled|no upcoming deliveries/);
  const status = await marketingStatus(env({ fail: true }));
  assert.equal(status.queue, null);
  assert.equal(status.ana_auto_reply_setting, null);
});
test('capability and marketing status commands work without an AI key or any writes', async () => {
  const e = env();
  for (const message of ['capabilities', 'marketing status']) {
    const response = await onRequestPost({ request: request(message), env: e });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.receipt.mode, 'deterministic');
    assert.equal(body.receipt.mutation, false);
    if (message === 'marketing status') {
      assert.equal(body.status.queue[0].n, 3);
      assert.equal(body.status.execution_health, 'unverified');
      assert.match(body.reply, /not proof/);
    }
  }
  assert.deepEqual(e.writes, []);
});
test('capabilities require owner permission, including GET', async () => {
  for (const method of ['GET', 'POST']) {
    const req = method === 'GET' ? new Request('https://example.test/api/hub/owner/operator', { headers: { cookie: 'anejo_sess=tok' } }) : request('capabilities');
    const handler = method === 'GET' ? onRequestGet : onRequestPost;
    const response = await handler({ request: req, env: env({ role: 'marketing' }) });
    assert.equal(response.status, 403);
  }
});
test('unreadable operations fail before an AI call; ordinary questions still require a key', async () => {
  let response = await onRequestPost({ request: request('What is delivering today?'), env: env() });
  assert.equal(response.status, 501);
  const e = env({ fail: true }); e.ANTHROPIC_API_KEY = 'test-not-a-real-key';
  // Budget read is separately allowed so this specifically exercises grounding failure.
  const original = e.DB.prepare;
  e.DB.prepare = sql => sql.includes('FROM ai_spend') ? { bind() { return this; }, async first() { return { c: 0 }; } } : original(sql);
  response = await onRequestPost({ request: request('What is delivering today?'), env: e });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'context_unavailable');
});

test('delivery totals are independent of the bounded list shown to the operator', async () => {
  const e = env();
  const base = e.DB.prepare;
  e.DB.prepare = sql => {
    if (sql.includes('COUNT(*) AS n FROM orders WHERE delivery_date')) return { bind() { return this; }, async first() { return { n: 40 }; } };
    if (sql.includes('delivery_date = ? ORDER BY')) return { bind() { return this; }, async all() { return { results: Array.from({ length: 25 }, (_, i) => ({ id: `o${i}`, delivery_date: '2026-07-01', status: 'paid' })) }; } };
    return base(sql);
  };
  const data = await buildContext(e, Date.parse('2026-07-02T03:00:00Z'));
  assert.equal(data.counts.deliveringToday, 40);
  assert.match(data.text, /40 total; showing up to 25/);
});

function withHeartbeat(e,record){const base=e.DB.prepare;e.DB.prepare=sql=>sql.includes('SELECT value FROM app_settings WHERE key=?')?{bind(){return this;},async first(){return record===null?null:{value:JSON.stringify(record)};}}:base(sql);return e;}
test('marketing status reads cron heartbeat with timestamps, without invoking providers or writes',async()=>{
 const at=Date.now(),e=withHeartbeat(env(),{started_at:at-2000,completed_at:at-1000,last_success_at:at-1000,source:'cron',error:null,counts:{checked:1,published:0,failed:0,missed:0}});
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No providers');};
 try{const r=await onRequestPost({request:request('marketing status'),env:e}),d=await r.json();assert.equal(r.status,200);assert.equal(d.status.scheduler.source,'cron');assert.equal(d.status.scheduler.observed_state,'recent');assert.equal(d.status.scheduler.last_success_at,new Date(at-1000).toISOString());assert.equal(d.status.execution_health,'unverified');assert.equal(d.status.scheduler.counts.published,0);assert.match(d.reply,/Queue observed at/);assert.match(d.reply,/does not prove current execution/);assert.equal(calls,0);assert.deepEqual(e.writes,[]);}finally{globalThis.fetch=previous;}
});
test('owner check, unfinished heartbeat, stale evidence and missing record stay distinct',async()=>{
 const at=Date.now();
 for(const [record,state] of [[{started_at:at-1000,source:'owner',completed_at:null},'started_not_completed'],[{started_at:at-600000,completed_at:at-500000,source:'cron',error:'publish_failed'},'stale'],[null,'unknown']]){
 const e=withHeartbeat(env(),record),r=await onRequestPost({request:request('marketing status'),env:e}),d=await r.json();assert.equal(d.status.scheduler.observed_state,state);assert.equal(d.status.execution_health,'unverified');assert.doesNotMatch(d.reply,/is running/i);assert.deepEqual(e.writes,[]);if(record?.source==='owner')assert.match(d.reply,/Owner-triggered check/);if(record?.error)assert.match(d.reply,/publish_failed/);
 }
});
