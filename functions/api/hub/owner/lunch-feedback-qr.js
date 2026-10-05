import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {ensureFeedbackQr,feedbackQrUrl,feedbackQrSvg} from '../../../_lib/feedback_qr.js';
export const onRequestPost=async({request,env})=>{
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return bad('Invalid origin.',403);
 let body;try{body=await request.json();}catch{return bad('Invalid request.');}
 if(typeof body.site_id!=='string'||!body.site_id||body.site_id.length>100)return bad('Choose an office.');
 const qr=await ensureFeedbackQr(env,body.site_id);if(!qr)return bad('Active office required.',404);
 return json({ok:true,url:feedbackQrUrl(env,qr.token),image:'/api/hub/owner/lunch-feedback-qr?site_id='+encodeURIComponent(body.site_id)});
};
export const onRequestGet=async({request,env})=>{
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 const siteId=new URL(request.url).searchParams.get('site_id');if(!siteId||siteId.length>100)return bad('Choose an office.');
 const qr=await env.DB.prepare("SELECT q.token FROM contract_feedback_qr q JOIN contract_sites s ON s.id=q.site_id JOIN contract_accounts a ON a.id=s.account_id WHERE q.site_id=? AND q.active=1 AND s.active=1 AND a.status='active'").bind(siteId).first();if(!qr)return bad('Create the office QR first.',404);
 return new Response(feedbackQrSvg(feedbackQrUrl(env,qr.token)),{headers:{'Content-Type':'image/svg+xml','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
};
