import { json,bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { callbackDeliveryReadiness } from '../../../_lib/catering_callback_delivery.js';
import { callbackCapabilities } from '../../../_lib/catering_callbacks.js';
// Persisted provider readback is evidence as of its timestamp, not a live Calendar poll.
export function callbackCalendarEvidence(row,jobs=[]) {
  const calendar=jobs.find(j=>j.kind==='calendar');
  let payload=null;try{payload=JSON.parse(calendar?.payload_json||'null');}catch{/* malformed evidence never qualifies */}
  const matches=calendar?.status==='verified'&&row.calendar_event_id&&row.calendar_confirmed_at
    &&calendar.provider_id===row.calendar_event_id&&payload?.event_id===row.calendar_event_id
    &&payload?.request_id===row.id&&payload?.start_at===row.requested_start_at
    &&payload?.end_at===row.booked_end_at&&payload?.duration_minutes===row.duration_minutes;
  const state=row.status==='canceled'?'canceled':row.status==='needs_review'||calendar?.status==='needs_review'?'needs_review':matches?'confirmed':'requested';
  return {state,event_id:matches?row.calendar_event_id:null,verified_at:matches?row.calendar_confirmed_at:null,
    reason:matches?'matching_provider_readback':calendar?.last_error||'calendar_not_verified',
    jobs:jobs.map(j=>({kind:j.kind,status:j.status,provider_id:j.provider_id||null,last_error:j.last_error||null,updated_at:j.updated_at}))};
}
export async function onRequestGet({request,env}) {
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  try {
    const rows=await env.DB.prepare(`SELECT r.*,q.customer_name,q.customer_email,q.event_date FROM catering_callback_requests r JOIN catering_quotes q ON q.id=r.quote_id ORDER BY r.requested_start_at DESC LIMIT 200`).all();
    const settings=await env.DB.prepare('SELECT * FROM catering_callback_settings WHERE id=1').first();
    let jobs=[],readiness={ready:false,reason:'migration_missing'};
    if(settings&&Object.hasOwn(settings,'enabled')){
      readiness=callbackDeliveryReadiness(env,settings);
      jobs=(await env.DB.prepare('SELECT request_id,kind,status,provider_id,last_error,payload_json,updated_at FROM catering_callback_jobs WHERE request_id IN (SELECT id FROM catering_callback_requests ORDER BY requested_start_at DESC LIMIT 200)').all()).results||[];
    }
    return json({ok:true,requests:(rows.results||[]).map(r=>({...r,calendar_evidence:callbackCalendarEvidence(r,jobs.filter(j=>j.request_id===r.id))})),settings,readiness,customer_emails_enabled:!!(settings?.customer_emails_enabled&&settings?.email_template_version),capabilities:callbackCapabilities},200,{'Cache-Control':'no-store'});
  }catch{return bad('Callback records unavailable. Check the callback migration.',503);}
}
export async function onRequestPost({request,env}) {
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  let b;try{b=await request.json();}catch{return bad('Send JSON.');}
  try {
    if(b.op==='update') {
      if(!['requested','canceled','needs_review'].includes(b.status))return bad('Choose a valid request state. A confirmed booking requires calendar integration.');
      const result=await env.DB.prepare('UPDATE catering_callback_requests SET status=?,owner_note=?,updated_at=? WHERE id=?').bind(b.status,String(b.note||'').slice(0,1500),Date.now(),String(b.id||'')).run();
      return result.meta?.changes?json({ok:true}):bad('Callback request not found.',404);
    }
    if(b.op==='settings') {
      const duration=b.duration_minutes==null||b.duration_minutes===''?null:Number(b.duration_minutes);
      if(duration!=null&&(!Number.isInteger(duration)||duration<5||duration>120))return bad('Call duration must be 5–120 minutes.');
      await env.DB.prepare('UPDATE catering_callback_settings SET duration_minutes=?,availability_note=?,updated_at=?,updated_by=? WHERE id=1').bind(duration,String(b.availability_note||'').slice(0,1500),Date.now(),ctx.email||ctx.distinct_id).run();
      return json({ok:true,note:'Planning settings saved. This action does not activate booking or customer emails.'});
    }
    return bad('Unknown action.');
  }catch{return bad('Could not update callback records.',503);}
}
