import {onRequest as middleware} from '../../functions/api/_middleware.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequestPost,onRequestGet} from '../../functions/api/hub/owner/operator-brief.js';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
const key='12345678-1234-4123-8123-123456789abc';
const request=(body,cookie=OWNER_COOKIE,type='application/json')=>new Request('https://anejocateringco.com/api/hub/owner/operator-brief',{method:'POST',headers:{cookie,'content-type':type},body:JSON.stringify(body)});
const call=(env,body={request_id:key,topic:'Cajitas and trays'},cookie)=>onRequestPost({env,request:request(body,cookie)});
test('concurrent same-key saves one owner-supplied draft with exact text and readback, no provider',async()=>{
 const env=ownerEnv();const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('No provider permitted');};
 try{const topic='  Cajitas and trays\nOwner words only.  ';const results=await Promise.all([call(env,{request_id:key,topic}),call(env,{request_id:key,topic})]);const bodies=await Promise.all(results.map(r=>r.json()));assert.ok(bodies.every(b=>b.saved&&b.generated===false));assert.equal(bodies[0].brief.id,bodies[1].brief.id);assert.equal(bodies[0].brief.topic,topic);
 const rows=env.DB.sqlite.prepare('SELECT * FROM operator_brief_ideas').all();assert.equal(rows.length,1);assert.equal(rows[0].status,'draft');assert.equal(rows[0].created_by,'stf_owner');assert.equal(rows[0].objective,topic);assert.equal(Object.hasOwn(rows[0],'audience'),false);assert.equal(Object.hasOwn(rows[0],'success_metric'),false);assert.match(rows[0].title,/Owner-supplied draft idea/);
 assert.equal((await call(env,{request_id:key,topic:'changed'})).status,409);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM social_posts').get().n,0);
 }finally{globalThis.fetch=old;}
});
test('owner-only and strict input validation before any brief save',async()=>{
 const env=ownerEnv();for(const cookie of ['','anejo_sess=tok-marketing','anejo_sess=tok-kitchen'])assert.ok([401,403].includes((await call(env,undefined,cookie)).status));
 for(const body of [{},{request_id:key,topic:''},{request_id:key,topic:'x'.repeat(1001)},{request_id:'bad',topic:'x'},{request_id:key,topic:'x',publish:true}])assert.equal((await call(env,body)).status,400);
 assert.equal((await onRequestPost({env,request:request({request_id:key,topic:'x'},OWNER_COOKIE,'text/plain')})).status,415);
 assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM operator_brief_ideas').get().n,0);
});
test('readback failure is not saved success and same-key retry recovers one row',async()=>{
 const env=ownerEnv();const original=env.DB.prepare.bind(env.DB);env.DB.prepare=sql=>{if(sql.startsWith('SELECT id,title'))throw Error('read unavailable');return original(sql);};
 const failed=await call(env);assert.equal(failed.status,503);assert.equal((await failed.json()).saved,false);
 env.DB.prepare=original;const retry=await call(env);assert.equal((await retry.json()).saved,true);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM operator_brief_ideas').get().n,1);
});
test('same request key from another owner is isolated and never reads another owner idea',async()=>{
 const env=ownerEnv();const first=await (await call(env)).json();const t=Date.now();
 env.DB.sqlite.prepare("INSERT INTO staff (id,name,email,role,active,created_at,updated_at) VALUES ('other','Other','other@test.example','owner',1,?,?)").run(t,t);
 await env.SESSIONS.put('session:other',JSON.stringify({type:'staff',role:'owner',uid:'other',la:t,created:t}));
 const second=await (await call(env,{request_id:key,topic:'Other owner idea'},'anejo_sess=other')).json();
 assert.equal(second.saved,true);assert.notEqual(first.brief.id,second.brief.id);assert.equal(second.brief.topic,'Other owner idea');
 assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) n FROM team_briefs WHERE id LIKE 'obi_%'").get().n,0);
});

test('real API middleware rejects cross-origin save before route mutation',async()=>{
 const env=ownerEnv();const req=request({request_id:key,topic:'Owner idea'});req.headers.set('Origin','https://attacker.example');
 const response=await middleware({request:req,next:()=>onRequestPost({env,request:req})});
 assert.equal(response.status,403);assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) n FROM operator_brief_ideas').get().n,0);
});

test('saved list is owner-scoped, bounded and read failures never look empty',async()=>{
 const env=ownerEnv();await call(env);
 env.DB.sqlite.prepare("INSERT INTO operator_brief_ideas VALUES ('foreign','Foreign','Private','draft','other',1,1)").run();
 const request=new Request('https://anejocateringco.com/api/hub/owner/operator-brief',{headers:{cookie:OWNER_COOKIE}});
 let response=await onRequestGet({env,request});let body=await response.json();assert.equal(body.ideas.length,1);assert.equal(body.ideas[0].topic,'Cajitas and trays');assert.equal(body.limit,20);
 for(let i=0;i<25;i++)env.DB.sqlite.prepare("INSERT INTO operator_brief_ideas VALUES (?,?,?,'draft','stf_owner',?,?)").run('extra'+i,'Idea','Words',i,i);
 body=await (await onRequestGet({env,request})).json();assert.equal(body.ideas.length,20);assert.ok(!body.ideas.some(i=>i.id==='foreign'));
 const original=env.DB.prepare.bind(env.DB);env.DB.prepare=sql=>{if(sql.includes('FROM operator_brief_ideas'))throw Error('unavailable');return original(sql);};
 response=await onRequestGet({env,request});assert.equal(response.status,503);assert.equal(Object.hasOwn(await response.json(),'ideas'),false);
});
