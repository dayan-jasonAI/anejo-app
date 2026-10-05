import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
export const onRequestGet=async ({request,env})=>{
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 const days=Number(new URL(request.url).searchParams.get('days')||30);if(!Number.isInteger(days)||days<1||days>365)return bad('Invalid period.');
 const site= new URL(request.url).searchParams.get('site_id')||'';if(site.length>100)return bad('Invalid office.');
 const since=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
 const rows=await env.DB.prepare(`SELECT f.order_id,f.delivery_id,f.service_date,f.item_name,s.name AS office,COUNT(*) AS responses,
 COUNT(f.rating) AS scored,ROUND(AVG(f.rating),1) AS average_score,
 SUM(CASE WHEN f.mood='sad' THEN 1 ELSE 0 END) AS sad,SUM(CASE WHEN f.mood='neutral' THEN 1 ELSE 0 END) AS neutral,SUM(CASE WHEN f.mood='happy' THEN 1 ELSE 0 END) AS happy,
 SUM(CASE WHEN f.eat_again='yes' THEN 1 ELSE 0 END) AS yes,SUM(CASE WHEN f.eat_again='no' THEN 1 ELSE 0 END) AS no,SUM(CASE WHEN f.eat_again='unsure' THEN 1 ELSE 0 END) AS unsure,SUM(CASE WHEN f.eat_again='unanswered' THEN 1 ELSE 0 END) AS unanswered
 FROM contract_lunch_feedback f JOIN contract_sites s ON s.id=f.site_id WHERE f.service_date>=? AND (?='' OR f.site_id=?) GROUP BY f.order_id,f.service_date,f.item_name,f.site_id ORDER BY f.service_date DESC LIMIT 300`).bind(since,site,site).all();
 const suggestions=await env.DB.prepare(`SELECT f.service_date,f.item_name,s.name AS office,f.suggestion FROM contract_lunch_feedback f JOIN contract_sites s ON s.id=f.site_id WHERE f.service_date>=? AND (?='' OR f.site_id=?) AND f.suggestion<>'' ORDER BY f.created_at DESC LIMIT 100`).bind(since,site,site).all();
 const reminders=await env.DB.prepare(`SELECT c.id AS order_id,c.service_date,c.item_name,s.name AS office,r.delivery_id,r.status,SUM(CASE WHEN r.to_number<>'' THEN 1 ELSE 0 END) AS recipients,MIN(r.due_at) AS due_at,MAX(r.updated_at) AS updated_at FROM contract_survey_reminders r JOIN contract_orders c ON c.id=r.contract_order_id JOIN contract_sites s ON s.id=r.site_id WHERE c.service_date>=? AND (?='' OR r.site_id=?) GROUP BY r.contract_order_id,r.status ORDER BY c.service_date DESC LIMIT 300`).bind(since,site,site).all();
 return json({ok:true,reminders:reminders.results||[],rows:rows.results||[],suggestions:suggestions.results||[]});
};
