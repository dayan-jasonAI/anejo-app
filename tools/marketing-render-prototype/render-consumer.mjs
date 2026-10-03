// LOCAL private consumer rehearsal. Not imported by application routes or schedulers.
import {sha256,jpegDimensions} from '../../functions/_lib/marketing_render_receipt.js';
import {createRenderJobStore} from './render-jobs.mjs';
import {readConfirmedSourceArtifact} from './source-versions.mjs';
import {readBoundedBody} from './bounded-body.mjs';

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
 const bytes=await readBoundedBody({headers:new Headers({'content-length':String(saved.size)}),body:saved.body});if(bytes.length!==saved.size)throw Error('object_size_changed');
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
 const sourceBinding=JSON.stringify({postId:d.postId,mediaId:d.mediaId,postRevision:d.postRevision,sourceKey:d.sourceKey,sourceSha256:d.sourceSha256});
 const provenance=(metadata,versionKey)=>({...metadata,source_key:d.sourceKey,enhancement_method:'editorial_overlay',provenance_basis:'local_resvg_rehearsal',render_job_id:leased.id,render_fingerprint:leased.fingerprint,source_version_id:d.sourceVersionId,source_version_key:versionKey,source_metadata_sha256:d.sourceMetadataSha256});
 const target=()=>db.prepare(`SELECT p.status,p.updated_at,m.media_key FROM social_posts p JOIN social_post_media m ON m.post_id=p.id
  WHERE p.id=? AND m.id=? AND p.status='draft' AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=p.id AND revision=?) AND m.media_key=?
  AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES') AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing'))`)
  .bind(d.postId,d.mediaId,d.postRevision,d.sourceKey,actorId).first();
 const recovered=async()=>{
  const current=await store.get({actorId,jobId:leased.id});
  if(current?.status!=='rendered'||current.fingerprint!==leased.fingerprint||!current.receipt)return null;
  const saved=await object(media,current.receipt.outputKey);
  if(saved.hash!==current.receipt.sha256||saved.bytes.length!==current.receipt.outputBytes||saved.metadata.render_job_id!==leased.id||saved.metadata.render_fingerprint!==leased.fingerprint)throw Error('output_readback_changed');
  // Read database state AFTER storage: edits while readback awaits must not inherit proof.
  const linked=await db.prepare(`SELECT p.status,p.updated_at,m.media_key,v.revision,j.status AS job_status,j.fingerprint,j.receipt_json,j.updated_at AS job_updated_at,sv.state AS source_state,sv.descriptor_json AS source_descriptor,sv.source_sha256 AS source_hash,sv.metadata_sha256 AS source_metadata_hash,sv.metadata_json AS source_metadata_json,sv.version_key AS source_version_key
   FROM prototype_render_jobs j JOIN social_posts p ON p.id=? JOIN social_post_media m ON m.post_id=p.id AND m.id=?
   JOIN prototype_draft_versions v ON v.post_id=p.id JOIN prototype_source_versions sv ON sv.id=? AND sv.actor_id=? WHERE j.id=? AND j.actor_id=?`).bind(d.postId,d.mediaId,d.sourceVersionId,actorId,leased.id,actorId).first();
  if(linked?.source_state!=='confirmed'||linked.source_descriptor!==sourceBinding||linked.source_hash!==d.sourceSha256||linked.source_metadata_hash!==d.sourceMetadataSha256||linked.status!=='draft'||linked.job_status!=='rendered'||linked.fingerprint!==leased.fingerprint||linked.receipt_json!==JSON.stringify(current.receipt)||linked.updated_at!==linked.job_updated_at||linked.revision!==d.postRevision+2||linked.media_key!==current.receipt.outputKey)throw Error('saved_state_changed');
  if(saved.metadataText!==metadataText(provenance(JSON.parse(linked.source_metadata_json),linked.source_version_key)))throw Error('output_readback_changed');
  return {state:'attached',jobId:leased.id,receipt:current.receipt,humanReviewRequired:true,publicationApproved:false,resourceReadiness:'unverified'};
 };
 let outputKey=null,commitAttempted=false;
 try{
  if(d.rendererVersion!==rendererVersion||d.optionsHash!==await renderOptionsHash(renderOptions)||renderOptions.templateId!==d.templateId)throw Error('render_binding_changed');
  if(!await target())throw Error('draft_changed');
  const artifact=await readConfirmedSourceArtifact({db,media,actorId,versionId:d.sourceVersionId});
  if(!artifact||JSON.stringify(artifact.version.descriptor)!==sourceBinding||artifact.version.sourceSha256!==d.sourceSha256||artifact.version.metadataSha256!==d.sourceMetadataSha256)throw Error('source_version_binding_changed');
  const source={bytes:artifact.bytes,metadata:JSON.parse(artifact.version.metadataJson)};
  const result=await render({source:source.bytes,options:renderOptions,templateId:d.templateId});
  const jpg=result.jpg;if(!(jpg instanceof Uint8Array))throw Error('invalid_render_output');
  const shape=jpegDimensions(jpg),outputHash=await sha256(jpg);
  // Attempt-specific namespace: an expired worker cannot overwrite a successor.
  outputKey=`studio/local-render/${leased.id}/${leased.leaseToken}.jpg`;
  const outputMetadata=provenance(source.metadata,artifact.version.versionKey);
  await media.put(outputKey,jpg,{httpMetadata:{contentType:'image/jpeg'},customMetadata:outputMetadata});
  const output=await object(media,outputKey);
  if(output.hash!==outputHash||output.metadataText!==metadataText(outputMetadata))throw Error('output_readback_changed');
  const freshSource=await readConfirmedSourceArtifact({db,media,actorId,versionId:d.sourceVersionId});
  if(!freshSource||JSON.stringify(freshSource.version)!==JSON.stringify(artifact.version))throw Error('source_version_binding_changed');
  const receipt={outputKey,sha256:outputHash,outputBytes:jpg.length,width:shape.width,height:shape.height};
  const at=now(),descriptorJson=JSON.stringify(d);
  // Check database execution time too: a queued batch may outlive its dispatch-time lease.
  const versionSql=`EXISTS(SELECT 1 FROM prototype_source_versions WHERE id=? AND actor_id=? AND state='confirmed' AND descriptor_json=? AND source_sha256=? AND metadata_sha256=?)`;
  const versionArgs=[d.sourceVersionId,actorId,sourceBinding,d.sourceSha256,d.sourceMetadataSha256];
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
    AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing')) AND ${leaseSql} AND ${versionSql}`)
    .bind(at,d.postId,d.postId,d.postRevision,d.mediaId,d.postId,d.sourceKey,actorId,...leaseArgs,...versionArgs),guard(),
   db.prepare(`UPDATE social_post_media SET media_key=?,public_token=? WHERE id=? AND post_id=? AND media_key=?
    AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='draft')
    AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=? AND revision=?)
    AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing')) AND ${leaseSql} AND ${versionSql}`)
    .bind(outputKey,crypto.randomUUID(),d.mediaId,d.postId,d.sourceKey,d.postId,d.postId,d.postRevision+1,actorId,...leaseArgs,...versionArgs),guard(),
   db.prepare(`UPDATE prototype_render_jobs SET status='rendered',receipt_json=?,lease_token=NULL,lease_until=NULL,updated_at=?,error_code=NULL
    WHERE id=? AND actor_id=? AND fingerprint=? AND descriptor_json=? AND status='rendering' AND lease_token=? AND lease_until>MAX(?,CAST(unixepoch('subsec')*1000 AS INTEGER))
    AND EXISTS(SELECT 1 FROM social_post_media WHERE id=? AND post_id=? AND media_key=?)
    AND EXISTS(SELECT 1 FROM prototype_draft_versions WHERE post_id=? AND revision=?) AND ${versionSql}`)
    .bind(JSON.stringify(receipt),at,...leaseArgs,d.mediaId,d.postId,outputKey,d.postId,d.postRevision+2,...versionArgs),guard(),
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
