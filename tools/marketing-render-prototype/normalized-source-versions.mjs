// LOCAL trusted-executor foundation. No route, publication approval, or app integration.
import {sha256} from '../../functions/_lib/marketing_render_receipt.js';
import {readConfirmedSourceArtifact} from './source-versions.mjs';
import {dimensions} from './core.mjs';
import {admitSourceColor} from './source-color-admission.mjs';
import {readWorkerSourceMetadata} from './worker-source-metadata.mjs';

const LIMIT=5*1024*1024,CONTENT_TYPE='image/png';
const NORMALIZER_VERSION='resvg-lcms-rgba-2',KERNEL_VERSION='lcms-wasm-1.0.5-rgb-kernel-1';
const RECEIPT_FIELDS=['schema','runtime','normalizerVersion','kernelVersion','originalSha256','derivativeSha256','sourceProfileSha256','sourceColorStatus','outputColor','conversionPerformed','originalOrientation','originalWidth','originalHeight','width','height','resized','resizePolicy','bytes','format','visualReviewRequired','resourceReadiness'];
const text=(value,name,max=256)=>{if(typeof value!=='string'||!value||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/u.test(value))throw new NormalizedSourceError('invalid_'+name);return value;};
const hashPattern=/^[a-f0-9]{64}$/;
const deadlineLimit=deadline=>{if(!deadline)return Number.MAX_SAFE_INTEGER;if(!Number.isSafeInteger(deadline.expiresAt)||typeof deadline.check!=='function')throw Error('invalid_execution_deadline');return deadline.expiresAt;};
async function dispatch(deadline,stage,operation){deadline?.check(stage);try{return await operation();}finally{deadline?.check(stage);}}
async function digest(bytes,deadline,stage){return dispatch(deadline,stage,()=>sha256(bytes));}
function metadataJson(value){const keys=Object.keys(value||{}).sort(),out={};for(const key of keys){if(typeof value[key]!=='string'||key.length>128||value[key].length>2048)throw new NormalizedSourceError('invalid_object_metadata');out[key]=value[key];}return JSON.stringify(out);}
function equalMetadata(actual,expected){return metadataJson(actual)===metadataJson(expected);}
function safeJson(value,name,max=8192){const json=JSON.stringify(value);if(typeof json!=='string'||new TextEncoder().encode(json).length>max)throw new NormalizedSourceError('invalid_'+name);return json;}
function plainObject(value){return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null));}
function exactFields(value,fields,name){if(!plainObject(value)||Object.keys(value).length!==fields.length||fields.some(k=>!Object.hasOwn(value,k)))throw new NormalizedSourceError('invalid_'+name);}

export class NormalizedSourceError extends Error{
 constructor(code,row=null){super(code);this.name='NormalizedSourceError';this.code=code;if(row){this.versionId=row.id;this.versionKey=row.version_key;this.artifactState='unattached_or_unknown';}}
}

const eligible=`EXISTS(SELECT 1 FROM social_posts p JOIN social_post_media m ON m.post_id=p.id JOIN prototype_draft_versions v ON v.post_id=p.id
 WHERE p.id=? AND m.id=? AND m.media_key=? AND v.revision=? AND p.status='draft' AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES'))
 AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing'))`;
function eligibilityArgs(descriptor,actorId){return [descriptor.postId,descriptor.mediaId,descriptor.sourceKey,descriptor.postRevision,actorId];}
async function assertEligible(db,descriptor,actorId,deadline,stage='normalized_target_read'){
 const ok=await dispatch(deadline,stage,()=>db.prepare(`SELECT 1 AS eligible WHERE ${eligible}`).bind(...eligibilityArgs(descriptor,actorId)).first());
 if(!ok)throw new NormalizedSourceError('normalized_source_target_changed');
}
async function assertActorActive(db,actorId,deadline,stage='normalized_actor_read'){
 const ok=await dispatch(deadline,stage,()=>db.prepare("SELECT 1 AS eligible FROM staff WHERE id=? AND active=1 AND role IN ('owner','marketing')").bind(actorId).first());
 if(!ok)throw new NormalizedSourceError('normalized_actor_ineligible');
}

