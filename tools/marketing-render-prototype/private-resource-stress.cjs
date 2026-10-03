// LOCAL ONLY. Exact authenticated Worker, unchanged design/assets; no production binding.
// Usage: node private-resource-stress.cjs FIXTURE_DIRECTORY [NORMALIZED_V3_BASELINE_JSON]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build}=require('../../node_modules/esbuild');
const {compiledColorLoaderPlugin}=require('./color-loader-build.cjs');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
const NORMALIZER_VERSION='resvg-lcms-rgba-1',KERNEL_VERSION='lcms-wasm-1.0.5-rgb-kernel-1';
assert.ok(process.argv.length===3||process.argv.length===4,'Provide fixture directory and optionally a normalized-source-v3 baseline JSON');
const fixtureDir=path.resolve(process.argv[2]),baselineFile=process.argv[3]?path.resolve(process.argv[3]):null,manifestFile=path.join(fixtureDir,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
assert.ok(Array.isArray(manifest.fixtures)&&manifest.fixtures.length>0&&manifest.fixtures.length<=50,'Bounded fixture manifest required');
const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile,'utf8')):null;
if(baseline){assert.equal(baseline.schemaVersion,'normalized-source-v3','Baseline must explicitly identify normalized-source-v3; raw-render baselines are not accepted');assert.equal(baseline.normalizerVersion,NORMALIZER_VERSION,'Baseline normalizer version mismatch');assert.equal(baseline.kernelVersion,KERNEL_VERSION,'Baseline color-kernel version mismatch');assert.ok(Array.isArray(baseline.runs),'Normalized v3 baseline run list required');}
const output=fs.mkdtempSync(path.join(os.tmpdir(),'anejo-private-resource-'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const titles={'reposado-wide':'Catering, beautifully.','reposado-cajita':'Your Cajita.'};
const evidence={schemaVersion:'normalized-source-v3',normalizerVersion:NORMALIZER_VERSION,kernelVersion:KERNEL_VERSION,recordedAt:new Date().toISOString(),scope:'local_authenticated_rehearsal',fixtureDirectory:fixtureDir,manifestSha256:sha(fs.readFileSync(manifestFile)),baseline:baseline?{path:baselineFile,sha256:sha(fs.readFileSync(baselineFile)),schemaVersion:baseline.schemaVersion,normalizerVersion:baseline.normalizerVersion,kernelVersion:baseline.kernelVersion}:null,versions:{node:process.version,workerd:require('../../node_modules/workerd/package.json').version,miniflare:require('../../node_modules/miniflare/package.json').version,esbuild:require('../../node_modules/esbuild/package.json').version,resvg:require('./node_modules/@resvg/resvg-wasm/package.json').version},limitations:['Client wall time is a local non-production elapsed-time observation, not deployed CPU or budget proof.','Post-response inspector JS heap samples are local non-production observations, not peak/total isolate memory.','Inspector instrumentation may affect timing and memory.','Heap/backing storage/WASM measurements must not be summed.','Local durable executor, sequential fixture requests; no deployed concurrency/backpressure or production integration proof.','Matching fixture hashes establishes this runtime comparison, not Canvas/approved-design visual parity.'],wasm:{supported:false,note:'Exact unmodified handler exposes no WASM memory observation; no linear/peak allocation inferred.'},runs:[]};
const save=()=>fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(evidence,null,2)+'\n');
function bounded(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));}
let mf,socket,seq=0;const pending=new Map(),outbound=[];
const cdp=(method,params={})=>new Promise(resolve=>{
 if(!socket||socket.readyState!==WebSocket.OPEN){resolve({supported:false,error:'inspector_unavailable'});return;}
 const id=++seq;const done=value=>{clearTimeout(timer);pending.delete(id);resolve(value);};const timer=setTimeout(()=>done({supported:false,error:'inspector_timeout',method}),3000);pending.set(id,done);socket.send(JSON.stringify({id,method,params}));
});
const hardDeadline=setTimeout(()=>{evidence.error='Harness hard deadline exceeded';evidence.failedAt=new Date().toISOString();save();process.exit(1);},300000);
async function inspector(){
 try{
  const url=await bounded(mf.getInspectorURL(),5000,'Inspector URL');url.protocol='http:';assert.equal(url.hostname,'127.0.0.1');
  const targets=await bounded(fetch(new URL('/json/list',url),{signal:AbortSignal.timeout(5000)}).then(r=>r.json()),6000,'Inspector targets');
  const target=targets.find(t=>t.id==='core:user:private-resource-local');assert.ok(target?.webSocketDebuggerUrl,'Exact worker inspector target missing');
  const ws=new URL(target.webSocketDebuggerUrl);assert.equal(ws.hostname,'127.0.0.1');socket=new WebSocket(ws);
  await bounded(new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(Error('Inspector connection failed'));}),5000,'Inspector connection');
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id))pending.get(m.id)(m);};socket.onclose=()=>{for(const done of [...pending.values()])done({supported:false,error:'inspector_closed'});};
  evidence.inspector={supported:true,note:'Local post-response Runtime.getHeapUsage observations only.'};
 }catch(error){evidence.inspector={supported:false,error:error.message};socket?.close();socket=null;}
 evidence.initialHeap=await cdp('Runtime.getHeapUsage');save();
}
async function main(){
 console.log('Evidence directory: '+output);save();
 const entry=path.join(__dirname,'private-draft-worker.mjs'),wasm=path.join(__dirname,'node_modules/@resvg/resvg-wasm/index_bg.wasm'),colorWasm=path.join(__dirname,'node_modules/lcms-wasm/dist/lcms.wasm');
 fs.copyFileSync(wasm,path.join(output,'resvg.wasm'));fs.copyFileSync(colorWasm,path.join(output,'color.wasm'));
 const code=fs.readFileSync(entry,'utf8').replace("'@resvg/resvg-wasm/index_bg.wasm'","'./resvg.wasm'").replace("'lcms-wasm/dist/lcms.wasm'","'./color.wasm'");assert.ok(code.includes("'./resvg.wasm'")&&code.includes("'./color.wasm'"),'Expected exact pinned static WASM imports');
 const bundle=await bounded(build({stdin:{contents:code,resolveDir:__dirname,sourcefile:'private-draft-worker.mjs'},outfile:path.join(output,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['./resvg.wasm','./color.wasm','cloudflare:workers','module'],plugins:[compiledColorLoaderPlugin()],define:{process:'undefined'},loader:{'.png':'binary','.ttf':'binary'},metafile:true,minifySyntax:true}),15000,'Bundle');
 const inputs=Object.keys(bundle.metafile.inputs).filter(name=>name!=='private-draft-worker.mjs').map(name=>{const file=path.resolve(process.cwd(),name);assert.ok(fs.existsSync(file),file);return {path:file,bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))};});
 evidence.inputs=[{path:entry,sha256:sha(fs.readFileSync(entry)),bytes:fs.statSync(entry).size},{path:wasm,sha256:sha(fs.readFileSync(wasm)),bytes:fs.statSync(wasm).size},{path:colorWasm,sha256:sha(fs.readFileSync(colorWasm)),bytes:fs.statSync(colorWasm).size},...inputs];
 evidence.bundle={sha256:sha(fs.readFileSync(path.join(output,'worker.mjs'))),bytes:fs.statSync(path.join(output,'worker.mjs')).size};save();
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'private-resource-local',modulesRoot:output,modules:[{type:'ESModule',path:path.join(output,'worker.mjs')},{type:'CompiledWasm',path:path.join(output,'resvg.wasm')},{type:'CompiledWasm',path:path.join(output,'color.wasm')}],compatibilityDate:'2026-05-01',durableObjects:{RENDER_EXECUTOR:{className:'PrivateRenderExecutor',useSQLite:true}},bindings:{LOCAL_RENDER_REHEARSAL:'true'},d1Databases:{DB:'private-resource-local'},r2Buckets:{MEDIA:'private-resource-local'},kvNamespaces:{SESSIONS:'private-resource-local'},outboundService:async request=>{outbound.push(request.url);return new Response('Outbound disabled',{status:503});}}],cf:false,host:'127.0.0.1',port:0,inspectorPort:0}));
 await bounded(mf.ready,15000,'Runtime startup');await inspector();
 const db=await bounded(mf.getD1Database('DB'),5000,'D1 binding'),media=await bounded(mf.getR2Bucket('MEDIA'),5000,'R2 binding'),sessions=await bounded(mf.getKVNamespace('SESSIONS'),5000,'KV binding');
 const {ownerEnv}=await import('../../test/helpers/sqlite-d1.js');const fixture=ownerEnv();let schema;
 try{schema=['staff','inference_receipts','social_posts','social_post_media'].map(name=>fixture.DB.one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name).sql+';').join('\n');}finally{fixture.DB.sqlite.close();}
 const clean=s=>s.replace(/--[^\n]*/g,'').replace(/\n/g,' ');
 await bounded(db.exec(clean(schema)),5000,'Application fixture tables');
 for(const name of ['draft-revisions.sql','source-versions.sql','normalized-source-schema.sql','render-jobs.sql'])await bounded(db.exec(clean(fs.readFileSync(path.join(__dirname,name),'utf8'))),5000,name);
 const at=Date.now();await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('local-owner','Synthetic fixture','local@example.invalid','owner',1,?,?)").bind(at,at).run();
 await sessions.put('session:private-resource-synthetic',JSON.stringify({type:'staff',uid:'local-owner',role:'owner',la:at,created:at}));
 const expectedHashes=new Map();let number=0;
 for(let round=0;round<3;round++)for(const f of manifest.fixtures){
  if(round&&f.expected!=='accepted')continue;
  for(const templateId of f.expected==='accepted'?Object.keys(titles):['reposado-wide']){
   const file=path.resolve(fixtureDir,f.file);assert.equal(path.dirname(file),fixtureDir,'Fixture must stay in its directory');
   const bytes=fs.readFileSync(file);assert.equal(sha(bytes),f.sha256);assert.equal(bytes.length,f.bytes);
   const id='stress-'+(++number),sourceKey='marketing-library/local-stress/'+id+'_photo.'+(f.mime==='image/png'?'png':'jpg'),postId='post-'+id,mediaId='slide-'+id;
   await bounded((async()=>{
    await media.put(sourceKey,bytes,{httpMetadata:{contentType:f.mime},customMetadata:{ai_enhanced:'false',fixture_sha256:f.sha256}});
    await db.prepare("INSERT INTO social_posts(id,public_token,status,created_at,updated_at,scheduled_at,audit_score,audit_status,original_caption_hash,original_design_snapshot) VALUES(?,?,'draft',?,?,?,7,'pass','old-caption','old-design')").bind(postId,'post-token-'+id,at,at,at+100000).run();
    await db.prepare('INSERT INTO social_post_media(id,post_id,media_key,public_token,created_at) VALUES(?,?,?,?,?)').bind(mediaId,postId,sourceKey,'slide-token-'+id,at).run();
   })(),10000,'Source/draft fixture seed');
   const revision=(await db.prepare('SELECT revision FROM prototype_draft_versions WHERE post_id=?').bind(postId).first()).revision;
   const request={requestId:id,postId,mediaId,postRevision:revision,sourceKey,sourceSha256:f.sha256,options:{templateId,title:titles[templateId],kicker:'AÑEJO CATERING'}};
   const run={round,fixture:f.file,sourceSha256:f.sha256,sourceBytes:bytes.length,template:templateId,postId,sourceKey,expected:f.expected,startedAt:new Date().toISOString(),verified:false};evidence.runs.push(run);save();
   try{
    const start=performance.now();const response=await bounded(mf.dispatchFetch('http://localhost/private/draft-render',{method:'POST',headers:{cookie:'anejo_sess=private-resource-synthetic',origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(request)}),45000,'Authenticated request');
    run.status=response.status;run.result=await bounded(response.json(),5000,'Response JSON');run.clientWallMs=performance.now()-start;run.heap=await cdp('Runtime.getHeapUsage');save();
    await bounded((async()=>{
     const original=await media.get(sourceKey);assert.ok(original);assert.equal(sha(Buffer.from(await original.arrayBuffer())),f.sha256);assert.equal(original.customMetadata.ai_enhanced,'false');
     const post=await db.prepare('SELECT * FROM social_posts WHERE id=?').bind(postId).first(),slide=await db.prepare('SELECT * FROM social_post_media WHERE id=?').bind(mediaId).first(),version=(await db.prepare('SELECT * FROM prototype_source_versions WHERE actor_id=? AND request_id=?').bind('local-owner','capture:'+id).first()),job=await db.prepare('SELECT * FROM prototype_render_jobs WHERE actor_id=? AND request_id=?').bind('local-owner',id).first();
     run.database={postStatus:post.status,mediaKey:slide.media_key,versionState:version?.state||null,jobState:job?.status||null};
     assert.equal(post.status,'draft');assert.equal(post.published_at,null);assert.equal(run.result.publicationApproved,false);assert.equal(run.result.resourceReadiness,'unverified');
     if(f.expected==='accepted'){
      assert.equal(run.status,200,JSON.stringify(run.result));assert.equal(run.result.state,'attached');assert.equal(job.status,'rendered');assert.equal(version.state,'confirmed');
      const receipt=run.result.receipt;assert.deepEqual(JSON.parse(job.receipt_json),receipt);assert.equal(slide.media_key,receipt.outputKey);
      const sourceCopy=await media.get(version.version_key);assert.ok(sourceCopy);assert.equal(sha(Buffer.from(await sourceCopy.arrayBuffer())),f.sha256);assert.equal(sourceCopy.customMetadata.source_version_id,version.id);
      const normalizedBinding=receipt.normalizedSource;assert.ok(normalizedBinding,'Accepted v3 render must bind its confirmed normalized source');assert.equal(normalizedBinding.normalizerVersion,NORMALIZER_VERSION);
      const normalizedVersion=await db.prepare("SELECT * FROM prototype_normalized_source_versions WHERE id=? AND actor_id=? AND source_version_id=? AND normalizer_version=? AND state='confirmed'").bind(normalizedBinding.versionId,'local-owner',version.id,NORMALIZER_VERSION).first();assert.ok(normalizedVersion,'Confirmed normalized D1 version missing');
      assert.equal(normalizedVersion.version_key,normalizedBinding.derivativeKey);assert.equal(normalizedVersion.derivative_sha256,normalizedBinding.derivativeSha256);assert.equal(normalizedVersion.receipt_sha256,normalizedBinding.receiptSha256);assert.equal(normalizedVersion.original_sha256,f.sha256);assert.equal(normalizedVersion.original_version_key,version.version_key);
      assert.equal(sha(Buffer.from(normalizedVersion.receipt_json)),normalizedVersion.receipt_sha256);assert.equal(sha(Buffer.from(normalizedVersion.derivative_metadata_json)),normalizedVersion.derivative_metadata_sha256);
      const normalizedObject=await media.get(normalizedVersion.version_key);assert.ok(normalizedObject,'Normalized R2 derivative missing');const normalizedBytes=Buffer.from(await normalizedObject.arrayBuffer());assert.equal(sha(normalizedBytes),normalizedVersion.derivative_sha256);assert.equal(normalizedBytes.length,normalizedVersion.derivative_bytes);assert.equal(normalizedObject.httpMetadata.contentType,'image/png');assert.deepEqual(normalizedObject.customMetadata,JSON.parse(normalizedVersion.derivative_metadata_json));
      const normalizationReceipt=JSON.parse(normalizedVersion.receipt_json);assert.equal(normalizationReceipt.originalSha256,f.sha256);assert.equal(normalizationReceipt.derivativeSha256,normalizedVersion.derivative_sha256);assert.equal(normalizationReceipt.normalizerVersion,NORMALIZER_VERSION);assert.equal(normalizationReceipt.kernelVersion,KERNEL_VERSION);assert.equal(normalizationReceipt.outputColor,'declared_srgb');
      const outputObject=await media.get(receipt.outputKey);assert.ok(outputObject);const jpeg=Buffer.from(await outputObject.arrayBuffer());assert.equal(sha(jpeg),receipt.sha256);assert.equal(jpeg.length,receipt.outputBytes);assert.equal(outputObject.httpMetadata.contentType,'image/jpeg');assert.equal(outputObject.customMetadata.ai_enhanced,'false');assert.equal(outputObject.customMetadata.source_version_id,version.id);assert.equal(outputObject.customMetadata.source_metadata_sha256,version.metadata_sha256);
      assert.equal(outputObject.customMetadata.normalized_source_version_id,normalizedVersion.id);assert.equal(outputObject.customMetadata.normalized_source_key,normalizedVersion.version_key);assert.equal(outputObject.customMetadata.normalized_source_sha256,normalizedVersion.derivative_sha256);assert.equal(outputObject.customMetadata.normalization_receipt_sha256,normalizedVersion.receipt_sha256);assert.equal(outputObject.customMetadata.normalizer_version,NORMALIZER_VERSION);
      const {jpegDimensions}=await import('../../functions/_lib/marketing_render_receipt.js');assert.deepEqual(jpegDimensions(jpeg),{width:receipt.width,height:receipt.height});
      for(const field of ['scheduled_at','audit_score','audit_status','original_caption_hash','original_design_snapshot'])assert.equal(post[field],null);
      assert.equal((await db.prepare('SELECT revision FROM prototype_draft_versions WHERE post_id=?').bind(postId).first()).revision,revision+2);
      const key=f.sha256+'|'+templateId;if(expectedHashes.has(key))assert.equal(receipt.sha256,expectedHashes.get(key),'Sequential output hash changed');else expectedHashes.set(key,receipt.sha256);
      run.normalizedSource={versionId:normalizedVersion.id,derivativeKey:normalizedVersion.version_key,derivativeSha256:normalizedVersion.derivative_sha256,receiptSha256:normalizedVersion.receipt_sha256,normalizerVersion:normalizationReceipt.normalizerVersion,kernelVersion:normalizationReceipt.kernelVersion};
      if(baseline){const prior=baseline.runs.filter(r=>r.status===200&&r.template===templateId&&r.sourceSha256===f.sha256);assert.ok(prior.length,`Supplied normalized-source-v3 baseline lacks ${f.sha256} / ${templateId}`);for(const p of prior){assert.equal(p.normalizedSource?.normalizerVersion,baseline.normalizerVersion,'Baseline run lacks explicit normalized-source v3 provenance');assert.equal(p.normalizedSource?.kernelVersion,baseline.kernelVersion,'Baseline run lacks pinned color-kernel provenance');assert.equal(receipt.sha256,p.result?.receipt?.sha256,'Normalized v3 fixture output hash changed');}run.baselineComparison={matched:true,matches:prior.length,schemaVersion:baseline.schemaVersion};}
     }else{
      // Raw-render 413/422 codes do not map directly to this metadata-only/R2 route.
      assert.ok(run.status>=400,'Invalid fixture unexpectedly succeeded');assert.notEqual(run.result.state,'attached');assert.equal(slide.media_key,sourceKey);assert.equal(post.audit_score,7);assert.equal(post.original_caption_hash,'old-caption');assert.equal((await db.prepare('SELECT revision FROM prototype_draft_versions WHERE post_id=?').bind(postId).first()).revision,revision);assert.notEqual(job?.status,'rendered');
     }
     assert.deepEqual(outbound,[]);run.verified=true;
    })(),15000,'Post-response evidence validation');
   }catch(error){run.error=error.message;save();throw error;}
   run.finishedAt=new Date().toISOString();save();console.log(`${number}: ${f.file} ${templateId} status=${run.status} verified=${run.verified}`);
  }
 }
 evidence.finalHeap=await cdp('Runtime.getHeapUsage');evidence.outboundRequests=outbound;evidence.observationScope='Local non-production sequential requests; wall time and inspector heap are post-response observations, not deployed CPU, peak memory, or total isolate memory.';assert.deepEqual(outbound,[]);evidence.completedAt=new Date().toISOString();save();
 console.log('Verified '+evidence.runs.length+' local requests; production resource readiness remains unverified.');
}
(async()=>{
 try{await main();}catch(error){evidence.error=error.message;evidence.failedAt=new Date().toISOString();save();console.error(error);process.exitCode=1;}
 finally{
  for(const done of [...pending.values()])done({supported:false,error:'shutdown'});socket?.close();
  try{if(mf)await bounded(mf.dispose(),10000,'Runtime disposal');}catch(error){evidence.disposalError=error.message;save();process.exit(1);}
  clearTimeout(hardDeadline);
 }
})();
