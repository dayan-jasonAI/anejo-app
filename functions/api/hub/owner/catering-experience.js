import {json,appBaseUrl} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {getCateringExperience,stageCateringExperience,approveCateringExperience,sendCateringExperience,EXPERIENCE_KINDS} from '../../../_lib/catering_experience.js';
async function handle({request,env},write){
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 try{
  const b=write?await request.json():{quote_id:new URL(request.url).searchParams.get('quote_id')};
  if(!/^cq_[A-Za-z0-9_-]{1,100}$/.test(String(b.quote_id||'')))return json({ok:false,error:'Choose a catering booking.'},400);
  if(write&&b.op!=='stage'&&!EXPERIENCE_KINDS.includes(b.kind))return json({ok:false,error:'Choose the booking check-in or completed-delivery review.'},400);
  const opts={baseUrl:appBaseUrl(env,request),actor:ctx.email||ctx.distinct_id||'owner'};
  const out=!write?await getCateringExperience(env,b.quote_id):b.op==='stage'?await stageCateringExperience(env,b.quote_id,opts):b.op==='approve'?await approveCateringExperience(env,b,opts):b.op==='send'?await sendCateringExperience(env,b,opts):{ok:false,error:'Choose stage, approve or send.'};
  return json(out,out.ok?200:409,{'Cache-Control':'no-store, private'});
 }catch{return json({ok:false,error:'Service message storage is unavailable. Check saved receipts before retrying.'},503,{'Cache-Control':'no-store, private'});}
}
export const onRequestGet=ctx=>handle(ctx,false);
export const onRequestPost=ctx=>handle(ctx,true);
