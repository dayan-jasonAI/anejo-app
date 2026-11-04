import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {deliveryResolutionContext,resolveOwnerDelivery} from '../../../_lib/owner_delivery_resolution.js';
export async function onRequest({request,env}){
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 if(!env.DB)return bad('Database not configured.',503);
 if(!['GET','POST'].includes(request.method))return bad('Method not allowed.',405);
 if(request.method==='POST'){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return bad('Open the Hub to confirm this delivery.',403);}
 try{let out;if(request.method==='GET'){const u=new URL(request.url);out=await deliveryResolutionContext(env,{route_id:u.searchParams.get('route_id'),order_id:u.searchParams.get('order_id')});}else{let b;try{b=await request.json();}catch{return bad('Invalid JSON body.');}out=await resolveOwnerDelivery(env,b,ctx);}return json(out,out.ok?200:out.status||400,{'Cache-Control':'no-store, private'});}catch{return bad('Delivery confirmation could not be verified. Retry the same request.',503);}
}
