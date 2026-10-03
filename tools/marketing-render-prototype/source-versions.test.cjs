// Actual local workerd D1/R2 bindings; Node invokes module, not a deployed Worker.
const {setTimeout:delay}=require('node:timers/promises');
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
async function setup(t){
 const {ownerEnv}=await import('../../test/helpers/sqlite-d1.js');
 const {sha256}=await import('../../functions/_lib/marketing_render_receipt.js');
 const api=await import('./source-versions.mjs'),fixture=ownerEnv();let schema;
 try{schema=['staff','inference_receipts','social_posts','social_post_media'].map(name=>fixture.DB.one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name).sql+';').join('\n');}finally{fixture.DB.sqlite.close();}
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'source-version-local',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'source-version-local'},r2Buckets:{MEDIA:'source-version-local'}}],cf:false,host:'127.0.0.1',port:0}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA');
 const clean=s=>s.replace(/--[^\n]*/g,'').replace(/\n/g,' ');
 await db.exec(clean(schema));for(const name of ['draft-revisions.sql','source-versions.sql'])await db.exec(clean(fs.readFileSync(path.join(__dirname,name),'utf8')));
 const now=Date.now();await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('stf_owner','Local','local@example.invalid','owner',1,?,?)").bind(now,now).run();
 await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('stf_other','Other','other@example.invalid','marketing',1,?,?)").bind(now,now).run();
 await db.prepare("INSERT INTO social_posts(id,public_token,status,created_at,updated_at) VALUES('post','post-token','draft',?,?)").bind(now,now).run();
 const sourceKey='marketing-library/local_source_photo.jpg',source=new Uint8Array(fs.readFileSync(path.join(__dirname,'assets/source.jpg'))),meta={ai_enhanced:'false',tags:'["local"]'};
 await media.put(sourceKey,source,{httpMetadata:{contentType:'image/jpeg'},customMetadata:meta});
 await db.prepare("INSERT INTO social_post_media(id,post_id,media_key,public_token,created_at) VALUES('slide','post',?,'slide-token',?)").bind(sourceKey,now).run();
 const descriptor={postId:'post',mediaId:'slide',postRevision:(await db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision,sourceKey,sourceSha256:await sha256(source)};
 const input={db,media,actorId:'stf_owner',requestId:'capture-local',descriptor,now};
 const outbound=[];t.mock.method(globalThis,'fetch',async url=>{outbound.push(String(url));throw Error('Outbound forbidden');});t.after(()=>assert.deepEqual(outbound,[]));
 const wrapMedia=overrides=>({get:media.get.bind(media),put:media.put.bind(media),...overrides});
 const rows=()=>db.prepare('SELECT * FROM prototype_source_versions').all();
 return {...api,db,media,sourceKey,source,meta,input,descriptor,sha256,wrapMedia,rows};
}
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);

