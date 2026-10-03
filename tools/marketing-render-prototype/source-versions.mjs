// Local trusted-executor foundation; no HTTP route, job integration, approval or deployment.
// Create-only puts protect this writer. Other bucket writers/admins can still mutate/delete
// these objects. D1/R2 are not an atomic transaction; private orphans are intentionally kept.
// API reference: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
import {sha256,sourceKey,sourceMagicValid} from '../../functions/_lib/marketing_render_receipt.js';
import {readBoundedBody} from './bounded-body.mjs';
const LIMIT=5*1024*1024;
async function dispatch(deadline,stage,operation){deadline?.check(stage);try{return await operation();}finally{deadline?.check(stage);}}
function deadlineLimit(deadline){if(!deadline)return Number.MAX_SAFE_INTEGER;if(!Number.isSafeInteger(deadline.expiresAt)||typeof deadline.check!=='function')throw Error('invalid_execution_deadline');return deadline.expiresAt;}
async function trustedBody(body,deadline){
 const reader=body.getReader(),chunks=[];let size=0,count=0,empty=0;
 try{while(true){const {done,value}=await dispatch(deadline,'source_body_read',()=>reader.read());if(done)break;if(++count>32768||(!value.byteLength&&++empty>64)||(size+=value.byteLength)>LIMIT)throw Error('bounded_source_read_refused');chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export class SourceVersionError extends Error{
 constructor(code,row=null){super(code);this.name='SourceVersionError';this.code=code;if(row){this.versionId=row.id;this.versionKey=row.version_key;this.artifactState='unattached_or_unknown';}}
}
function text(value,name,max=256){if(typeof value!=='string'||!value||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/u.test(value))throw new SourceVersionError('invalid_'+name);return value;}
function integer(value,name,min=0){if(!Number.isSafeInteger(value)||value<min)throw new SourceVersionError('invalid_'+name);return value;}
const hash=text=>sha256(new TextEncoder().encode(text));
function descriptor(value){
 const fields=['postId','mediaId','postRevision','sourceKey','sourceSha256'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k)))throw new SourceVersionError('invalid_descriptor');
 const d={postId:text(value.postId,'postId',100),mediaId:text(value.mediaId,'mediaId',100),postRevision:integer(value.postRevision,'postRevision',1),sourceKey:value.sourceKey,sourceSha256:value.sourceSha256};
 if(!sourceKey(d.sourceKey)||typeof d.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(d.sourceSha256))throw new SourceVersionError('invalid_source_binding');
 return d;
}
function metadata(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>100)throw new SourceVersionError('invalid_source_metadata');
 const out={};for(const key of Object.keys(value).sort()){
  if(['__proto__','constructor','prototype'].includes(key)||key.length>128||typeof value[key]!=='string'||value[key].length>2048)throw new SourceVersionError('invalid_source_metadata');
  out[key]=value[key];
 }
 const json=JSON.stringify(out);if(new TextEncoder().encode(json).length>4096)throw new SourceVersionError('invalid_source_metadata');return json;
}
async function read(media,key,deadline){
 const object=await dispatch(deadline,'source_get',()=>media.get(key));if(!object)return null;
 if(!Number.isSafeInteger(object.size)||object.size<1||object.size>LIMIT){try{if(!deadline)object.body?.cancel().catch(()=>{});}catch{/* Never wait on cancellation. */}throw new SourceVersionError('invalid_source_size');}
 // Existing local helper bounds actual bytes, fragments, empty chunks and read deadline.
 let bytes;try{bytes=deadline?await trustedBody(object.body,deadline):await readBoundedBody({headers:new Headers({'content-length':String(object.size)}),body:object.body});}catch(error){deadline?.check('source_body_failed');throw new SourceVersionError('bounded_source_read_refused');}
 if(bytes.length!==object.size)throw new SourceVersionError('object_size_changed');
 return {bytes,sha256:await dispatch(deadline,'source_hash',()=>sha256(bytes)),metadataJson:metadata(object.customMetadata||{}),contentType:object.httpMetadata?.contentType||'application/octet-stream'};
}
const objectMetadata=row=>({source_version_id:row.id,source_sha256:row.source_sha256,source_metadata_sha256:row.metadata_sha256});
const version=row=>({id:row.id,actorId:row.actor_id,requestId:row.request_id,descriptor:JSON.parse(row.descriptor_json),versionKey:row.version_key,sourceSha256:row.source_sha256,sourceBytes:row.source_bytes,metadataJson:row.metadata_json,metadataSha256:row.metadata_sha256,contentType:row.content_type,createdAt:row.created_at,confirmedAt:row.confirmed_at});
async function verifyObject(media,row,deadline){
 const saved=await read(media,row.version_key,deadline);
 if(!saved||saved.sha256!==row.source_sha256||saved.bytes.length!==row.source_bytes||saved.metadataJson!==metadata(objectMetadata(row))||saved.contentType!==row.content_type)throw new SourceVersionError('source_version_readback_changed',row);
 return saved;
}
const eligible=`EXISTS(SELECT 1 FROM social_posts p JOIN social_post_media m ON m.post_id=p.id JOIN prototype_draft_versions v ON v.post_id=p.id
 WHERE p.id=? AND m.id=? AND m.media_key=? AND v.revision=? AND p.status='draft' AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES'))
 AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing'))`;