function normalizedVersion(row){return {id:row.id,actorId:row.actor_id,sourceVersionId:row.source_version_id,normalizerVersion:row.normalizer_version,
 descriptor:JSON.parse(row.descriptor_json),originalVersion:JSON.parse(row.original_version_json),originalSha256:row.original_sha256,originalBytes:row.original_bytes,
 originalMetadataJson:row.original_metadata_json,originalMetadataSha256:row.original_metadata_sha256,originalContentType:row.original_content_type,
 derivativeKey:row.version_key,derivativeSha256:row.derivative_sha256,derivativeBytes:row.derivative_bytes,derivativeContentType:row.derivative_content_type,
 derivativeMetadataJson:row.derivative_metadata_json,derivativeMetadataSha256:row.derivative_metadata_sha256,receiptJson:row.receipt_json,receiptSha256:row.receipt_sha256,
 createdAt:row.created_at,confirmedAt:row.confirmed_at};}
function versionSnapshot(version){return JSON.stringify(version);}
function sourceSnapshot(source){
 const v=source.version;
 return {versionJson:versionSnapshot(v),descriptorJson:JSON.stringify(v.descriptor),sourceSha256:v.sourceSha256,sourceBytes:v.sourceBytes,
  metadataJson:v.metadataJson,metadataSha256:v.metadataSha256,contentType:v.contentType,versionKey:v.versionKey,createdAt:v.createdAt,confirmedAt:v.confirmedAt};
}
function matchesSource(row,source){
 const s=sourceSnapshot(source);
 return row.actor_id===source.version.actorId&&row.source_version_id===source.version.id&&row.original_version_json===s.versionJson&&
 row.descriptor_json===s.descriptorJson&&row.original_sha256===s.sourceSha256&&row.original_bytes===s.sourceBytes&&
 row.original_metadata_json===s.metadataJson&&row.original_metadata_sha256===s.metadataSha256&&row.original_content_type===s.contentType&&
 row.original_version_key===s.versionKey&&row.original_created_at===s.createdAt&&row.original_confirmed_at===s.confirmedAt;
}

async function originalArtifact(db,media,actorId,sourceVersionId,deadline){
 const source=await readConfirmedSourceArtifact({db,media,actorId,versionId:sourceVersionId,deadline});
 if(!source)throw new NormalizedSourceError('normalized_source_original_unavailable');
 if(source.version.actorId!==actorId||source.version.id!==sourceVersionId||source.version.sourceSha256!==source.version.descriptor.sourceSha256)throw new NormalizedSourceError('normalized_source_original_binding_invalid');
 await assertActorActive(db,actorId,deadline);
 return source;
}

async function validateReceipt({source,sourceMetadata,derivative,receipt,normalizerVersion,deadline}){
 exactFields(receipt,RECEIPT_FIELDS,'normalizer_receipt');
 if(receipt.schema!=='anejo-worker-source-normalization-v1'||receipt.runtime!=='local-worker-prototype'||receipt.normalizerVersion!==normalizerVersion||normalizerVersion!==NORMALIZER_VERSION||receipt.kernelVersion!==KERNEL_VERSION)throw new NormalizedSourceError('normalizer_version_mismatch');
 if(!(derivative instanceof Uint8Array)||derivative.length<1||derivative.length>LIMIT)throw new NormalizedSourceError('normalized_derivative_size_invalid');
 const sourceShape=dimensions(source.bytes),derivativeHash=await digest(derivative,deadline,'normalized_derivative_hash');
 const sourceProfileHash=sourceMetadata.profile?await digest(sourceMetadata.profile,deadline,'normalized_profile_hash'):null;
 if(receipt.originalSha256!==source.version.sourceSha256||receipt.derivativeSha256!==derivativeHash||receipt.sourceProfileSha256!==sourceProfileHash||receipt.sourceColorStatus!==sourceMetadata.colorStatus||receipt.originalOrientation!==sourceMetadata.orientation||receipt.originalWidth!==sourceShape.width||receipt.originalHeight!==sourceShape.height||receipt.bytes!==derivative.length||receipt.format!=='png'||receipt.outputColor!=='declared_srgb'||receipt.visualReviewRequired!==true||receipt.resourceReadiness!=='unverified'||typeof receipt.conversionPerformed!=='boolean'||receipt.conversionPerformed!==Boolean(sourceMetadata.profile)||typeof receipt.resized!=='boolean'||receipt.resizePolicy!=='inside-2000x2000-no-enlargement-bilinear-premultiplied-alpha-max-5mib')throw new NormalizedSourceError('normalizer_receipt_binding_invalid');
 const uprightWidth=receipt.originalOrientation>=5?sourceShape.height:sourceShape.width,uprightHeight=receipt.originalOrientation>=5?sourceShape.width:sourceShape.height;
 const candidates=[2000,1600,1280,1024].map(edge=>{const scale=Math.min(1,edge/uprightWidth,edge/uprightHeight);return {width:Math.max(1,Math.round(uprightWidth*scale)),height:Math.max(1,Math.round(uprightHeight*scale))};});
 // The receipt binds one fixed retry candidate. It cannot independently prove that
 // earlier candidates exceeded 5 MiB because the verifier does not re-encode them.
 const expected=candidates.find(candidate=>candidate.width===receipt.width&&candidate.height===receipt.height);
 if(!expected||receipt.resized!==(receipt.width!==uprightWidth||receipt.height!==uprightHeight))throw new NormalizedSourceError('normalizer_dimensions_invalid');
 const shape=dimensions(derivative),admission=admitSourceColor(derivative);
 if(shape.type!=='png'||shape.width!==receipt.width||shape.height!==receipt.height||admission.colorStatus!=='declared_srgb'||admission.orientation!==1)throw new NormalizedSourceError('normalized_png_contract_invalid');
 const ordered={};for(const key of RECEIPT_FIELDS)ordered[key]=receipt[key];
 const receiptJson=safeJson(ordered,'normalizer_receipt',4096),receiptSha256=await digest(new TextEncoder().encode(receiptJson),deadline,'normalized_receipt_hash');
 return {derivativeHash,receiptJson,receiptSha256,shape};
}

