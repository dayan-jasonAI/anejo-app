// LOCAL ONLY: complete authenticated Worker rehearsal. Never deployed by app configuration.
// No resource/visual/publication gate is established by a successful local attachment.
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import colorWasm from 'lcms-wasm/dist/lcms.wasm';
import {createWorkerNormalizer} from './worker-source-normalize.mjs';
import {captureNormalizedSource} from './normalized-source-versions.mjs';
import emblem from './assets/emblem.png';
import font from './assets/AnejoEditorialSerif-SemiBold.ttf';
import kickerFont from './assets/AnejoEditorialSans-Medium.ttf';
import {requireRole,MARKETING_DESK} from '../../functions/_lib/roles.js';
import {sourceKey as validSourceKey} from '../../functions/_lib/marketing_render_receipt.js';
import {initialize} from './core.mjs';
import {renderEditorial} from './editorial.mjs';
import {captureSourceVersion} from './source-versions.mjs';
import {createRenderJobStore} from './render-jobs.mjs';
import {consumePrivateRender,renderOptionsHash} from './render-consumer.mjs';
import {LocalDurableAdmission,OWNED_LOCAL_WORK} from './durable-admission.mjs';
import {createExecutionDeadline} from './execution-deadline.mjs';
import {admitSourceColor} from './source-color-admission.mjs';

const rendererVersion='local-private-worker-v3';
const json=(value,status=200)=>new Response(JSON.stringify({...value,scope:'local_rehearsal',resourceReadiness:'unverified',publicationApproved:false}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function reject(code,status=400){const error=new Error(code);error.status=status;throw error;}
function exact(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))reject('invalid_request');}
function text(value,max){if(typeof value!=='string'||!value||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/u.test(value))reject('invalid_request');return value;}
async function body(request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')reject('json_required',415);
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>16384))reject('request_too_large',413);
 const reader=request.body?.getReader();if(!reader)reject('json_required');
 let timer,size=0,count=0;const chunks=[];
 const deadline=new Promise((_,fail)=>{timer=setTimeout(()=>fail(Object.assign(new Error('request_read_timeout'),{status:408})),3000);});
 try{while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;if(++count>128||((size+=value.byteLength)>16384))reject('request_too_large',413);chunks.push(value);}}
 catch(error){try{reader.cancel().catch(()=>{});}catch{/* Never block refusal on cancellation. */}throw error;}
 finally{clearTimeout(timer);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{reject('invalid_json');}
}
export default {async fetch(request,env){
 try{
  const url=new URL(request.url);
  // Accidental deployment is refused even if a fixture binding was copied.
  if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/private/draft-render')return json({error:'not_found'},404);
  if(env.LOCAL_RENDER_REHEARSAL!=='true')return json({error:'local_rehearsal_disabled'},503);
  if(request.method!=='POST')return json({error:'post_required'},405);
  const ctx=await requireRole(request,env,MARKETING_DESK);if(ctx instanceof Response)return ctx;
  if(ctx.type!=='staff'||!ctx.distinct_id)return json({error:'staff_required'},403);
  if(request.headers.get('origin')!==url.origin)return json({error:'same_origin_required'},403);
  const input=await body(request);
  exact(input,['requestId','postId','mediaId','postRevision','sourceKey','sourceSha256','options']);
  for(const field of ['requestId','postId','mediaId'])text(input[field],field==='requestId'?200:100);
  if(!Number.isSafeInteger(input.postRevision)||input.postRevision<1||!validSourceKey(input.sourceKey)||typeof input.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceSha256))reject('invalid_source_binding');
  exact(input.options,['templateId','title','kicker']);
  if(!['reposado-wide','reposado-cajita'].includes(input.options.templateId))reject('invalid_template');
  text(input.options.title,80);text(input.options.kicker,50);
  if(!env.RENDER_EXECUTOR)return json({error:'executor_unavailable'},503);
  const receipt=await env.RENDER_EXECUTOR.getByName('anejo-local-editorial-executor').execute({actorId:ctx.distinct_id,requestId:input.requestId},input);
  if(!receipt.admitted)return json({error:receipt.state==='busy'?'private_render_busy':'private_render_active_unknown'},receipt.state==='busy'?429:409);
  if(receipt.outcome!=='fulfilled')return json({error:'private_render_failed',attachment:'unverified'},500);
  const result=receipt.value;return json(result,result.status||(['attached','already_rendered'].includes(result.state)?200:409));
 }catch(error){
  const known=error.status||error.name==='SourceVersionError'||error.name==='RenderJobError';
  return json({error:known&&/^[a-z][a-z0-9_]{0,63}$/.test(error.message)?error.message:'private_render_failed'},error.status||(known?409:500));
 }
}};

