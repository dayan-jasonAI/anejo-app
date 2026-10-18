import { json,bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { callbackCapabilities } from '../../../_lib/catering_callbacks.js';
export async function onRequestGet({request,env}) {
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  try {
    const rows=await env.DB.prepare(`SELECT r.*,q.customer_name,q.customer_email,q.event_date FROM catering_callback_requests r JOIN catering_quotes q ON q.id=r.quote_id ORDER BY r.requested_start_at DESC LIMIT 200`).all();
    const settings=await env.DB.prepare('SELECT * FROM catering_callback_settings WHERE id=1').first();
    return json({ok:true,requests:rows.results||[],settings,capabilities:callbackCapabilities},200,{'Cache-Control':'no-store'});
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
      return json({ok:true,note:'Planning settings saved. Automatic booking and customer emails remain disabled.'});
    }
    return bad('Unknown action.');
  }catch{return bad('Could not update callback records.',503);}
}