function derivativeMetadata(row){return {normalized_source_version_id:row.id,source_version_id:row.source_version_id,source_sha256:row.original_sha256,normalizer_version:row.normalizer_version,derivative_sha256:row.derivative_sha256,receipt_sha256:row.receipt_sha256};}
async function readBoundedObject(media,key,deadline){
 const object=await dispatch(deadline,'normalized_r2_get',()=>media.get(key));if(!object)return null;
 if(!Number.isSafeInteger(object.size)||object.size<1||object.size>LIMIT){try{if(!deadline)object.body?.cancel?.().catch(()=>{});}catch{}throw new NormalizedSourceError('normalized_object_size_invalid');}
 const reader=object.body?.getReader?.();if(!reader)throw new NormalizedSourceError('normalized_object_body_missing');
 const chunks=[];let size=0,count=0,empty=0;
 try{while(true){const {done,value}=await dispatch(deadline,'normalized_r2_read',()=>reader.read());if(done)break;if(++count>32768||(!value.byteLength&&++empty>64)||(size+=value.byteLength)>LIMIT)throw new NormalizedSourceError('normalized_object_body_unbounded');chunks.push(value);}}
 finally{reader.releaseLock();}
 if(size!==object.size)throw new NormalizedSourceError('normalized_object_size_changed');
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 return {object,bytes,sha256:await digest(bytes,deadline,'normalized_object_hash')};
}
async function verifyDerivative(media,row,deadline){
 const saved=await readBoundedObject(media,row.version_key,deadline),expectedMeta=JSON.parse(row.derivative_metadata_json);
 if(!saved||saved.sha256!==row.derivative_sha256||saved.bytes.length!==row.derivative_bytes||saved.object.httpMetadata?.contentType!==CONTENT_TYPE||saved.object.httpMetadata?.contentType!==row.derivative_content_type||!equalMetadata(saved.object.customMetadata||{},expectedMeta)||!equalMetadata(expectedMeta,derivativeMetadata(row)))throw new NormalizedSourceError('normalized_derivative_readback_changed',row);
 const verified=await validateReadback(saved.bytes,row,deadline);
 return {...saved,...verified};
}
async function validateReadback(bytes,row,deadline){
 const source=await readConfirmedSourceArtifact({db:row._db,media:row._media,actorId:row.actor_id,versionId:row.source_version_id,deadline});
 if(!source||!matchesSource(row,source))throw new NormalizedSourceError('normalized_original_changed',row);
 const sourceMetadata=await dispatch(deadline,'normalized_source_metadata_read',()=>readWorkerSourceMetadata(source.bytes,{deadline}));
 const receipt=JSON.parse(row.receipt_json),validated=await validateReceipt({source,sourceMetadata,derivative:bytes,receipt,normalizerVersion:row.normalizer_version,deadline});
 if(validated.derivativeHash!==row.derivative_sha256||validated.receiptJson!==row.receipt_json||validated.receiptSha256!==row.receipt_sha256)throw new NormalizedSourceError('normalized_receipt_readback_changed',row);
 return {source,validated};
}

