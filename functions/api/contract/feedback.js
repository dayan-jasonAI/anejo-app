import { json, bad, now } from '../../_lib/util.js';
import { etDate } from '../../_lib/contract.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { feedbackSite,validateFeedback,servedOrder } from '../../_lib/lunch_feedback.js';
export const onRequestGet=async ({request,env})=>{
 if(!env.DB)return bad('Unavailable.',503);
 const site=await feedbackSite(env,new URL(request.url).searchParams.get('t'),request.headers.get('Cookie')||'',new URL(request.url).searchParams.get('r'),new URL(request.url).searchParams.get('q'));
 if(!site)return bad('Open your office ordering link and verify this device first.',403);
 const orders=await env.DB.prepare("SELECT c.id,c.service_date,c.item_name,c.headcount FROM contract_orders c WHERE c.site_id=? AND (?=0 OR c.service_date=?) AND (? IS NULL OR c.id=?) AND c.service_date<=? AND c.headcount>0 AND EXISTS(SELECT 1 FROM deliveries d WHERE d.order_id=c.order_id AND d.status='completed' AND d.completed_at IS NOT NULL) ORDER BY c.service_date DESC LIMIT 30").bind(site.id,site.public_qr?1:0,etDate(Date.now()),site.reminder_order_id||null,site.reminder_order_id||null,etDate(Date.now())).all();
 return json({ok:true,site:site.name,patient_mode:!!site.public_qr,orders:(orders.results||[]).map(o=>site.public_qr?{id:o.id,service_date:o.service_date,item_name:o.item_name}:o)});
};
export const onRequestPost=async ({request,env})=>{
 if(!env.DB)return bad('Unavailable.',503);
 if(request.headers.get('Origin') && request.headers.get('Origin')!==new URL(request.url).origin)return bad('Invalid origin.',403);
 const limited=await limitOr429(env,request,{name:'office-feedback',limit:180,windowSec:60});if(limited)return limited;
 let b;try{b=await request.json();}catch{return bad('Invalid request.');}
 const v=validateFeedback(b);if(!v)return bad('Choose a score or mood and an eat-again answer.');
 const site=await feedbackSite(env,b.t,request.headers.get('Cookie')||'',b.r,b.q);if(!site)return bad('Verify this device through the office ordering page first.',403);
 if(site.reminder_order_id && site.reminder_order_id!==v.order_id)return bad('This reminder is for a different lunch.',403);
 const order=await servedOrder(env,site,v.order_id);if(!order||(site.public_qr&&order.service_date!==etDate(Date.now())))return bad('Choose an existing lunch service.',404);
 const prior=await env.DB.prepare('SELECT * FROM contract_lunch_feedback WHERE id=?').bind(v.id).first();
 if(prior){
  if(prior.site_id!==site.id || prior.order_id!==v.order_id || prior.rating!==v.rating || prior.mood!==v.mood || prior.eat_again!==v.eat_again || prior.suggestion!==v.suggestion)return bad('This response was already saved with different answers.',409);
  return json({ok:true,duplicate:true});
 }
 const saved=await env.DB.prepare(`INSERT INTO contract_lunch_feedback (id,site_id,order_id,service_date,item_name,rating,mood,eat_again,suggestion,created_at,delivery_id)
 SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM contract_lunch_feedback WHERE order_id=?) < ? ON CONFLICT(id) DO NOTHING`)
 .bind(v.id,site.id,order.id,order.service_date,order.item_name||'Lunch',v.rating,v.mood,v.eat_again,v.suggestion,now(),order.delivery_id,order.id,order.headcount).run();
 if(!saved.meta?.changes)return bad('The response limit for this service has been reached, or this response was just saved. Reload before recording another response.',409);
 return json({ok:true});
};
