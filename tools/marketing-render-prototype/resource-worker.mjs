// LOCAL-ONLY workerd stress harness. No app route, provider call, or deployment wiring.
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import emblem from './assets/emblem.png';
import font from './assets/AnejoEditorialSerif-SemiBold.ttf';
import kickerFont from './assets/AnejoEditorialSans-Medium.ttf';
import {initialize,dimensions} from './core.mjs';
import {renderEditorial} from './editorial.mjs';

const MAX_REQUEST_BYTES=5*1024*1024;
const BODY_READ_DEADLINE_MS=15_000;
const titles=Object.freeze({'reposado-wide':'Catering, beautifully.','reposado-cajita':'Your Cajita.'});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function rejection(message,status=400){const error=new Error(message);error.status=status;return error;}
let observedWasmMemory,observedInitialization;
// Harness-only pass-through observation. Restore globals immediately after initialization.
// Reports exported linear allocation, never total memory or peak usage.
function initializeObserved(){
 if(observedInitialization)return observedInitialization;
 observedInitialization=(async()=>{
  const restores=[];
  for(const key of ['instantiate','instantiateStreaming']){
   const descriptor=Object.getOwnPropertyDescriptor(WebAssembly,key);
   if(!descriptor?.writable||typeof descriptor.value!=='function')continue;
   const original=descriptor.value;
   const wrapper=function(...args){return original.apply(this,args).then(result=>{const instance=result instanceof WebAssembly.Instance?result:result.instance;if(instance?.exports?.memory instanceof WebAssembly.Memory)observedWasmMemory=instance.exports.memory;return result;});};
   try{WebAssembly[key]=wrapper;if(WebAssembly[key]===wrapper)restores.push(()=>{if(WebAssembly[key]===wrapper)Object.defineProperty(WebAssembly,key,descriptor);});}catch{/* Optional observation unavailable. */}
  }
  try{await initialize(wasm);}finally{for(const restore of restores)restore();}
 })();
 return observedInitialization;
}
function wasmObservation(){return observedWasmMemory?{supported:true,linearAllocatedBytes:observedWasmMemory.buffer.byteLength,note:'Exported resvg WASM linear memory allocation after rendering; not live allocations, peak usage, JS heap, or total isolate memory.'}:{supported:false,note:'Exported WASM memory unavailable; no memory value inferred.'};}
// Content-Length is only an early rejection hint. The streaming count enforces the cap.
export async function readBoundedBody(request){
 const declared=request.headers.get('content-length');
 if(declared!==null){if(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared)))throw rejection('Invalid Content-Length');if(Number(declared)>MAX_REQUEST_BYTES)throw rejection('Request body exceeds 5 MiB',413);}
 if(!request.body)throw rejection('JPEG or PNG body required');
 const reader=request.body.getReader(),chunks=[];let size=0,chunkCount=0,emptyChunks=0,timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(rejection('Request body read deadline exceeded',408)),BODY_READ_DEADLINE_MS);});
 try {while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;if(++chunkCount>32_768)throw rejection('Too many request stream chunks',413);if(!value.byteLength){if(++emptyChunks>64)throw rejection('Too many empty request stream chunks',400);continue;}size+=value.byteLength;if(size>MAX_REQUEST_BYTES)throw rejection('Request body exceeds 5 MiB',413);chunks.push(value);}}
 catch(error){try{reader.cancel().catch(()=>{});}catch{/* Cancellation must never delay bounded rejection. */}throw error;}
 finally{clearTimeout(timer);reader.releaseLock();}
 if(!size)throw rejection('JPEG or PNG body required');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
function heapObservation(){
 const memory=globalThis.performance?.memory;
 if(!memory)return {supported:false,note:'This runtime exposes no performance.memory; isolate memory is unverified.'};
 const values={};for(const key of ['usedJSHeapSize','totalJSHeapSize','jsHeapSizeLimit'])if(Number.isFinite(memory[key]))values[key]=memory[key];
 return {supported:Object.keys(values).length>0,...values,note:'Optional runtime-reported JS heap observation; not peak heap or isolate memory.'};
}
export default {async fetch(request){
 const start=Date.now();
 try {
  const url=new URL(request.url);
  if(url.pathname!=='/render')return json({error:'Use POST /render?template=reposado-wide or reposado-cajita',resourceReadiness:'unverified'},404);
  if(request.method!=='POST')return json({error:'POST required',resourceReadiness:'unverified'},405);
  if([...url.searchParams.keys()].some(key=>key!=='template')||url.searchParams.getAll('template').length!==1)throw rejection('Exactly one template parameter is required; no other inputs accepted');
  const templateId=url.searchParams.get('template');
  if(!Object.hasOwn(titles,templateId))throw rejection('Unsupported template');
  const mime=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if(!['image/jpeg','image/png'].includes(mime))throw rejection('Content-Type must be image/jpeg or image/png',415);
  const source=await readBoundedBody(request);
  let sourceInfo;try{sourceInfo=dimensions(source);}catch(error){throw rejection(error.message,422);}
  if(mime!==`image/${sourceInfo.type}`)throw rejection('Content-Type does not match source bytes',415);
  const sourceSha256=await hash(source),heapBefore=heapObservation();
  await initializeObserved();
  const renderStart=Date.now();
  const result=renderEditorial({source,emblem:new Uint8Array(emblem),font:new Uint8Array(font),kickerFont:new Uint8Array(kickerFont),title:titles[templateId],kicker:'AÑEJO CATERING',templateId});
  const renderElapsedMs=Date.now()-renderStart,heapAfter=heapObservation(),wasmLinearAllocation=wasmObservation();
  const outputSha256=await hash(result.jpg);
  return json({template:templateId,source:{...result.source,compressedBytes:source.byteLength,sha256:sourceSha256},dimensions:{width:result.layout.width,height:result.layout.height},outputBytes:result.jpg.byteLength,sha256:outputSha256,sourceSha256,deviations:result.deviations,resourceReadiness:'unverified',performance:{requestWallElapsedMs:Date.now()-start,renderWallElapsedMs:renderElapsedMs,clock:'Date.now',base64Encoding:typeof Uint8Array.prototype.toBase64==='function'?'native':'bounded_fallback',note:'Local workerd elapsed time only. The clock may remain frozen during synchronous rendering; this is not CPU budget or peak/isolate memory evidence. Measure client HTTP wall time independently.',heapBefore,heapAfter,wasmLinearAllocation}});
 } catch(error){return json({error:error.message,resourceReadiness:'unverified',performance:{requestWallElapsedMs:Date.now()-start,clock:'Date.now',note:'Local elapsed time; not CPU or isolate memory evidence.'}},error.status||500);}
}};