async function loadRow(db,actorId,versionId,deadline,stage='normalized_record_read'){
 return dispatch(deadline,stage,()=>db.prepare("SELECT * FROM prototype_normalized_source_versions WHERE id=? AND actor_id=? AND state='confirmed'").bind(versionId,actorId).first());
}
async function findIdentity(db,actorId,sourceVersionId,normalizerVersion,deadline){
 return dispatch(deadline,'normalized_reservation_read',()=>db.prepare('SELECT * FROM prototype_normalized_source_versions WHERE actor_id=? AND source_version_id=? AND normalizer_version=?').bind(actorId,sourceVersionId,normalizerVersion).first());
}

export async function readConfirmedNormalizedSource({db,media,actorId,versionId,deadline}){
 text(actorId,'actor_id');text(versionId,'version_id');deadlineLimit(deadline);
 let row=await loadRow(db,actorId,versionId,deadline);if(!row)return null;
 if(row.normalizer_version!==NORMALIZER_VERSION||row.derivative_content_type!==CONTENT_TYPE||!hashPattern.test(row.derivative_sha256)||!hashPattern.test(row.receipt_sha256))throw new NormalizedSourceError('normalized_record_invalid',row);
 const source=await originalArtifact(db,media,actorId,row.source_version_id,deadline);
 if(!matchesSource(row,source))throw new NormalizedSourceError('normalized_original_changed',row);
 const saved=await verifyDerivative(media,{...row,_db:db,_media:media},deadline);
 await assertActorActive(db,actorId,deadline,'normalized_actor_recheck');
 const freshSource=await originalArtifact(db,media,actorId,row.source_version_id,deadline);
 if(!matchesSource(row,freshSource))throw new NormalizedSourceError('normalized_original_changed',row);
 const fresh=await loadRow(db,actorId,versionId,deadline,'normalized_record_recheck');
 if(!fresh||JSON.stringify(fresh)!==JSON.stringify(row))throw new NormalizedSourceError('normalized_record_changed',row);
 return {version:normalizedVersion(fresh),bytes:saved.bytes};
}

