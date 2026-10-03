import {requireRole,MARKETING_DESK} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {resolvePreEditorialSource,recoveryDeclaration} from '../../../_lib/marketing_original_source.js';
import {sourceKey} from '../../../_lib/marketing_render_receipt.js';
export async function onRequestGet({request,env}){
 const actor=await requireRole(request,env,MARKETING_DESK);if(actor instanceof Response)return actor;
 if(!env.DB||!env.MEDIA)return json({ok:false,error:'source_storage_unavailable'},503);
 const q=new URL(request.url).searchParams,post=q.get('post_id'),media=q.get('media_id'),current=q.get('current_key');
 if(![post,media].every(v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v))||!sourceKey(current))return json({ok:false,error:'invalid_source_selection'},400);
 try{
  const row=await env.DB.prepare("SELECT m.id FROM social_post_media m JOIN social_posts p ON p.id=m.post_id WHERE m.id=? AND m.post_id=? AND m.media_key=? AND p.status IN ('draft','scheduled','failed') AND COALESCE(p.media_type,'') NOT IN ('REELS','STORIES')").bind(media,post,current).first();
  if(!row)return json({ok:false,error:'source_slide_or_post_changed'},409);
  const source=await resolvePreEditorialSource(env,current);
  return json({ok:true,source_key:source.key,source_sha256:source.hash,recovery:recoveryDeclaration(source),visual_review_required:true});
 }catch(error){return json({ok:false,error:error.message||'source_history_unavailable'},409);}
}
