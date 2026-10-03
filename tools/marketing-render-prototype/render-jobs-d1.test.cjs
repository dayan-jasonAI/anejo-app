const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
test('local workerd D1 executes actor idempotency, atomic claims and stale fencing',{timeout:20000},async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'job-store-check',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'render-jobs-local'}}],cf:false,host:'127.0.0.1',port:0}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 await db.exec(fs.readFileSync(path.join(__dirname,'render-jobs.sql'),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
 const {createRenderJobStore}=await import('./render-jobs.mjs');const store=createRenderJobStore(db);
 const descriptor={sourceKey:'marketing-library/test.jpg',sourceSha256:'a'.repeat(64),sourceVersionId:'source-version-1',sourceMetadataSha256:'e'.repeat(64),postId:'draft-1',postRevision:100,mediaId:'slide-1',rendererVersion:'fixture-v1',templateId:'reposado-wide',optionsHash:'b'.repeat(64)};
 const input={actorId:'owner-1',requestId:'render-1',descriptor,now:100};
 const enqueued=await store.enqueue(input);assert.equal((await store.enqueue(input)).job.id,enqueued.job.id);
 await assert.rejects(store.enqueue({...input,descriptor:{...descriptor,optionsHash:'c'.repeat(64)}}),e=>e.code==='request_conflict');
 for(const change of [{sourceVersionId:'source-version-2'},{sourceMetadataSha256:'f'.repeat(64)}])
  await assert.rejects(store.enqueue({...input,descriptor:{...descriptor,...change}}),e=>e.code==='request_conflict');
 for(const invalid of [{sourceVersionId:''},{sourceVersionId:'x'.repeat(257)},{sourceMetadataSha256:'E'.repeat(64)}])
  await assert.rejects(store.enqueue({...input,descriptor:{...descriptor,...invalid}}),e=>e.code.startsWith('invalid_'));
 const contenders=await Promise.all([store.claim({actorId:'owner-1',now:100,leaseMs:100}),store.claim({actorId:'owner-1',now:100,leaseMs:100})]);
 assert.equal(contenders.filter(Boolean).length,1);const first=contenders.find(Boolean);
 const fresh=await store.claim({actorId:'owner-1',now:200,leaseMs:100});assert.notEqual(first.leaseToken,fresh.leaseToken);
 const output={outputKey:'studio/local-only.jpg',sha256:'d'.repeat(64),outputBytes:200,width:1080,height:810};
 await assert.rejects(store.complete({actorId:'owner-1',jobId:first.id,leaseToken:first.leaseToken,receipt:output,now:201}),e=>e.code==='lease_not_live');
 await assert.rejects(store.complete({actorId:'owner-2',jobId:fresh.id,leaseToken:fresh.leaseToken,receipt:output,now:201}),e=>e.code==='lease_not_live');
 assert.equal((await store.complete({actorId:'owner-1',jobId:fresh.id,leaseToken:fresh.leaseToken,receipt:output,now:201})).status,'rendered');
 assert.equal(await store.claim({actorId:'owner-1',now:300,leaseMs:100}),null);
});

test('local workerd D1 evaluates lease expiry using its execution clock',{timeout:20000},async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'lease-clock-check',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'lease-clock-local'}}],cf:false,host:'127.0.0.1',port:0}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 const before=Date.now();const clock=await db.prepare("SELECT CAST(unixepoch('subsec')*1000 AS INTEGER) AS at").first();
 assert.ok(Number.isSafeInteger(clock.at));assert.ok(clock.at>=before-1000 && clock.at<=Date.now()+1000);
 await db.exec('CREATE TABLE lease_clock (id INTEGER PRIMARY KEY, lease_until INTEGER, attached INTEGER);');
 const dispatch=Date.now();await db.prepare('INSERT INTO lease_clock VALUES(1,?,0)').bind(dispatch+30).run();
 await new Promise(resolve=>setTimeout(resolve,60));
 await db.prepare("UPDATE lease_clock SET attached=1 WHERE id=1 AND lease_until>MAX(?,CAST(unixepoch('subsec')*1000 AS INTEGER))").bind(dispatch).run();
 assert.equal((await db.prepare('SELECT attached FROM lease_clock').first()).attached,0);
 await db.exec('CREATE TABLE clock_guards (success INTEGER CHECK(success=1));');
 const guard=()=>db.prepare('INSERT INTO clock_guards VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)');
 // A zero-row update is not itself an error; its guard must abort the batch.
 await assert.rejects(db.batch([
  db.prepare('UPDATE lease_clock SET attached=1 WHERE id=1'),guard(),
  db.prepare("UPDATE lease_clock SET attached=2 WHERE id=1 AND lease_until>MAX(?,CAST(unixepoch('subsec')*1000 AS INTEGER))").bind(dispatch),guard()
 ]));
 assert.equal((await db.prepare('SELECT attached FROM lease_clock').first()).attached,0);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM clock_guards').first()).n,0);
});

test('local D1 exact job selection scopes recovery and terminal expiration to actor/target',{timeout:20000},async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'exact-job-check',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'exact-job-local'}}],cf:false,host:'127.0.0.1',port:0}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 await db.exec(fs.readFileSync(path.join(__dirname,'render-jobs.sql'),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
 const {createRenderJobStore}=await import('./render-jobs.mjs'),store=createRenderJobStore(db);
 const descriptor={sourceKey:'marketing-library/test.jpg',sourceSha256:'a'.repeat(64),sourceVersionId:'source-version-1',sourceMetadataSha256:'e'.repeat(64),postId:'draft-1',postRevision:100,mediaId:'slide-1',rendererVersion:'fixture-v1',templateId:'reposado-wide',optionsHash:'b'.repeat(64)};
 const a=await store.enqueue({actorId:'owner',requestId:'A',descriptor,now:99}),b=await store.enqueue({actorId:'owner',requestId:'B',descriptor,now:100});
 const claim=overrides=>store.claim({actorId:'owner',now:100,leaseMs:100,...overrides}),get=id=>store.get({actorId:'owner',jobId:id});
 const old=await claim({jobId:b.job.id});assert.equal(old.id,b.job.id);assert.deepEqual(await get(a.job.id),a.job);
 assert.equal(await claim({jobId:b.job.id,actorId:'other',now:200}),null);assert.equal(await claim({jobId:'missing',now:200}),null);
 assert.deepEqual(await get(a.job.id),a.job);assert.deepEqual(await get(b.job.id),old);
 const fresh=await claim({jobId:b.job.id,now:200});assert.notEqual(fresh.leaseToken,old.leaseToken);assert.equal(fresh.attempts,2);
 const receipt={outputKey:'studio/local-only.jpg',sha256:'d'.repeat(64),outputBytes:200,width:1080,height:810};
 await assert.rejects(store.complete({actorId:'owner',jobId:b.job.id,leaseToken:old.leaseToken,receipt,now:201}),e=>e.code==='lease_not_live');
 assert.equal((await store.complete({actorId:'owner',jobId:b.job.id,leaseToken:fresh.leaseToken,receipt,now:201})).status,'rendered');
 for(let n=0;n<3;n++)await claim({jobId:a.job.id,now:300+n*100});
 const expired=await get(a.job.id);
 assert.equal(await claim({jobId:a.job.id,actorId:'other',now:600}),null);assert.equal(await claim({jobId:'missing',now:600}),null);assert.equal(await claim({jobId:b.job.id,now:600}),null);
 assert.deepEqual(await get(a.job.id),expired);
 assert.equal(await claim({jobId:a.job.id,now:600}),null);assert.equal((await get(a.job.id)).status,'dead');
});
