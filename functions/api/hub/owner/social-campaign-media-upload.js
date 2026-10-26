// Private owner media staging. Uploading never attaches, approves, schedules or publishes.
import {requireRole} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {sha256,jpegDimensions} from '../../../_lib/marketing_render_receipt.js';
const MAX_IMAGE=5*1024*1024,MAX_VIDEO=25*1024*1024,MAX_BODY=MAX_VIDEO+65536;
const fail=(error,status=400)=>json({ok:false,error,attached:false,published:false},status);
export async function onRequestPost({request,env}){
 const owner=await requireRole(request,env,['owner']);if(owner instanceof Response)return owner;
 if(!owner.distinct_id||!env.MEDIA)return fail('campaign_media_storage_unavailable',503);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return fail('cross_origin_upload_rejected',403);
 const contentType=request.headers.get('content-type')||'';if(!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType))return fail('multipart_required',415);
 const reader=request.body?.getReader();if(!reader)return fail('file_required');const chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return fail('campaign_media_upload_too_large',413);}chunks.push(value);}}catch{return fail('campaign_media_read_failed');}
 let file;try{const form=await new Response(new Blob(chunks),{headers:{'content-type':contentType}}).formData();const entries=[...form.entries()];if(entries.length!==1||entries[0][0]!=='file'||typeof entries[0][1]==='string')return fail('one_file_required');file=entries[0][1];}catch{return fail('invalid_multipart');}
 if(!Number.isSafeInteger(file.size)||file.size<12)return fail('campaign_media_empty');const mime=String(file.type||'').toLowerCase();if(!['image/jpeg','video/mp4','video/quicktime'].includes(mime))return fail('campaign_media_type_unsupported',415);
 const max=mime==='image/jpeg'?MAX_IMAGE:MAX_VIDEO;if(file.size>max)return fail('campaign_media_upload_too_large',413);const bytes=new Uint8Array(await file.arrayBuffer());if(bytes.length!==file.size)return fail('campaign_media_read_incomplete');
 let ext,kind;try{if(mime==='image/jpeg'){jpegDimensions(bytes);ext='jpg';kind='image';}else{const marker=String.fromCharCode(...bytes.slice(4,8)),brand=String.fromCharCode(...bytes.slice(8,12));const boxSize=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);if(marker!=='ftyp'||boxSize<12||boxSize>bytes.length||(mime==='video/quicktime'?brand!=='qt  ':!['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','dash','M4V '].includes(brand)))return fail('campaign_media_bytes_mismatch');ext=mime==='video/quicktime'?'mov':'mp4';kind='video';}}catch{return fail('campaign_media_bytes_mismatch');}
 const hash=await sha256(bytes),uploaded_at=new Date().toISOString(),key='marketing-library/'+uploaded_at.slice(0,7)+'/campaign_'+crypto.randomUUID().replaceAll('-','')+'.'+ext;
 // Actual origin/AI status remains unknown; an uploader cannot manufacture generation provenance.
 const name=Array.from(String(file.name||'Campaign media'),c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127||c==='/'||c==='\\'?' ':c).join('').slice(0,160);
 const customMetadata={name,folder:'campaigns',tags:'[]',content_type:mime,uploaded_at,uploaded_by:owner.distinct_id,content_sha256:hash,provenance_basis:'owner_upload_unverified_origin'};
 try{await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata});}catch{return fail('campaign_media_store_outcome_unknown',503);}
 return json({ok:true,attached:false,published:false,media:{key,kind,content_type:mime,byte_length:bytes.length,sha256:hash,preview_url:'/api/hub/media/'+key,provenance_basis:customMetadata.provenance_basis}});
}