test('actual D1/R2 capture preserves bytes/metadata and confirmed retry ignores changed original',{timeout:20000},async t=>{
 const f=await setup(t),result=await f.captureSourceVersion(f.input),v=result.version;
 assert.equal(result.state,'confirmed');assert.equal(result.replayed,false);assert.ok(v.versionKey.startsWith('marketing-source-versions/'));assert.equal(v.sourceSha256,f.descriptor.sourceSha256);
 assert.equal(v.metadataJson,JSON.stringify({ai_enhanced:'false',tags:'["local"]'}));assert.equal(v.metadataSha256,await f.sha256(new TextEncoder().encode(v.metadataJson)));
 const saved=await f.media.get(v.versionKey);assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),f.source);
 const original=await f.media.get(f.sourceKey);assert.deepEqual(new Uint8Array(await original.arrayBuffer()),f.source);assert.deepEqual(original.customMetadata,f.meta);
 const changed=f.source.slice();changed[50]^=1;await f.media.put(f.sourceKey,changed,{httpMetadata:{contentType:'image/jpeg'},customMetadata:f.meta});
 const retry=await f.captureSourceVersion(f.input);assert.equal(retry.replayed,true);assert.equal(retry.version.id,v.id);assert.equal((await f.rows()).results.length,1);
 assert.equal(await f.readConfirmedSourceVersion({db:f.db,media:f.media,actorId:'stf_other',versionId:v.id}),null);
});
test('request conflict fails closed and another authorized actor has separate identity',{timeout:20000},async t=>{
 const f=await setup(t),first=await f.captureSourceVersion(f.input);
 await rejects(f.captureSourceVersion({...f.input,descriptor:{...f.descriptor,sourceSha256:'a'.repeat(64)}}),'source_version_request_conflict');
 const other=await f.captureSourceVersion({...f.input,actorId:'stf_other'});assert.notEqual(other.version.id,first.version.id);assert.notEqual(other.version.versionKey,first.version.versionKey);
});
test('concurrent identical captures converge on one version and create-only protection',{timeout:20000},async t=>{
 const f=await setup(t),results=await Promise.all([f.captureSourceVersion(f.input),f.captureSourceVersion(f.input)]);
 assert.equal(results[0].version.id,results[1].version.id);assert.equal((await f.rows()).results.length,1);
 const key=results[0].version.versionKey,changed=f.source.slice();changed[50]^=1;
 assert.equal(await f.media.put(key,changed,{onlyIf:{etagDoesNotMatch:'*'}}),null);
 assert.equal(await f.sha256(new Uint8Array(await (await f.media.get(key)).arrayBuffer())),f.descriptor.sourceSha256);
});
test('missing or tampered original fails before reservation',{timeout:20000},async t=>{
 const f=await setup(t);await rejects(f.captureSourceVersion({...f.input,media:f.wrapMedia({get:async()=>null})}),'source_unavailable');
 const changed=f.source.slice();changed[50]^=1;await f.media.put(f.sourceKey,changed,{httpMetadata:{contentType:'image/jpeg'},customMetadata:f.meta});
 await rejects(f.captureSourceVersion(f.input),'source_changed');assert.equal((await f.rows()).results.length,0);
});
for(const kind of ['bytes','metadata'])test('source '+kind+' changes during copy reject registration and retain orphan',{timeout:20000},async t=>{
 const f=await setup(t);let key;
 const media=f.wrapMedia({put:async(k,b,o)=>{key=k;const result=await f.media.put(k,b,o);const changed=f.source.slice();if(kind==='bytes')changed[50]^=1;await f.media.put(f.sourceKey,changed,{httpMetadata:{contentType:'image/jpeg'},customMetadata:kind==='metadata'?{...f.meta,ai_enhanced:'true'}:f.meta});return result;}});
 await rejects(f.captureSourceVersion({...f.input,media}),'source_changed');assert.ok(await f.media.get(key));assert.equal((await f.rows()).results[0].state,'rejected');
 await rejects(f.captureSourceVersion(f.input),'source_version_rejected');
});
test('put acknowledgement loss recovers exact reserved artifact',{timeout:20000},async t=>{
 const f=await setup(t),media=f.wrapMedia({put:async(k,b,o)=>{await f.media.put(k,b,o);throw Error('lost put ack');}});
 assert.equal((await f.captureSourceVersion({...f.input,media})).state,'confirmed');assert.equal((await f.rows()).results[0].state,'confirmed');
});
test('readback ambiguity retains pending artifact and identical retry confirms without overwrite',{timeout:20000},async t=>{
 const f=await setup(t);let putKey;
 const media=f.wrapMedia({put:async(k,b,o)=>{putKey=k;return f.media.put(k,b,o);},get:async k=>{if(k.startsWith('marketing-source-versions/'))throw Error('read unavailable');return f.media.get(k);}});
 await rejects(f.captureSourceVersion({...f.input,media}),'source_version_capture_unverified');const row=(await f.rows()).results[0];assert.equal(row.state,'pending');assert.ok(await f.media.get(putKey));
 const retry=await f.captureSourceVersion(f.input);assert.equal(retry.version.versionKey,putKey);assert.equal(retry.state,'confirmed');
});
test('changed source on pending retry is rejected rather than recopied',{timeout:20000},async t=>{
 const f=await setup(t),media=f.wrapMedia({get:async k=>{if(k.startsWith('marketing-source-versions/'))throw Error('read unavailable');return f.media.get(k);}});
 await rejects(f.captureSourceVersion({...f.input,media}),'source_version_capture_unverified');const row=(await f.rows()).results[0];
 const changed=f.source.slice();changed[50]^=1;await f.media.put(f.sourceKey,changed,{httpMetadata:{contentType:'image/jpeg'},customMetadata:f.meta});
 await rejects(f.captureSourceVersion(f.input),'source_changed');assert.equal((await f.rows()).results[0].state,'rejected');
 assert.equal(await f.sha256(new Uint8Array(await (await f.media.get(row.version_key)).arrayBuffer())),f.descriptor.sourceSha256);
});
test('preexisting wrong private key is not overwritten or registered',{timeout:20000},async t=>{
 const f=await setup(t),wrong=f.source.slice();wrong[50]^=1;let key;
 const media=f.wrapMedia({put:async(k,b,o)=>{key=k;await f.media.put(k,wrong,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{collision:'fixture'}});const result=await f.media.put(k,b,o);assert.equal(result,null);return result;}});
 await rejects(f.captureSourceVersion({...f.input,media}),'source_version_readback_changed');assert.equal((await f.rows()).results[0].state,'pending');assert.deepEqual(new Uint8Array(await (await f.media.get(key)).arrayBuffer()),wrong);
});
test('confirmation acknowledgement loss recovers durable record and altered version fails readback',{timeout:20000},async t=>{
 const f=await setup(t);
 const db={prepare:sql=>({bind:(...args)=>{
  const bound=f.db.prepare(sql).bind(...args);
  return {first:bound.first.bind(bound),run:async()=>{const result=await bound.run();if(sql.startsWith("UPDATE prototype_source_versions SET state='confirmed'"))throw Error('lost db ack');return result;}};
 }})};
 const result=await f.captureSourceVersion({...f.input,db});assert.equal(result.state,'confirmed');
 const changed=f.source.slice();changed[50]^=1;await f.media.put(result.version.versionKey,changed,{httpMetadata:{contentType:'image/jpeg'}});
 await rejects(f.captureSourceVersion(f.input),'source_version_readback_changed');
});
test('draft mutation after private put prevents confirmation and retains original',{timeout:20000},async t=>{
 const f=await setup(t),media=f.wrapMedia({put:async(k,b,o)=>{const result=await f.media.put(k,b,o);await f.db.prepare("UPDATE social_posts SET caption='new' WHERE id='post'").run();return result;}});
 await rejects(f.captureSourceVersion({...f.input,media}),'source_version_confirmation_unverified');assert.equal((await f.rows()).results[0].state,'pending');
 assert.deepEqual(new Uint8Array(await (await f.media.get(f.sourceKey)).arrayBuffer()),f.source);
});
test('source read bounds reject oversized objects before materializing bytes',{timeout:20000},async t=>{
 const f=await setup(t);let cancelled=false,read=false;
 const media=f.wrapMedia({get:async()=>({size:5*1024*1024+1,body:{cancel:async()=>{cancelled=true},getReader:()=>{read=true;throw Error('must not read')}}})});
 await rejects(f.captureSourceVersion({...f.input,media}),'invalid_source_size');assert.equal(cancelled,true);assert.equal(read,false);assert.equal((await f.rows()).results.length,0);
});
test('bounded reader refuses excessive empty chunks without waiting on cancellation',{timeout:20000},async t=>{
 const f=await setup(t);let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array());},cancel(){cancelled=true;return new Promise(()=>{});}});
 const media=f.wrapMedia({get:async()=>({size:100,body,customMetadata:{}})});
 await rejects(f.captureSourceVersion({...f.input,media}),'bounded_source_read_refused');assert.equal(cancelled,true);assert.equal((await f.rows()).results.length,0);
});