// All compute/storage work runs inside this single server-selected coordinator.
// No job/actor-selected identities, TTL release, detached tasks or response races.
export class PrivateRenderExecutor extends LocalDurableAdmission {
 async [OWNED_LOCAL_WORK](input,{actorId}){
  const env=this.env,deadline=createExecutionDeadline();
  try{
  const store=createRenderJobStore(env.DB),optionsHash=await deadline.dispatch('options_hash',()=>renderOptionsHash(input.options));
  const binding={postId:input.postId,mediaId:input.mediaId,postRevision:input.postRevision,sourceKey:input.sourceKey,sourceSha256:input.sourceSha256};
  const existing=await deadline.dispatch('existing_job',()=>env.DB.prepare('SELECT id FROM prototype_render_jobs WHERE actor_id=? AND request_id=?').bind(actorId,input.requestId).first());
  let sourceVersionId,sourceMetadataSha256;
  if(existing){
   const job=await deadline.dispatch('job_read',()=>store.get({actorId,jobId:existing.id,deadline}));
   if(!job||Object.keys(binding).some(key=>job.descriptor[key]!==binding[key])||job.descriptor.optionsHash!==optionsHash||job.descriptor.rendererVersion!==rendererVersion||job.descriptor.templateId!==input.options.templateId)reject('request_conflict',409);
   // A durable rendered receipt is not a new verification of current attachment.
   if(job.status==='rendered')return {state:'already_rendered',jobId:job.id,attachment:'unverified',humanReviewRequired:true};
   sourceVersionId=job.descriptor.sourceVersionId;sourceMetadataSha256=job.descriptor.sourceMetadataSha256;
  }else{
   const captured=await captureSourceVersion({db:env.DB,media:env.MEDIA,actorId,requestId:'capture:'+input.requestId,descriptor:binding,now:Date.now(),deadline});
   sourceVersionId=captured.version.id;sourceMetadataSha256=captured.version.metadataSha256;
  }
  const queued=await deadline.dispatch('enqueue',()=>store.enqueue({actorId,requestId:input.requestId,descriptor:{...binding,sourceVersionId,sourceMetadataSha256,rendererVersion,templateId:input.options.templateId,optionsHash},now:Date.now(),deadline}));
  const render=async({source,options})=>{
   await deadline.dispatch('initialize',()=>initialize(wasm));
   deadline.check('source_color');
   admitSourceColor(source);
   deadline.check('render');
   return renderEditorial({source,emblem:new Uint8Array(emblem),font:new Uint8Array(font),kickerFont:new Uint8Array(kickerFont),...options});
  };
  const normalizeSource=async({artifact})=>{
   const normalizer=await deadline.dispatch('normalizer_initialize',()=>createWorkerNormalizer(wasm,colorWasm));
   return captureNormalizedSource({db:env.DB,media:env.MEDIA,actorId,sourceVersionId:artifact.version.id,normalizerVersion:'resvg-lcms-rgba-1',normalize:bytes=>normalizer.normalize(bytes,{deadline}),now:Date.now(),deadline});
  };
  const result=await consumePrivateRender({db:env.DB,media:env.MEDIA,actorId,jobId:queued.job.id,rendererVersion,options:input.options,render,normalizeSource,now:Date.now,leaseMs:30000,deadline});
  return result;
  }catch(error){
   const known=error.status||['SourceVersionError','RenderJobError','ExecutionDeadlineError','SourceColorError'].includes(error.name);
   return {error:known&&/^[a-z][a-z0-9_]{0,63}$/.test(error.message)?error.message:'private_render_failed',status:error.status||(error.name==='ExecutionDeadlineError'?408:known?409:500),attachment:'unverified'};
  }
 }
}
