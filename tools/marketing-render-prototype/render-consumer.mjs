// LOCAL private consumer rehearsal. Not imported by application routes or schedulers.
import {sha256,jpegDimensions} from '../../functions/_lib/marketing_render_receipt.js';
import {createRenderJobStore} from './render-jobs.mjs';

function canonical(value,depth=0){
 if(depth>6)throw Error('invalid_options');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value==='string'&&value.length<=2000)return value;
 if(Array.isArray(value)&&value.length<=100)return value.map(v=>canonical(v,depth+1));
 if(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length<=100){
  const out={};for(const key of Object.keys(value).sort()){if(['__proto__','constructor','prototype'].includes(key))throw Error('invalid_options');out[key]=canonical(value[key],depth+1);}return out;
 }
 throw Error('invalid_options');
}
export async function renderOptionsHash(options){
 const text=JSON.stringify(canonical(options));if(text.length>12288)throw Error('invalid_options');
 return sha256(new TextEncoder().encode(text));
}
const metadataText=value=>JSON.stringify(canonical(value||{}));
async function object(media,key){
 const saved=await media.get(key);if(!saved||!Number.isSafeInteger(saved.size)||saved.size<1||saved.size>5*1024*1024)throw Error('object_unavailable');
 const bytes=new Uint8Array(await saved.arrayBuffer());if(bytes.length!==saved.size)throw Error('object_size_changed');
 return {bytes,hash:await sha256(bytes),metadata:saved.customMetadata||{},metadataText:metadataText(saved.customMetadata)};
}

