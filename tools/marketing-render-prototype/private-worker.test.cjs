// Local-only authenticated HTTP execution: entire pipeline runs inside workerd.
// Synthetic KV sessions exercise existing auth middleware, not login/password flows.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {build}=require('../../node_modules/esbuild');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
let bundled;
const referenceHashes=new Map();
async function referenceHash(source,options){
 const key=JSON.stringify(options);if(!referenceHashes.has(key))referenceHashes.set(key,(async()=>{
  const {initialize}=await import('./core.mjs'),{renderEditorial}=await import('./editorial.mjs');
  const bytes=name=>new Uint8Array(fs.readFileSync(path.join(__dirname,name)));
  await initialize(bytes('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
  const result=renderEditorial({source,emblem:bytes('assets/emblem.png'),font:bytes('assets/AnejoEditorialSerif-SemiBold.ttf'),kickerFont:bytes('assets/AnejoEditorialSans-Medium.ttf'),...options});
  const {sha256}=await import('../../functions/_lib/marketing_render_receipt.js');return sha256(result.jpg);
 })());return referenceHashes.get(key);
}
async function bundle(){
 if(!bundled)bundled=(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'anejo-private-worker-local-'));
  fs.copyFileSync(path.join(__dirname,'node_modules/@resvg/resvg-wasm/index_bg.wasm'),path.join(directory,'resvg.wasm'));
  let source=fs.readFileSync(path.join(__dirname,'private-draft-worker.mjs'),'utf8').replace("'@resvg/resvg-wasm/index_bg.wasm'","'./resvg.wasm'");
  assert.ok(source.includes("'./resvg.wasm'"),'Expected exact pinned static WASM import');
  // Test-only outer wrapper provides deterministic concurrency evidence. The handler
  // and renderer remain unchanged; the original R2 binding is used after local release.
  assert.ok(source.includes('export default {'));source=source.replace('export default {','const privateHandler={');
  source+=`\nlet heldSource=false;export default {fetch(request,env,ctx){
   if(!env.HOLD_SOURCE_READ)return privateHandler.fetch(request,env,ctx);
   const original=env.MEDIA;
   const media={get:async key=>{if(!heldSource&&key==='marketing-library/local_http_photo.jpg'){heldSource=true;await env.HOLD_SOURCE_READ.fetch('http://local-fixture/read-barrier');}return original.get(key);},put:original.put.bind(original)};
   return privateHandler.fetch(request,{...env,MEDIA:media},ctx);
  }};\n`;
  const result=await build({stdin:{contents:source,resolveDir:__dirname,sourcefile:'private-draft-worker.mjs'},outfile:path.join(directory,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['./resvg.wasm'],loader:{'.png':'binary','.ttf':'binary'},metafile:true});
  assert.ok(!Object.keys(result.metafile.inputs).some(name=>/node:|normalization\.mjs|test\/helpers/.test(name)),'Worker bundle must exclude Node-only helpers');
  return directory;
 })();
 return bundled;
}
async function setup(t,{enabled=true,holdSource=false}={}){
 const directory=await bundle(),outbound=[];
 let notifySource,releaseSource;const sourceEntered=new Promise(resolve=>notifySource=resolve),sourceReleased=new Promise(resolve=>releaseSource=resolve);
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'private-draft-local',modulesRoot:directory,modules:[{type:'ESModule',path:path.join(directory,'worker.mjs')},{type:'CompiledWasm',path:path.join(directory,'resvg.wasm')}],compatibilityDate:'2026-05-01',bindings:enabled?{LOCAL_RENDER_REHEARSAL:'true'}:{},d1Databases:{DB:'private-draft-local'},r2Buckets:{MEDIA:'private-draft-local'},kvNamespaces:{SESSIONS:'private-sessions-local'},serviceBindings:holdSource?{HOLD_SOURCE_READ:async()=>{notifySource();await sourceReleased;return new Response('Local release');}}:{},outboundService:async request=>{outbound.push(request.url);return new Response('Outbound disabled',{status:503});}}],cf:false,host:'127.0.0.1',port:0}));
 t.after(()=>mf.dispose());t.after(()=>assert.deepEqual(outbound,[]));
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA'),sessions=await mf.getKVNamespace('SESSIONS');
 const {ownerEnv}=await import('../../test/helpers/sqlite-d1.js'),fixture=ownerEnv();let schema;
 try{schema=['staff','inference_receipts','social_posts','social_post_media'].map(name=>fixture.DB.one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name).sql+';').join('\n');}finally{fixture.DB.sqlite.close();}
 const clean=source=>source.replace(/--[^\n]*/g,'').replace(/\n/g,' ');
 await db.exec(clean(schema));for(const name of ['draft-revisions.sql','source-versions.sql','render-jobs.sql'])await db.exec(clean(fs.readFileSync(path.join(__dirname,name),'utf8')));
 const at=Date.now();
 for(const [id,role,active] of [['owner','owner',1],['marketing','marketing',1],['kitchen','kitchen',1],['inactive','owner',0]]){
  await db.prepare('INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,'Synthetic local fixture',id+'@example.invalid',role,active,at,at).run();
  await sessions.put('session:fixture-'+id,JSON.stringify({type:'staff',uid:id,role,la:at,created:at}));
 }
 await sessions.put('session:fixture-expired',JSON.stringify({type:'staff',uid:'owner',role:'owner',la:at-13*60*60*1000,created:at}));
 await sessions.put('session:fixture-forged',JSON.stringify({type:'staff',uid:'kitchen',role:'owner',la:at,created:at}));
 const source=new Uint8Array(fs.readFileSync(path.join(__dirname,'assets/source.jpg'))),sourceKey='marketing-library/local_http_photo.jpg';
 const sourceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',source)),v=>v.toString(16).padStart(2,'0')).join('');
 await media.put(sourceKey,source,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{ai_enhanced:'false',name:'Local fixture'}});
 await db.prepare("INSERT INTO social_posts(id,public_token,status,caption,created_at,updated_at,scheduled_at,audit_score,audit_status,original_caption_hash,original_design_snapshot) VALUES('post','post-token','draft','Local fixture',?,?,?,?, 'pass','old-caption','old-design')").bind(at,at,at+100000,7).run();
 await db.prepare("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('slide','post',0,?,'slide-token',?)").bind(sourceKey,at).run();
 const postRevision=(await db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision;
 const body={requestId:'http-local-1',postId:'post',mediaId:'slide',postRevision,sourceKey,sourceSha256,options:{templateId:'reposado-cajita',title:'Your Cajita.',kicker:'AÑEJO CATERING'}};
 const request=async({token='fixture-owner',origin='http://localhost',value=body,raw,headers={},url='http://localhost/private/draft-render'}={})=>{
  const response=await mf.dispatchFetch(url,{method:'POST',headers:{'content-type':'application/json',...(token?{cookie:'anejo_sess='+token}:{}),...(origin===null?{}:{origin}),...headers},body:raw===undefined?JSON.stringify(value):raw});
  return {response,json:await response.json()};
 };
 const counts=async()=>({jobs:(await db.prepare('SELECT count(*) AS n FROM prototype_render_jobs').first()).n,versions:(await db.prepare('SELECT count(*) AS n FROM prototype_source_versions').first()).n,keys:(await media.list()).objects.map(o=>o.key).sort()});
 return {db,media,sessions,source,sourceKey,sourceSha256,body,postRevision,request,counts,sourceEntered,releaseSource};
}

