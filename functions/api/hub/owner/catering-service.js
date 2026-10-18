import { json,bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { ACK_VERSION,acknowledgement,serviceConfig,serviceLeads } from '../../../_lib/catering_lead_service.js';
import { ensureCateringConversation } from '../../../_lib/catering_conversation.js';

export async function onRequestGet({request,env}) {
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  try {
    const [config,leads,notify]=await Promise.all([serviceConfig(env),serviceLeads(env),env.DB.prepare(`SELECT lead_id,channel,status,receipt_id,last_error,updated_at FROM catering_notification_outbox ORDER BY created_at DESC LIMIT 200`).all()]);
    return json({ok:true,config,leads:leads.map(l=>({...l,notifications:(notify.results||[]).filter(n=>n.lead_id===l.id)})),
      template:{version:ACK_VERSION,en:acknowledgement(),es:acknowledgement({source_lang:'es'})},
      note:'Email/provider acceptance is not recipient delivery. Push receipt does not establish that a person saw a notification.'},200,{'Cache-Control':'no-store'});
  }catch{return bad('Catering service storage unavailable. Apply the service migration before release.',503);}
}
export async function onRequestPost({request,env}) {
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  let b;try{b=await request.json();}catch{return bad('Invalid JSON.');}
  const now=Date.now(),actor=ctx.email||ctx.distinct_id;
  try{
    if(b.op==='open_conversation') {
      const lead=await env.DB.prepare("SELECT id,name FROM leads WHERE id=? AND kind='catering'").bind(String(b.lead_id||'')).first();
      if(!lead)return bad('Lead not found.',404);
      const thread=await ensureCateringConversation(env,{lead});
      return json({ok:true,url:`/hub/comms.html#t=${encodeURIComponent(thread.id)}`});
    }
    if(b.op==='configure_ack') {
      if(typeof b.enabled!=='boolean')return bad('Choose enabled or disabled.');
      if(b.enabled&&b.reviewed_template_version!==ACK_VERSION)return bad('Review both language previews before enabling acknowledgements.');
      await env.DB.prepare('UPDATE catering_service_config SET activated_at=CASE WHEN ack_enabled=1 AND ?=1 AND ack_template_version=? THEN activated_at ELSE ? END,ack_enabled=?,ack_template_version=?,updated_at=?,updated_by=? WHERE id=1')
        .bind(b.enabled?1:0,ACK_VERSION,b.enabled?now:null,b.enabled?1:0,b.enabled?ACK_VERSION:null,now,actor).run();
      return json({ok:true,enabled:b.enabled,scope:'New requests after this activation only. No existing customer was contacted by this settings action.'});
    }
    if(b.op==='update_followup') {
      if(!['open','contacted','won','lost'].includes(b.state))return bad('Choose a valid follow-up state.');
      const lead=await env.DB.prepare("SELECT id FROM leads WHERE id=? AND kind='catering'").bind(String(b.lead_id||'')).first();
      if(!lead)return bad('Lead not found.',404);
      const previous=await env.DB.prepare('SELECT next_followup_at FROM catering_lead_service WHERE lead_id=?').bind(lead.id).first();
      const next=b.next_followup_at===undefined?previous?.next_followup_at||null:b.next_followup_at==null?null:Number(b.next_followup_at);
      if(b.next_followup_at!==undefined&&next!=null&&(!Number.isSafeInteger(next)||next<=now||next>now+365*86400000))return bad('Choose a future follow-up within one year.');
      await env.DB.prepare(`INSERT INTO catering_lead_service(lead_id,state,note,next_followup_at,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET state=excluded.state,note=excluded.note,next_followup_at=excluded.next_followup_at,last_escalated_at=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
        .bind(lead.id,b.state,String(b.note||'').slice(0,2000),next||(b.state==='contacted'?now+86400000:null),now,actor).run();
      return json({ok:true});
    }
    return bad('Unknown action.');
  }catch{return bad('Could not save catering service settings.',503);}
}
