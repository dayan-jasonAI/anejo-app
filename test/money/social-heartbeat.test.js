import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { loadSocialHeartbeat, recordSocialTick, STALE_MS } from '../../functions/_lib/social_heartbeat.js';
import { onRequestPost } from '../../functions/api/hub/admin/social-tick.js';
test('empty natural-style cron tick records completion without a provider call',async(t)=>{
 const env=ownerEnv();env.CRON_KEY='fixture-cron';env.IG_ACCESS_TOKEN='fixture-ig';
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('unexpected external call');});
 const r=await onRequestPost({env,request:new Request('https://anejo.test/api/hub/admin/social-tick',{method:'POST',headers:{'x-cron-key':'fixture-cron'}})});
 assert.equal(r.status,200);assert.equal(globalThis.fetch.mock.callCount(),0);
 const h=await loadSocialHeartbeat(env);assert.equal(h.status,'recent');assert.equal(h.source,'cron');assert.ok(h.completed_at>=h.started_at);assert.equal(h.last_success_at,h.completed_at);assert.deepEqual(h.counts,{checked:0,published:0,failed:0,missed:0});
 assert.equal((await loadSocialHeartbeat(env,h.completed_at+STALE_MS+1)).status,'stale');
});
test('absent or unreadable heartbeat is unknown, not healthy',async()=>{
 assert.deepEqual(await loadSocialHeartbeat(ownerEnv()),{status:'unknown',reason:'no_record'});
 assert.equal((await loadSocialHeartbeat({})).status,'unknown');
});
test('storage failure does not prevent execution and is explicitly signaled',async()=>{
 let ran=false;const env={DB:{prepare(){throw new Error('secret-storage-error');}}};
 const r=await recordSocialTick(env,'cron',async()=>{ran=true;return Response.json({ok:true,checked:0});});
 assert.ok(ran);assert.equal(r.headers.get('X-Social-Heartbeat'),'unavailable');assert.equal((await loadSocialHeartbeat(env)).status,'unknown');
});
test('start is observable, exception records generic error and retains last success',async()=>{
 const env=ownerEnv();await recordSocialTick(env,'cron',async()=>Response.json({ok:true}));const before=await loadSocialHeartbeat(env);
 const r=await recordSocialTick(env,'owner',async()=>{assert.equal((await loadSocialHeartbeat(env)).status,'running');throw new Error('secret-provider-detail');});
 assert.equal(r.status,503);const after=await loadSocialHeartbeat(env);assert.equal(after.error,'tick_exception');assert.equal(after.source,'owner');assert.equal(after.last_success_at,before.last_success_at);assert.ok(!JSON.stringify(after).includes('secret'));
});
test('publish failure and late counts are recorded without post content or raw errors',async()=>{
 const env=ownerEnv();await recordSocialTick(env,'cron',async()=>Response.json({ok:true,checked:3,published:[{caption:'private'}],failed:[{error:'secret'}],missed:[{id:'private'}]}));
 const h=await loadSocialHeartbeat(env);assert.equal(h.status,'error');assert.equal(h.error,'publish_failed');assert.deepEqual(h.counts,{checked:3,published:1,failed:1,missed:1});assert.ok(!JSON.stringify(h).includes('private'));assert.ok(!JSON.stringify(h).includes('secret'));
});