// Caller is an internal trusted executor, NOT an HTTP client. No resource/approval gate
// is satisfied here. Time, renderer code/assets and options are executor supplied.
export async function consumePrivateRender({db,media,actorId,rendererVersion,options,render,now,leaseMs=30000}){
 const renderOptions=canonical(options);
 const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(renderOptions);
 const store=createRenderJobStore(db),leased=await store.claim({actorId,now:now(),leaseMs});
 if(!leased)return {state:'no_job'};
 const d=leased.descriptor;
 const target=()=>db.prepare(`SELECT p.status,p.updated_at,m.media_key FROM social_posts p JOIN social_post_media m ON m.post_id=p.id
  WHERE p.id=? AND m.id=? AND p.status='draft' AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=p.id AND revision=?) AND m.media_key=?
  AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES') AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing'))`)
  .bind(d.postId,d.mediaId,d.postRevision,d.sourceKey,actorId).first();
 const recovered=async()=>{
  const current=await store.get({actorId,jobId:leased.id});
  if(current?.status!=='rendered'||current.fingerprint!==leased.fingerprint||!current.receipt)return null;
  const linked=await db.prepare(`SELECT p.status,p.updated_at,m.media_key FROM social_posts p JOIN social_post_media m ON m.post_id=p.id WHERE p.id=? AND m.id=?`).bind(d.postId,d.mediaId).first();
  const version=await db.prepare('SELECT revision FROM prototype_draft_versions WHERE post_id=?').bind(d.postId).first();
  if(linked?.status!=='draft'||linked.updated_at!==current.updatedAt||version?.revision!==d.postRevision+2||linked.media_key!==current.receipt.outputKey)throw Error('saved_state_changed');
  const saved=await object(media,current.receipt.outputKey);
  if(saved.hash!==current.receipt.sha256||saved.bytes.length!==current.receipt.outputBytes||saved.metadata.render_job_id!==leased.id||saved.metadata.render_fingerprint!==leased.fingerprint)throw Error('output_readback_changed');
  return {state:'attached',jobId:leased.id,receipt:current.receipt,humanReviewRequired:true,publicationApproved:false,resourceReadiness:'unverified'};
 };
 let outputKey=null,commitAttempted=false;
 try{
  if(d.rendererVersion!==rendererVersion||d.optionsHash!==await renderOptionsHash(renderOptions)||renderOptions.templateId!==d.templateId)throw Error('render_binding_changed');
  if(!await target())throw Error('draft_changed');
  const source=await object(media,d.sourceKey);if(source.hash!==d.sourceSha256)throw Error('source_changed');
  const result=await render({source:source.bytes,options:renderOptions,templateId:d.templateId});
  const jpg=result.jpg;if(!(jpg instanceof Uint8Array))throw Error('invalid_render_output');
  const shape=jpegDimensions(jpg),outputHash=await sha256(jpg);
  // Attempt-specific namespace: an expired worker cannot overwrite a successor.
  outputKey=`studio/local-render/${leased.id}/${leased.leaseToken}.jpg`;
  const outputMetadata={...source.metadata,source_key:d.sourceKey,enhancement_method:'editorial_overlay',provenance_basis:'local_resvg_rehearsal',render_job_id:leased.id,render_fingerprint:leased.fingerprint};
  await media.put(outputKey,jpg,{httpMetadata:{contentType:'image/jpeg'},customMetadata:outputMetadata});
  const output=await object(media,outputKey);
  if(output.hash!==outputHash||output.metadataText!==metadataText(outputMetadata))throw Error('output_readback_changed');
  const freshSource=await object(media,d.sourceKey);
  if(freshSource.hash!==source.hash||freshSource.metadataText!==source.metadataText)throw Error('source_changed');
  const receipt={outputKey,sha256:outputHash,outputBytes:jpg.length,width:shape.width,height:shape.height};
  const at=now(),descriptorJson=JSON.stringify(d);
  // Check database execution time too: a queued batch may outlive its dispatch-time lease.
  const leaseSql=`EXISTS(SELECT 1 FROM prototype_render_jobs WHERE id=? AND actor_id=? AND fingerprint=? AND descriptor_json=? AND status='rendering' AND lease_token=? AND lease_until>MAX(?,CAST(unixepoch('subsec')*1000 AS INTEGER)))`;
  const leaseArgs=[leased.id,actorId,leased.fingerprint,descriptorJson,leased.leaseToken,at];
  const guard=()=>db.prepare(`INSERT INTO prototype_render_guards(success) VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END)`);
  commitAttempted=true;
  await db.batch([
   // Post CAS first; its trigger advances the revision once. Slide mutation advances it again.
   db.prepare(`UPDATE social_posts SET scheduled_at=NULL,audit_score=NULL,audit_flags=NULL,audit_at=NULL,audit_status=NULL,audit_scope=NULL,audit_snapshot=NULL,audit_detail_json=NULL,audit_context_snapshot=NULL,auto_audit_required=NULL,original_caption_hash=NULL,original_design_snapshot=NULL,updated_at=?
    WHERE id=? AND status='draft' AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=? AND revision=?)
    AND COALESCE(media_type,'') NOT IN ('REELS','STORIES')
    AND EXISTS(SELECT 1 FROM social_post_media WHERE id=? AND post_id=? AND media_key=?)
    AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing')) AND ${leaseSql}`)
    .bind(at,d.postId,d.postId,d.postRevision,d.mediaId,d.postId,d.sourceKey,actorId,...leaseArgs),guard(),
   db.prepare(`UPDATE social_post_media SET media_key=?,public_token=? WHERE id=? AND post_id=? AND media_key=?
    AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='draft')
    AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=? AND revision=?)
    AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing')) AND ${leaseSql}`)
    .bind(outputKey,crypto.randomUUID(),d.mediaId,d.postId,d.sourceKey,d.postId,d.postId,d.postRevision+1,actorId,...leaseArgs),guard(),
   db.prepare(`UPDATE prototype_render_jobs SET status='rendered',receipt_json=?,lease_token=NULL,lease_until=NULL,updated_at=?,error_code=NULL
    WHERE id=? AND actor_id=? AND fingerprint=? AND descriptor_json=? AND status='rendering' AND lease_token=? AND lease_until>MAX(?,CAST(unixepoch('subsec')*1000 AS INTEGER))
    AND EXISTS(SELECT 1 FROM social_post_media WHERE id=? AND post_id=? AND media_key=?)
    AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=? AND revision=?)`)
    .bind(JSON.stringify(receipt),at,...leaseArgs,d.mediaId,d.postId,outputKey,d.postId,d.postRevision+2),guard(),
  ]);
  const saved=await recovered();if(!saved)throw Error('attachment_not_verified');return saved;
 }catch(error){
  // A thrown response can follow a committed transaction. Never blindly retry/reattach.
  if(commitAttempted){try{const saved=await recovered();if(saved)return {...saved,recoveredCommit:true};}catch{return {state:'commit_unknown',jobId:leased.id,outputKey,attached:'unverified'};}}
  const code=/^[a-z][a-z0-9_]{0,63}$/.test(error.message)?error.message:'consumer_failed';
  try{await store.fail({actorId,jobId:leased.id,leaseToken:leased.leaseToken,errorCode:code,now:now()});}
  catch{return {state:commitAttempted?'commit_unknown':'lease_lost',jobId:leased.id,outputKey,attached:'unverified',errorCode:code};}
  return {state:'failed',jobId:leased.id,outputKey,attached:false,errorCode:code};
 }
}