test('local execution refuses missing rehearsal binding without creating artifacts',{timeout:20000},async t=>{
 const f=await setup(t,{enabled:false}),before=await f.counts(),result=await f.request();assert.equal(result.response.status,503);assert.deepEqual(await f.counts(),before);
});
test('nonlocal host refuses accidental execution even with rehearsal binding',{timeout:20000},async t=>{
 const f=await setup(t),before=await f.counts(),result=await f.request({url:'https://public.example.invalid/private/draft-render',origin:'https://public.example.invalid'});
 assert.equal(result.response.status,404);assert.deepEqual(await f.counts(),before);
});
test('real Worker auth/origin/body rejection precedes source and job writes',{timeout:20000},async t=>{
 const f=await setup(t),before=await f.counts();
 for(const [options,status] of [[{token:null},401],[{token:'fixture-kitchen'},403],[{token:'fixture-inactive'},401],[{token:'fixture-expired'},401],[{token:'fixture-forged'},403],[{origin:'https://cross-origin.example.invalid'},403],[{origin:null},403],[{raw:'{'},400],[{value:{...f.body,actorId:'owner'}},400],[{value:{...f.body,now:Date.now()}},400],[{value:{...f.body,rendererVersion:'client'}},400],[{value:{...f.body,sourceSha256:'bad'}},400],[{value:{...f.body,data_url:'data:image/jpeg;base64,x'}},400],[{value:{...f.body,options:{...f.body.options,protectedRegions:[]}}},400],[{value:{...f.body,options:{...f.body.options,source:'https://remote.example.invalid/photo'}}},400],[{value:{...f.body,options:{...f.body.options,title:'x'.repeat(81)}}},400],[{value:{...f.body,options:{...f.body.options,kicker:'x'.repeat(51)}}},400],[{value:{...f.body,options:{...f.body.options,templateId:'unsupported'}}},400]]){
  const result=await f.request(options);assert.equal(result.response.status,status,JSON.stringify(options));assert.deepEqual(await f.counts(),before);
 }
 assert.equal((await f.db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision,f.postRevision);
 const post=await f.db.prepare("SELECT * FROM social_posts WHERE id='post'").first();assert.equal(post.audit_score,7);assert.equal(post.original_caption_hash,'old-caption');
});
test('one local isolate refuses overlap and releases reservation for the next exact draft execution',{timeout:30000},async t=>{
 const f=await setup(t,{holdSource:true}),a={...f.body,requestId:'concurrent-A'},b={...f.body,requestId:'concurrent-B'};
 const first=f.request({value:a});let timer;
 await Promise.race([f.sourceEntered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Local source barrier timed out')),5000);})]).finally(()=>clearTimeout(timer));
 let busy;try{busy=await f.request({value:b});}finally{f.releaseSource();}
 const success=await first;assert.equal(success.response.status,200,JSON.stringify(success.json));assert.equal(busy.response.status,429);assert.equal(busy.json.error,'private_render_busy');
 assert.equal((await f.counts()).jobs,1);assert.equal((await f.counts()).versions,1);
 // Restore this synthetic draft's original selection to create fresh eligible work.
 await f.db.prepare("UPDATE social_post_media SET media_key=? WHERE id='slide'").bind(f.sourceKey).run();
 const postRevision=(await f.db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision;
 const next=await f.request({value:{...f.body,requestId:'after-overlap',postRevision}});assert.equal(next.response.status,200,JSON.stringify(next.json));assert.equal(next.json.state,'attached');
 assert.equal((await f.counts()).jobs,2);assert.equal((await f.counts()).versions,2);
});
test('authenticated execution claims its exact new job while older actor work stays queued',{timeout:20000},async t=>{
 const f=await setup(t),{createRenderJobStore}=await import('./render-jobs.mjs'),store=createRenderJobStore(f.db);
 const old=await store.enqueue({actorId:'owner',requestId:'older-internal-job',now:Date.now()-10000,descriptor:{sourceKey:f.sourceKey,sourceSha256:f.sourceSha256,postId:'post',mediaId:'slide',postRevision:f.postRevision,sourceVersionId:'older-fixture-version',sourceMetadataSha256:'a'.repeat(64),rendererVersion:'older-fixture-renderer',templateId:'reposado-wide',optionsHash:'b'.repeat(64)}});
 const result=await f.request();assert.equal(result.response.status,200,JSON.stringify(result.json));assert.equal(result.json.state,'attached');
 assert.deepEqual(await store.get({actorId:'owner',jobId:old.job.id}),old.job);
 assert.equal((await f.counts()).jobs,2);
});
for(const actor of ['owner','marketing'])for(const templateId of ['reposado-wide','reposado-cajita'])test('complete authenticated '+actor+' '+templateId+' renders existing design inside local workerd',{timeout:30000},async t=>{
 const f=await setup(t),value={...f.body,options:{...f.body.options,templateId,title:templateId==='reposado-wide'?'Catering, beautifully.':'Your Cajita.'}};
 const {response,json}=await f.request({token:'fixture-'+actor,value});assert.equal(response.status,200,JSON.stringify(json));assert.equal(json.state,'attached');assert.equal(json.publicationApproved,false);assert.equal(json.humanReviewRequired,true);assert.equal(json.resourceReadiness,'unverified');
 const jobs=(await f.db.prepare('SELECT * FROM prototype_render_jobs').all()).results;assert.equal(jobs.length,1);assert.equal(jobs[0].actor_id,actor);assert.equal(jobs[0].status,'rendered');
 const descriptor=JSON.parse(jobs[0].descriptor_json);assert.equal(descriptor.rendererVersion,'local-private-worker-v1');assert.equal(descriptor.templateId,templateId);
 const version=(await f.db.prepare('SELECT * FROM prototype_source_versions').all()).results[0];assert.equal(version.actor_id,actor);assert.equal(version.state,'confirmed');assert.equal(version.id,descriptor.sourceVersionId);
 const output=await f.media.get(json.receipt.outputKey),jpg=new Uint8Array(await output.arrayBuffer());assert.equal(output.httpMetadata.contentType,'image/jpeg');
 const {jpegDimensions,sha256}=await import('../../functions/_lib/marketing_render_receipt.js');const shape=jpegDimensions(jpg);assert.equal(shape.width,json.receipt.width);assert.equal(shape.height,json.receipt.height);assert.equal(await sha256(jpg),json.receipt.sha256);
 // Exact pinned Node/Worker output equivalence; does not establish Canvas visual parity.
 assert.equal(json.receipt.sha256,await referenceHash(f.source,value.options));
 assert.equal(output.customMetadata.ai_enhanced,'false');assert.equal(output.customMetadata.source_version_id,version.id);assert.equal(output.customMetadata.source_version_key,version.version_key);assert.equal(output.customMetadata.source_metadata_sha256,version.metadata_sha256);
 const original=await f.media.get(f.sourceKey);assert.deepEqual(new Uint8Array(await original.arrayBuffer()),f.source);assert.equal(original.customMetadata.ai_enhanced,'false');
 const slide=await f.db.prepare("SELECT * FROM social_post_media WHERE id='slide'").first();assert.equal(slide.media_key,json.receipt.outputKey);assert.equal(slide.seq,0);
 const post=await f.db.prepare("SELECT * FROM social_posts WHERE id='post'").first();assert.equal(post.status,'draft');for(const field of ['scheduled_at','audit_score','audit_status','original_caption_hash','original_design_snapshot'])assert.equal(post[field],null);
 assert.equal((await f.db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision,f.postRevision+2);
 const after=await f.counts(),retry=await f.request({token:'fixture-'+actor,value});assert.equal(retry.response.status,200);assert.equal(retry.json.state,'already_rendered');assert.equal(retry.json.attachment,'unverified');assert.equal(retry.json.publicationApproved,false);assert.deepEqual(await f.counts(),after);
});
