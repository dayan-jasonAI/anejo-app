// Local workerd stress/inspector proof. No production bindings or requests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {build} = require('../../node_modules/esbuild');
const {Miniflare,convertV4MiniflareOptions} = require('../../node_modules/miniflare');
const fixtureDir=path.resolve(process.argv[2]||'');
const sampleAllocations=process.argv[3]==='--sample-allocations';
assert.ok(process.argv[2] && (process.argv.length===3||(process.argv.length===4&&sampleAllocations)),'Provide the fixture directory and optional --sample-allocations');
const manifest=JSON.parse(fs.readFileSync(path.join(fixtureDir,'manifest.json')));
const output=fs.mkdtempSync('/tmp/anejo-workerd-mixed-resource-');
const evidence={recordedAt:new Date().toISOString(),node:process.version,workerd:require('../../node_modules/workerd/package.json').version,
 limitations:['Local client wall time is not deployed CPU.','Inspector samples and WASM linear allocations are not additive or total/peak isolate memory.','Inspector instrumentation can affect memory and timing.','No concurrency, production budget, visual parity or automated job acceptance.'],runs:[]};
const save=()=>fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(evidence,null,2)+'\n');
function bounded(p,ms,label){let timer;return Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]).finally(()=>clearTimeout(timer));}
async function main(){
 console.log('Evidence directory: '+output);
 fs.copyFileSync(path.join(__dirname,'node_modules/@resvg/resvg-wasm/index_bg.wasm'),path.join(output,'resvg.wasm'));
 const code=fs.readFileSync(path.join(__dirname,'resource-worker.mjs'),'utf8').replace("'@resvg/resvg-wasm/index_bg.wasm'","'./resvg.wasm'");
 await build({stdin:{contents:code,resolveDir:__dirname,sourcefile:'resource-worker.mjs'},outfile:path.join(output,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['./resvg.wasm'],loader:{'.jpg':'binary','.png':'binary','.ttf':'binary'}});
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'mixed-resource-check',modulesRoot:output,modules:[{type:'ESModule',path:path.join(output,'worker.mjs')},{type:'CompiledWasm',path:path.join(output,'resvg.wasm')}],compatibilityDate:'2026-05-01'}],cf:false,host:'127.0.0.1',port:0,inspectorPort:0}));
 let socket,seq=0;const pending=new Map();
 const cdp=(method,params={})=>new Promise(resolve=>{const id=++seq;const done=value=>{clearTimeout(timer);pending.delete(id);resolve(value);};const timer=setTimeout(()=>done({error:'timeout',method}),3000);pending.set(id,done);socket.send(JSON.stringify({id,method,params}));});
 try{
  await bounded(mf.ready,15000,'Runtime startup');
  const inspector=await mf.getInspectorURL();inspector.protocol='http:';
  assert.equal(inspector.hostname,'127.0.0.1');
  const targets=await (await fetch(new URL('/json/list',inspector),{signal:AbortSignal.timeout(5000)})).json();
  const target=targets.find(t=>t.id==='core:user:mixed-resource-check');assert.ok(target?.webSocketDebuggerUrl);
  const url=new URL(target.webSocketDebuggerUrl);assert.equal(url.hostname,'127.0.0.1');
  socket=new WebSocket(url);
  await bounded(new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(Error('Inspector connection failed'));}),5000,'Inspector connection');
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(pending.has(m.id))pending.get(m.id)(m);};
  socket.onclose=()=>{for(const done of [...pending.values()])done({error:'closed'});};
  evidence.baseline=await cdp('Runtime.getHeapUsage');save();
  if(sampleAllocations){evidence.allocationSamplingStart=await cdp('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});save();}
  const expectedHashes=new Map();
  for(let round=0;round<3;round++)for(const fixture of manifest.fixtures){
   // Rejection cases need only one request. Both templates cover accepted shapes.
   if(round && fixture.expected!=='accepted')continue;
   for(const template of fixture.expected==='accepted'?['reposado-wide','reposado-cajita']:['reposado-wide']){
    const file=path.resolve(fixtureDir,fixture.file);assert.equal(path.dirname(file),fixtureDir);
    const bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.sha256);
    const start=performance.now();
    const response=await bounded(mf.dispatchFetch('http://localhost/render?template='+template,{method:'POST',headers:{'content-type':fixture.mime},body:bytes}),20000,'Render');
    const body=await response.json();const wallMs=performance.now()-start;
    const run={round,fixture:fixture.file,template,status:response.status,clientWallMs:wallMs,result:body,heap:await cdp('Runtime.getHeapUsage')};
    evidence.runs.push(run);save();
    const status=fixture.expected==='accepted'?200:Number(fixture.expected.split(' ')[0]);assert.equal(response.status,status,fixture.file);
    if(status===200){assert.equal(body.sourceSha256,fixture.sha256);assert.ok(body.outputBytes>0);assert.equal(body.resourceReadiness,'unverified');const key=fixture.file+'|'+template;if(expectedHashes.has(key))assert.equal(body.sha256,expectedHashes.get(key),key);else expectedHashes.set(key,body.sha256);}
   }
  }
  if(sampleAllocations){const profile=await cdp('HeapProfiler.stopSampling');fs.writeFileSync(path.join(output,'allocation-sampling.json'),JSON.stringify(profile,null,2)+'\n');evidence.allocationSamplingEnd={supported:Boolean(profile.result?.profile),error:profile.error||null};}
  evidence.finalHeap=await cdp('Runtime.getHeapUsage');evidence.completedAt=new Date().toISOString();save();
  console.log('Completed '+evidence.runs.length+' local requests; resource safety remains unverified.');
 }finally{for(const done of [...pending.values()])done({error:'shutdown'});socket?.close();await bounded(mf.dispose(),10000,'Runtime disposal');}
}
main().catch(error=>{evidence.error=error.message;save();console.error(error);process.exitCode=1;});