const eligibilityArgs=(d,actorId)=>[d.postId,d.mediaId,d.sourceKey,d.postRevision,actorId];

// Independent version verification intentionally does not require the old draft still exists.
// Consumers must separately fence current draft selection/revision and authorization.
export async function readConfirmedSourceArtifact({db,media,actorId,versionId,deadline}){
 text(actorId,'actorId');text(versionId,'versionId');
 deadlineLimit(deadline);
 const row=await dispatch(deadline,'source_record_read',()=>db.prepare("SELECT * FROM prototype_source_versions WHERE id=? AND actor_id=? AND state='confirmed'").bind(versionId,actorId).first());
 if(!row)return null;const saved=await verifyObject(media,row,deadline);
 const fresh=await dispatch(deadline,'source_record_recheck',()=>db.prepare("SELECT * FROM prototype_source_versions WHERE id=? AND actor_id=? AND state='confirmed'").bind(versionId,actorId).first());
 if(!fresh||JSON.stringify(fresh)!==JSON.stringify(row))throw new SourceVersionError('source_version_record_changed',row);
 return {version:version(fresh),bytes:saved.bytes};
}
export async function readConfirmedSourceVersion(input){
 const saved=await readConfirmedSourceArtifact(input);return saved?.version||null;
}

export async function captureSourceVersion({db,media,actorId,requestId,descriptor:input,now,deadline}){
 text(actorId,'actorId');text(requestId,'requestId');integer(now,'now');
 const expiresAt=deadlineLimit(deadline);
 const d=descriptor(input),descriptorJson=JSON.stringify(d),fingerprint=await dispatch(deadline,'source_descriptor_hash',()=>hash(descriptorJson));
 const find=()=>dispatch(deadline,'source_reservation_read',()=>db.prepare('SELECT * FROM prototype_source_versions WHERE actor_id=? AND request_id=?').bind(actorId,requestId).first());
 const target=()=>dispatch(deadline,'source_target_read',()=>db.prepare(`SELECT 1 AS eligible WHERE ${eligible}`).bind(...eligibilityArgs(d,actorId)).first());
 let row=await find(),source=null;
 try{
  if(row&&(row.fingerprint!==fingerprint||row.descriptor_json!==descriptorJson))throw new SourceVersionError('source_version_request_conflict',row);
  if(!await target())throw new SourceVersionError('source_version_draft_changed',row);
  if(row?.state==='rejected')throw new SourceVersionError('source_version_rejected',row);
  if(row?.state==='confirmed'){
   const confirmed=await readConfirmedSourceVersion({db,media,actorId,versionId:row.id,deadline});
   if(!confirmed||!await target())throw new SourceVersionError('source_version_draft_changed',row);
   return {state:'confirmed',version:confirmed,replayed:true};
  }
  source=await read(media,d.sourceKey,deadline);
  if(!source)throw new SourceVersionError('source_unavailable',row);
  if(source.sha256!==d.sourceSha256||!sourceMagicValid(d.sourceKey,source.bytes))throw new SourceVersionError('source_changed',row);
  if(!row){
   const id=crypto.randomUUID(),versionKey='marketing-source-versions/'+id+'.'+d.sourceKey.split('.').at(-1).toLowerCase();
   const metadataHash=await dispatch(deadline,'source_metadata_hash',()=>hash(source.metadataJson));
   try{await dispatch(deadline,'source_reserve',()=>db.prepare(`INSERT INTO prototype_source_versions(id,actor_id,request_id,fingerprint,descriptor_json,version_key,source_sha256,source_bytes,metadata_json,metadata_sha256,content_type,state,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,'pending',? WHERE ? > CAST(unixepoch('subsec')*1000 AS INTEGER) ON CONFLICT(actor_id,request_id) DO NOTHING`).bind(id,actorId,requestId,fingerprint,descriptorJson,versionKey,source.sha256,source.bytes.length,source.metadataJson,metadataHash,text(source.contentType,'contentType',128),now,expiresAt).run());}
   catch{deadline?.check('source_reserve_failed');row=await find();if(!row)throw new SourceVersionError('source_version_reservation_unverified');}
   row=await find();
   if(!row)throw new SourceVersionError('source_version_reservation_unverified');
   if(row.fingerprint!==fingerprint||row.descriptor_json!==descriptorJson)throw new SourceVersionError('source_version_request_conflict',row);
  }
  if(row.state==='rejected')throw new SourceVersionError('source_version_rejected',row);
  if(source.metadataJson!==row.metadata_json||source.contentType!==row.content_type||source.bytes.length!==row.source_bytes)throw new SourceVersionError('source_changed',row);
  // The condition must be on the write, never a preflight HEAD. A null result may be
  // an identical previous attempt; only exact readback can establish that distinction.
  try{await dispatch(deadline,'source_version_put',()=>media.put(row.version_key,source.bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:row.content_type},customMetadata:objectMetadata(row)}));}
  catch{deadline?.check('source_put_failed');/* Ambiguous write acknowledgement: verify the same reserved key below. */}
  await verifyObject(media,row,deadline);
  const freshSource=await read(media,d.sourceKey,deadline);
  if(!freshSource||freshSource.sha256!==row.source_sha256||freshSource.metadataJson!==row.metadata_json||freshSource.contentType!==row.content_type)throw new SourceVersionError('source_changed',row);
  try{await dispatch(deadline,'source_confirm',()=>db.prepare(`UPDATE prototype_source_versions SET state='confirmed',confirmed_at=? WHERE id=? AND actor_id=? AND fingerprint=? AND descriptor_json=? AND state='pending' AND ? > CAST(unixepoch('subsec')*1000 AS INTEGER) AND ${eligible}`)
   .bind(now,row.id,actorId,fingerprint,descriptorJson,expiresAt,...eligibilityArgs(d,actorId)).run());}
  catch{deadline?.check('source_confirm_failed');/* Commit acknowledgement may be lost; confirm durable record and bytes below. */}
  const confirmed=await readConfirmedSourceVersion({db,media,actorId,versionId:row.id,deadline});
  if(!confirmed||!await target())throw new SourceVersionError('source_version_confirmation_unverified',row);
  return {state:'confirmed',version:confirmed,replayed:false};
 }catch(error){
  try{deadline?.check('source_capture_failed');}catch(expired){if(row){expired.versionId=row.id;expired.versionKey=row.version_key;expired.artifactState='unattached_or_unknown';}throw expired;}
  if(error.code==='source_changed'&&row?.state==='pending'){
   try{await dispatch(deadline,'source_reject',()=>db.prepare("UPDATE prototype_source_versions SET state='rejected' WHERE id=? AND actor_id=? AND state='pending' AND ? > CAST(unixepoch('subsec')*1000 AS INTEGER)").bind(row.id,actorId,expiresAt).run());}catch{/* No deletion or claim that rejection was persisted. */}
  }
  if(error instanceof SourceVersionError){if(row&&!error.versionId){error.versionId=row.id;error.versionKey=row.version_key;error.artifactState='unattached_or_unknown';}throw error;}
  throw new SourceVersionError('source_version_capture_unverified',row);
 }
}
