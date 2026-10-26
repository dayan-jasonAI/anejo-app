import {json} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {commissaryUsageView,mutateCommissaryUsage} from '../../../_lib/commissary_usage.js';
async function handle({request,env},write){
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 try{
  if(!env.DB)return json({ok:false,error:'Usage records unavailable.'},503);
  const result=write?await mutateCommissaryUsage(env,await request.json(),ctx):await commissaryUsageView(env,ctx,{month:new URL(request.url).searchParams.get('month')});
  return json(result,result.ok?200:result.status||409,{'Cache-Control':'no-store, private'});
 }catch{return json({ok:false,error:'Usage update is unconfirmed. Retry the same request; no external form was submitted.'},503,{'Cache-Control':'no-store, private'});}
}
export const onRequestGet=c=>handle(c,false);
export const onRequestPost=c=>handle(c,true);
