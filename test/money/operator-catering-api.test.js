import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost,operatorCapabilities} from '../../functions/api/hub/owner/operator.js';
import {privateIntent,privateResult} from '../../functions/_lib/operator_commands.js';
const call=(env,message,cookie=OWNER_COOKIE)=>onRequestPost({env,request:new Request('https://example.test/api/hub/owner/operator',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({message})})});
test('catering status is exact bilingual read intent, not mixed-action authority',()=>{
 for(const message of ['catering status','show catering status','show my catering events','estado de catering','mostrar estado de catering','mis eventos de catering']){
  const intent=privateIntent(message);assert.equal(intent.kind,'catering_status');assert.equal(privateResult(intent).receipt.mutation,false);
 }
 for(const message of ['catering status and send notifications','show catering status then complete delivery','estado de catering y pagar'])assert.notEqual(privateIntent(message).kind,'catering_status');
 assert.ok(operatorCapabilities().deterministic_commands.includes('catering status'));
});
test('owner catering command uses real DB without provider credentials, writes or fetch',async(t)=>{
 const spy=t.mock.method(globalThis,'fetch',async()=>{throw Error('provider forbidden');});const env=ownerEnv();
 const before=env.DB.calls.length;const response=await call(env,'catering status');const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.ui.kind,'catering_status');assert.equal(body.catering.available,true);assert.deepEqual(body.catering.events,[]);
 assert.equal(body.receipt.mutation,false);assert.equal(body.receipt.mode,'deterministic');assert.equal(body.receipt.observed_at,body.catering.observed_at);
 assert.match(body.reply,/paid deposit.*next 14 days/);assert.equal(spy.mock.callCount(),0);
 assert.equal(env.DB.calls.slice(before).filter(c=>/^(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(c.sql.trim())).length,0);
});
test('owner-only catering status never leaks to other role sessions',async()=>{
 for(const cookie of ['','anejo_sess=tok-kitchen','anejo_sess=tok-marketing']){
  const response=await call(ownerEnv(),'catering status',cookie);assert.ok([401,403].includes(response.status));assert.equal(Object.hasOwn(await response.json(),'catering'),false);
 }
});
test('missing execution schema returns unavailable in Spanish, never empty success narrative',async()=>{
 const env=ownerEnv();env.DB.exec('DROP TABLE catering_assignments');
 const body=await (await call(env,'estado de catering')).json();assert.equal(body.catering.available,false);assert.match(body.reply,/No pude verificar/);assert.doesNotMatch(body.reply,/Encontré 0/);
});