async function clockDeadline(){const {createExecutionDeadline}=await import('./execution-deadline.mjs');let clock=Date.now();const deadline=createExecutionDeadline({now:()=>clock,budgetMs:30000});return {deadline,expire:()=>{clock=deadline.expiresAt;}};}
const expired=promise=>assert.rejects(promise,e=>e.message==='execution_deadline_exceeded');
test('deadline after source get stops body read and reservation',{timeout:20000},async t=>{
 const f=await setup(t),clock=await clockDeadline();let bodyReads=0;
 const media=f.wrapMedia({get:async key=>{const object=await f.media.get(key);clock.expire();return {size:object.size,customMetadata:object.customMetadata,httpMetadata:object.httpMetadata,body:{getReader(){bodyReads++;return object.body.getReader();}}};}});
 await expired(f.captureSourceVersion({...f.input,media,deadline:clock.deadline}));assert.equal(bodyReads,0);assert.equal((await f.rows()).results.length,0);
});
test('deadline after body read stops subsequent reads and reservation',{timeout:20000},async t=>{
 const f=await setup(t),clock=await clockDeadline();let reads=0;
 const media=f.wrapMedia({get:async key=>{const object=await f.media.get(key);const reader=object.body.getReader();return {size:object.size,customMetadata:object.customMetadata,httpMetadata:object.httpMetadata,body:{getReader:()=>({read:async()=>{reads++;const result=await reader.read();clock.expire();return result;},releaseLock:()=>reader.releaseLock()})}};}});
 await expired(f.captureSourceVersion({...f.input,media,deadline:clock.deadline}));assert.equal(reads,1);assert.equal((await f.rows()).results.length,0);
});
test('deadline after ambiguous put retains pending orphan without readback or rejection',{timeout:20000},async t=>{
 const f=await setup(t),clock=await clockDeadline();let putKey,gets=0;
 const media=f.wrapMedia({get:async key=>{gets++;return f.media.get(key);},put:async(key,bytes,options)=>{putKey=key;await f.media.put(key,bytes,options);clock.expire();throw Error('lost acknowledgement');}});
 await expired(f.captureSourceVersion({...f.input,media,deadline:clock.deadline}));assert.equal(gets,1);const row=(await f.rows()).results[0];assert.equal(row.state,'pending');assert.ok(await f.media.get(putKey));
});
test('D1 execution clock rejects expired reservation independently of a permissive caller clock',{timeout:20000},async t=>{
 const f=await setup(t);const deadline={expiresAt:Date.now()-1,check(){}};
 await rejects(f.captureSourceVersion({...f.input,deadline}),'source_version_reservation_unverified');assert.equal((await f.rows()).results.length,0);
});
test('D1 delayed confirmation cannot confirm past execution deadline',{timeout:20000},async t=>{
 const f=await setup(t),expiresAt=Date.now()+2500;let delayed=false;
 const db={prepare(sql){const statement=f.db.prepare(sql);return {bind(...args){const bound=statement.bind(...args);return {first:()=>bound.first(),run:async()=>{if(sql.includes("SET state='confirmed'")){delayed=true;await delay(Math.max(0,expiresAt-Date.now()+25));}return bound.run();}};}};}};
 await rejects(f.captureSourceVersion({...f.input,db,deadline:{expiresAt,check(){}}}),'source_version_confirmation_unverified');assert.equal(delayed,true);assert.equal((await f.rows()).results[0].state,'pending');
});
