import {syncCateringEmailReceipts} from '../../../_lib/catering_email_receipts.js';
import {json} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {serviceMessageView,approveServiceMessages} from '../../../_lib/catering_service_messages.js';
import {kitchenCalendarView,configureKitchenCalendar,saveKitchenReservation} from '../../../_lib/catering_kitchen_calendar.js';
import {labelDraft,saveLabelDraft,renderEventLabels,LABEL_THEMES} from '../../../_lib/catering_event_labels.js';
async function handle({request,env},write){
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 try{
  const u=new URL(request.url),b=write?await request.json():{quote_id:u.searchParams.get('quote_id')};
  if(!/^cq_[A-Za-z0-9_-]{1,100}$/.test(b.quote_id||''))return json({ok:false,error:'Choose an event.'},400);
  const q=await env.DB.prepare('SELECT id,quote_json,updated_at FROM catering_quotes WHERE id=?').bind(b.quote_id).first();if(!q)return json({ok:false,error:'Event not found.'},404);
  const owner=ctx.role==='owner',opts={actor:ctx.email||ctx.distinct_id,owner};
  if(write){
   if(['communications','calendar_destination','approve_hours','approve_labels'].includes(b.op)&&!owner)return json({ok:false,error:'Owner approval required.'},403);
   const r=b.op==='communications'?await approveServiceMessages(env,b,opts):b.op==='calendar_destination'?await configureKitchenCalendar(env,b,opts):['save_hours','approve_hours'].includes(b.op)?await saveKitchenReservation(env,b,opts):['draft_labels','approve_labels'].includes(b.op)?await saveLabelDraft(env,b,opts):{ok:false,error:'Unknown action.'};return json(r,r.ok?200:409,{'Cache-Control':'no-store'});
  }
  if(owner&&u.searchParams.get('receipts')==='1')await syncCateringEmailReceipts(env,b.quote_id);
  const labels=await labelDraft(env,b.quote_id);
  if(u.searchParams.get('format')){
   if(!labels||labels.stale)return json({ok:false,error:'Generate current labels before previewing.'},409);
   const f=u.searchParams.get('format');if(!['rounds','bands','tents'].includes(f))return json({ok:false,error:'Unsupported format.'},400);
   return new Response(renderEventLabels(labels,f),{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store, private','Content-Security-Policy':"default-src 'none'; img-src https://anejocateringco.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"}});
  }
  return json({ok:true,owner,calendar:await kitchenCalendarView(env,b.quote_id),communications:owner?await serviceMessageView(env,b.quote_id):null,labels,label_quote_updated_at:q.updated_at,label_items:(JSON.parse(q.quote_json||'{}').lines||[]).map((l,index)=>({key:'l'+index,name:l.name||''})),themes:LABEL_THEMES},200,{'Cache-Control':'no-store, private'});
 }catch{return json({ok:false,error:'Event services unavailable. Your saved records have not been replaced.'},503);}
}
export const onRequestGet=c=>handle(c,false);
export const onRequestPost=c=>handle(c,true);
