import {requireRole,MARKETING_DESK} from '../../../_lib/roles.js';
import {json,randToken} from '../../../_lib/util.js';
import {MAX_JPEG,sha256,textBytes,sourceKey,sourceMagicValid,declarationValid,jpegDimensions,readBoundedJson} from '../../../_lib/marketing_render_receipt.js';
const fields=['request_id','post_id','media_id','source_key','source_sha256','data_url','declaration'];
const error=(code,status=400,extra={})=>json({ok:false,attached:false,error:code,...extra},status);
async function objectBytes(env,key){const obj=await env.MEDIA.get(key);if(!obj||obj.size>MAX_JPEG||obj.size<1)throw Error('source_unavailable');const bytes=new Uint8Array(await obj.arrayBuffer());if(bytes.length!==obj.size)throw Error('source_unavailable');return bytes;}
const receiptResponse=(row,status='draft')=>({ok:true,attached:true,receipt_id:row.id,media_key:row.output_key,evidence_tier:'browser_declared',status,schedule_cleared:status==='draft',source_sha256:row.source_sha256,output_sha256:row.output_sha256});
export async function onRequestPost({request,env}){
 const actor=await requireRole(request,env,MARKETING_DESK);if(actor instanceof Response)return actor;
 if(!actor.distinct_id||!env.MEDIA)return error('storage_or_actor_unavailable',503);
 let b;try{b=await readBoundedJson(request);}catch(e){return error(e.message==='request_too_large'?'request_too_large':'invalid_json_request',e.message==='request_too_large'?413:400);}
 if(!b||Array.isArray(b)||typeof b!=='object'||Object.keys(b).length!==fields.length||!fields.every(k=>Object.hasOwn(b,k))||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.request_id))||!['post_id','media_id'].every(k=>typeof b[k]==='string'&&/^[\w-]{1,100}$/.test(b[k]))||!sourceKey(b.source_key)||!(/^[a-f0-9]{64}$/.test(b.source_sha256))||!declarationValid(b.declaration)||typeof b.data_url!=='string')return error('invalid_render_request');
 let output,shape;try{const match=b.data_url.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)throw Error();const binary=atob(match[1]);if(binary.length>MAX_JPEG)throw Error();output=Uint8Array.from(binary,c=>c.charCodeAt(0));shape=jpegDimensions(output);}catch{return error('invalid_or_oversized_jpeg');}
 const outputHash=await sha256(output),requestId=b.request_id.toLowerCase(),id='rr_'+await sha256(textBytes(JSON.stringify([actor.distinct_id,requestId])));
 const declaration=JSON.stringify(b.declaration),fingerprint=await sha256(textBytes(JSON.stringify([b.post_id,b.media_id,b.source_key,b.source_sha256,outputHash,declaration])));
 const role=(b.source_key.match(/_([a-z0-9]{1,80})\.[a-z0-9]+$/i)||[])[1];
 const outputKey='studio/render-receipts/'+id+(role?'_'+role.toLowerCase():'')+'.jpg';
 let row;
 try{
 row=await env.DB.prepare('SELECT * FROM marketing_render_receipts WHERE id=?').bind(id).first();
 if(row&&row.request_hash!==fingerprint)return error('request_key_conflict',409);
 if(row?.state==='attached'){
   const linked=await env.DB.prepare("SELECT m.id,p.status FROM social_post_media m JOIN social_posts p ON p.id=m.post_id WHERE m.id=? AND m.post_id=? AND m.media_key=? AND p.status IN ('draft','scheduled','failed')").bind(row.media_id,row.post_id,row.output_key).first();
   if(!linked)return error('saved_attachment_changed',409,{receipt_id:id,media_key:outputKey});
   if(await sha256(await objectBytes(env,row.output_key))!==row.output_sha256)return error('saved_output_changed',409,{receipt_id:id,media_key:outputKey});
   return json(receiptResponse(row,linked.status));
 }
 const target=await env.DB.prepare("SELECT m.id FROM social_post_media m JOIN social_posts p ON p.id=m.post_id WHERE m.id=? AND m.post_id=? AND m.media_key=? AND p.status IN ('draft','scheduled','failed') AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES')").bind(b.media_id,b.post_id,b.source_key).first();
 if(!target)return error('source_slide_or_post_changed',409);
 const source=await objectBytes(env,b.source_key);if(!sourceMagicValid(b.source_key,source))return error('invalid_source_format');if(await sha256(source)!==b.source_sha256)return error('source_hash_changed',409);
 if(!row){
 await env.DB.prepare(`INSERT INTO marketing_render_receipts (id,actor_id,request_id,request_hash,post_id,media_id,source_key,source_sha256,source_bytes,output_key,output_sha256,output_bytes,output_width,output_height,declaration_json,evidence_tier,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'browser_declared','pending',?) ON CONFLICT(id) DO NOTHING`).bind(id,actor.distinct_id,requestId,fingerprint,b.post_id,b.media_id,b.source_key,b.source_sha256,source.length,outputKey,outputHash,output.length,shape.width,shape.height,declaration,Date.now()).run();
 row=await env.DB.prepare('SELECT * FROM marketing_render_receipts WHERE id=?').bind(id).first();
 if(!row||row.request_hash!==fingerprint)return error('request_key_conflict',409);
 }
 // Identical retries write identical bytes to this actor/request-specific key; original untouched.
 await env.MEDIA.put(outputKey,output,{httpMetadata:{contentType:'image/jpeg'}});
 if(await sha256(await objectBytes(env,outputKey))!==outputHash)throw Error('output_readback_failed');
 if(await sha256(await objectBytes(env,b.source_key))!==b.source_sha256)return error('source_hash_changed',409,{receipt_id:id,media_key:outputKey,artifact_state:'unattached'});
 const t=Date.now();
 await env.DB.batch([
 env.DB.prepare(`UPDATE social_post_media SET media_key=?,public_token=? WHERE id=? AND post_id=? AND media_key=? AND EXISTS (SELECT 1 FROM social_posts WHERE id=? AND status IN ('draft','scheduled','failed') AND COALESCE(media_type,'') NOT IN ('REELS','STORIES')) AND EXISTS (SELECT 1 FROM marketing_render_receipts WHERE id=? AND state='pending')`).bind(outputKey,randToken(24),b.media_id,b.post_id,b.source_key,b.post_id,id),
 env.DB.prepare(`UPDATE social_posts SET status='draft',scheduled_at=NULL,audit_score=NULL,audit_flags=NULL,audit_at=NULL,audit_status=NULL,audit_scope=NULL,audit_snapshot=NULL,audit_detail_json=NULL,audit_context_snapshot=NULL,auto_audit_required=NULL,updated_at=? WHERE id=? AND changes()=1`).bind(t,b.post_id),
 env.DB.prepare(`UPDATE marketing_render_receipts SET state='attached',attached_at=? WHERE id=? AND state='pending' AND EXISTS (SELECT 1 FROM social_post_media m JOIN social_posts p ON p.id=m.post_id WHERE m.id=? AND m.post_id=? AND m.media_key=? AND p.status='draft')`).bind(t,id,b.media_id,b.post_id,outputKey)
 ]);
 row=await env.DB.prepare('SELECT * FROM marketing_render_receipts WHERE id=?').bind(id).first();
 if(row?.state!=='attached')return error('attachment_not_verified',409,{receipt_id:id,media_key:outputKey,artifact_state:'unattached'});
 return json(receiptResponse(row));
 }catch{return error('save_not_verified',503,{receipt_id:id,media_key:outputKey,artifact_state:'unknown',detail:'Retry the identical request key. A private artifact may exist; no original was deleted.'});}
}
