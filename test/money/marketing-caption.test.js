import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/marketing-caption.js';
const request=(body={topic:'cajita',language:'en'})=>new Request('https://anejo.test/api/hub/owner/marketing-caption',{method:'POST',headers:{Cookie:OWNER_COOKIE},body:JSON.stringify(body)});
function setup(t,output='Cuban bites for your next gathering.',status=200){
 const env=ownerEnv();env.ANTHROPIC_API_KEY='fake-test-key';const calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json(status===200?{content:[{text:output}],usage:{input_tokens:10,output_tokens:10}}:{error:{message:'SECRET_MUST_NOT_LEAK'}},{status});});
 return {env,calls};
}
test('caption uses grounded Lead and returns unsaved topic CTA without executing actions',async(t)=>{
 const {env,calls}=setup(t);const r=await onRequestPost({env,request:request()});const b=await r.json();
 assert.equal(r.status,200);assert.match(b.caption,/https:\/\/anejocateringco.com\/cajita-builder$/);
 assert.equal(calls.length,1);assert.match(calls[0].body.messages.at(-1).content,/Omit prices entirely/);
 assert.ok(calls[0].body.system.length>1000);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
 assert.ok(!env.DB.sqlLog().some(sql=>/INSERT INTO (team_messages|campaign_briefs)|UPDATE social_posts/.test(sql)));
});
test('action blocks, empty and provider failures return safe errors',async(t)=>{
 for(const [out,status] of [['```json\n{"action":"draft_posts","count":2}\n```',200],['',200],['ignored',500]]){
 const {env}=setup(t,out,status);const r=await onRequestPost({env,request:request()});assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('SECRET_MUST_NOT_LEAK'));
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
 }
});
test('bounds and role denials do not call provider',async(t)=>{
 const {env,calls}=setup(t);
 for(const b of [{topic:'invalid',language:'en'},{topic:'fit',language:'fr'},{topic:'fit',language:'es',notes:'x'.repeat(1001)}])assert.equal((await onRequestPost({env,request:request(b)})).status,400);
 env.DB.sqlite.prepare("UPDATE staff SET role='driver' WHERE id='stf_owner'").run();
 assert.equal((await onRequestPost({env,request:request()})).status,403);assert.equal(calls.length,0);
});
test('existing weekly budget refusal prevents a model request',async(t)=>{
 const {currentWeek}=await import('../../functions/_lib/ai_budget.js');
 const {env,calls}=setup(t);
 env.DB.sqlite.prepare('INSERT INTO ai_spend (id,week,day,feature,model,input_tokens,output_tokens,cost_microdollars,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('budget_fixture',currentWeek(),'2026-09-17','fixture','fixture',1,1,50000000,Date.now());
 const r=await onRequestPost({env,request:request()});assert.equal(r.status,429);assert.equal(calls.length,0);
});