export async function captureNormalizedSource({db,media,actorId,sourceVersionId,normalizerVersion,normalize,now,deadline}){
 text(actorId,'actor_id');text(sourceVersionId,'source_version_id');text(normalizerVersion,'normalizer_version',128);
 if(normalizerVersion!==NORMALIZER_VERSION||typeof normalize!=='function'||!Number.isSafeInteger(now)||now<0)throw new NormalizedSourceError('invalid_normalizer_request');
 const expiresAt=deadlineLimit(deadline);
 let row=null;
 try{
  const source=await originalArtifact(db,media,actorId,sourceVersionId,deadline);
  await assertEligible(db,source.version.descriptor,actorId,deadline,'normalized_capture_target_read');
  const sourceMeta=await dispatch(deadline,'normalized_source_metadata',()=>readWorkerSourceMetadata(source.bytes,{deadline}));
  row=await findIdentity(db,actorId,sourceVersionId,normalizerVersion,deadline);
  if(row&&!matchesSource(row,source))throw new NormalizedSourceError('normalized_original_changed',row);
  if(row?.state==='confirmed'){
   const confirmed=await readConfirmedNormalizedSource({db,media,actorId,versionId:row.id,deadline});
   if(!confirmed)throw new NormalizedSourceError('normalized_confirmation_unverified',row);
   return {state:'confirmed',version:confirmed.version,bytes:confirmed.bytes,replayed:true};
  }
  const result=await dispatch(deadline,'normalizer_run',()=>normalize(new Uint8Array(source.bytes),deadline));
  if(!plainObject(result)||!(result.bytes instanceof Uint8Array))throw new NormalizedSourceError('invalid_normalizer_result');
  const derivative=new Uint8Array(result.bytes),validated=await validateReceipt({source,sourceMetadata:sourceMeta,derivative,receipt:result.receipt,normalizerVersion,deadline});
  const snapshot=sourceSnapshot(source),descriptorJson=snapshot.descriptorJson;
  const id=row?.id||crypto.randomUUID(),versionKey=row?.version_key||`marketing-normalized-versions/${id}.png`;
  const draft={id,actor_id:actorId,source_version_id:sourceVersionId,normalizer_version:normalizerVersion,descriptor_json:descriptorJson,original_version_json:snapshot.versionJson,
   original_sha256:snapshot.sourceSha256,original_bytes:snapshot.sourceBytes,original_metadata_json:snapshot.metadataJson,original_metadata_sha256:snapshot.metadataSha256,
   original_content_type:snapshot.contentType,original_version_key:snapshot.versionKey,original_created_at:snapshot.createdAt,original_confirmed_at:snapshot.confirmedAt,
   version_key:versionKey,derivative_sha256:validated.derivativeHash,derivative_bytes:derivative.length,derivative_content_type:CONTENT_TYPE,
   derivative_metadata_json:'',derivative_metadata_sha256:'',receipt_json:validated.receiptJson,receipt_sha256:validated.receiptSha256,created_at:now};
  draft.derivative_metadata_json=safeJson(derivativeMetadata(draft),'derivative_metadata',4096);
  draft.derivative_metadata_sha256=await digest(new TextEncoder().encode(draft.derivative_metadata_json),deadline,'normalized_metadata_hash');
  const fingerprintObject={actor_id:draft.actor_id,source_version_id:draft.source_version_id,normalizer_version:draft.normalizer_version,descriptor_json:draft.descriptor_json,original_version_json:draft.original_version_json,original_sha256:draft.original_sha256,original_bytes:draft.original_bytes,original_metadata_json:draft.original_metadata_json,original_metadata_sha256:draft.original_metadata_sha256,original_content_type:draft.original_content_type,original_version_key:draft.original_version_key,original_created_at:draft.original_created_at,original_confirmed_at:draft.original_confirmed_at,derivative_sha256:draft.derivative_sha256,derivative_bytes:draft.derivative_bytes,derivative_content_type:draft.derivative_content_type,derivative_metadata_json:draft.derivative_metadata_json,derivative_metadata_sha256:draft.derivative_metadata_sha256,receipt_json:draft.receipt_json,receipt_sha256:draft.receipt_sha256};
  draft.fingerprint=await digest(new TextEncoder().encode(safeJson(fingerprintObject,'fingerprint',16384)),deadline,'normalized_fingerprint');
  if(!row){
   try{await dispatch(deadline,'normalized_reserve',()=>db.prepare(`INSERT INTO prototype_normalized_source_versions(
    id,actor_id,source_version_id,normalizer_version,fingerprint,descriptor_json,original_version_json,original_sha256,original_bytes,original_metadata_json,original_metadata_sha256,original_content_type,original_version_key,original_created_at,original_confirmed_at,
    version_key,derivative_sha256,derivative_bytes,derivative_content_type,derivative_metadata_json,derivative_metadata_sha256,receipt_json,receipt_sha256,state,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?
    WHERE ?>CAST(unixepoch('subsec')*1000 AS INTEGER)
    AND EXISTS(SELECT 1 FROM prototype_source_versions sv WHERE sv.id=? AND sv.actor_id=? AND sv.state='confirmed' AND sv.source_sha256=? AND sv.source_bytes=? AND sv.metadata_json=? AND sv.metadata_sha256=? AND sv.content_type=? AND sv.version_key=? AND sv.created_at=? AND sv.confirmed_at=? AND sv.descriptor_json=?)
    AND ${eligible} ON CONFLICT(actor_id,source_version_id,normalizer_version) DO NOTHING`)
    .bind(draft.id,draft.actor_id,draft.source_version_id,draft.normalizer_version,draft.fingerprint,draft.descriptor_json,draft.original_version_json,draft.original_sha256,draft.original_bytes,draft.original_metadata_json,draft.original_metadata_sha256,draft.original_content_type,draft.original_version_key,draft.original_created_at,draft.original_confirmed_at,
     draft.version_key,draft.derivative_sha256,draft.derivative_bytes,draft.derivative_content_type,draft.derivative_metadata_json,draft.derivative_metadata_sha256,draft.receipt_json,draft.receipt_sha256,draft.created_at,expiresAt,
     sourceVersionId,actorId,draft.original_sha256,draft.original_bytes,draft.original_metadata_json,draft.original_metadata_sha256,draft.original_content_type,draft.original_version_key,draft.original_created_at,draft.original_confirmed_at,draft.descriptor_json,
     ...eligibilityArgs(source.version.descriptor,actorId)).run());}
   catch{deadline?.check('normalized_reserve_failed');}
   row=await findIdentity(db,actorId,sourceVersionId,normalizerVersion,deadline);
   if(!row)throw new NormalizedSourceError('normalized_reservation_unverified');
  }
  if(row.state==='confirmed'){
   if(row.fingerprint!==draft.fingerprint)throw new NormalizedSourceError('normalized_identity_conflict',row);
   const confirmed=await readConfirmedNormalizedSource({db,media,actorId,versionId:row.id,deadline});
   if(!confirmed)throw new NormalizedSourceError('normalized_confirmation_unverified',row);
   return {state:'confirmed',version:confirmed.version,bytes:confirmed.bytes,replayed:true};
  }
  if(row.state!=='pending'||row.fingerprint!==draft.fingerprint||row.version_key!==versionKey)throw new NormalizedSourceError('normalized_identity_conflict',row);
  const customMetadata=JSON.parse(row.derivative_metadata_json);
  try{await dispatch(deadline,'normalized_r2_put',()=>media.put(row.version_key,derivative,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:CONTENT_TYPE},customMetadata}));}
  catch{deadline?.check('normalized_r2_put_failed');/* Ambiguous acknowledgement: verify only the reserved key. */}
  await verifyDerivative(media,{...row,_db:db,_media:media},deadline);
  const currentSource=await originalArtifact(db,media,actorId,sourceVersionId,deadline);
  if(!matchesSource(row,currentSource))throw new NormalizedSourceError('normalized_original_changed',row);
  await assertEligible(db,currentSource.version.descriptor,actorId,deadline,'normalized_target_before_confirm');
  try{await dispatch(deadline,'normalized_confirm',()=>db.prepare(`UPDATE prototype_normalized_source_versions SET state='confirmed',confirmed_at=?
   WHERE id=? AND actor_id=? AND source_version_id=? AND normalizer_version=? AND fingerprint=? AND state='pending' AND ?>CAST(unixepoch('subsec')*1000 AS INTEGER)
   AND EXISTS(SELECT 1 FROM prototype_source_versions sv WHERE sv.id=? AND sv.actor_id=? AND sv.state='confirmed' AND sv.source_sha256=? AND sv.source_bytes=? AND sv.metadata_json=? AND sv.metadata_sha256=? AND sv.content_type=? AND sv.version_key=? AND sv.created_at=? AND sv.confirmed_at=? AND sv.descriptor_json=?)
   AND ${eligible}`).bind(now,row.id,actorId,sourceVersionId,normalizerVersion,row.fingerprint,expiresAt,sourceVersionId,actorId,row.original_sha256,row.original_bytes,row.original_metadata_json,row.original_metadata_sha256,row.original_content_type,row.original_version_key,row.original_created_at,row.original_confirmed_at,row.descriptor_json,...eligibilityArgs(currentSource.version.descriptor,actorId)).run());}
  catch{deadline?.check('normalized_confirm_failed');/* Re-read exact row and object after ambiguous commit acknowledgement. */}
  const confirmed=await readConfirmedNormalizedSource({db,media,actorId,versionId:row.id,deadline});
  if(!confirmed)throw new NormalizedSourceError('normalized_confirmation_unverified',row);
  return {state:'confirmed',version:confirmed.version,bytes:confirmed.bytes,replayed:false};
 }catch(error){
  try{deadline?.check('normalized_capture_failed');}catch(expired){if(row){expired.versionId=row.id;expired.versionKey=row.version_key;expired.artifactState='unattached_or_unknown';}throw expired;}
  if(error instanceof NormalizedSourceError){if(row&&!error.versionId){error.versionId=row.id;error.versionKey=row.version_key;error.artifactState='unattached_or_unknown';}throw error;}
  throw new NormalizedSourceError('normalized_source_capture_unverified',row);
 }
}
