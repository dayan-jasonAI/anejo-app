import { sendEmail, emailShell, escHtml } from './email.js';
import { raiseAlert } from './alerts.js';

export const ACK_VERSION = 'catering-received-v1';
export function acknowledgement({ name = 'Guest', source_lang, event_date, guests } = {}) {
  const es = source_lang === 'es';
  const text = es
    ? `Hola ${name},\n\nGracias por pensar en Añejo para tu evento${event_date ? ` del ${event_date}` : ''}${guests ? ` para ${guests} invitados` : ''}. Recibimos tu solicitud de catering y nuestro equipo la revisará para preparar tu cotización.\n\nPuedes responder a este correo si deseas añadir algún detalle. Tu fecha quedará reservada cuando se confirme el depósito.\n\nCon cariño,\nEquipo Añejo\nanejocateringco.com`
    : `Hi ${name},\n\nThank you for considering Añejo for your event${event_date ? ` on ${event_date}` : ''}${guests ? ` for ${guests} guests` : ''}. We received your catering request and our team will review it to prepare your quote.\n\nReply to this email if you would like to add any details. Your date will be reserved when the deposit is confirmed.\n\nWarmly,\nThe Añejo Team\nanejocateringco.com`;
  return { subject: es ? 'Recibimos tu solicitud de catering — Añejo' : 'We received your catering request — Añejo', text,
    html: emailShell(`<div style="white-space:pre-line">${escHtml(text)}</div>`) };
}

export async function serviceConfig(env) {
  return await env.DB.prepare('SELECT * FROM catering_service_config WHERE id=1').first();
}

// Strong association only: explicit linkage, or a unique identical email AND phone pair.
export function quoteForLead(lead, leads, quotes) {
  const linked = quotes.filter(q => q.deposit_status!=='void'&&(q.source_lead_id === lead.id || q.breakdown?.lead_id === lead.id));
  if (linked.length) return linked.sort((a,b)=>b.created_at-a.created_at)[0];
  const phone = p => String(p||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  if (!lead.email || phone(lead.phone).length !== 10) return null;
  const same = x => String(x.email||x.customer_email||'').toLowerCase() === lead.email.toLowerCase() && phone(x.phone||x.customer_phone) === phone(lead.phone);
  if (leads.filter(same).length !== 1) return null;
  let event={};try{event=JSON.parse(lead.event_json||'{}');}catch{/* unlinked remains unverified */}
  return quotes.filter(q=>same(q)&&q.deposit_status!=='void'&&event.event_date&&q.event_date===event.event_date).sort((a,b)=>b.created_at-a.created_at)[0] || null;
}

export async function serviceLeads(env) {
  const read = await env.DB.prepare(`SELECT l.id,l.name,l.email,l.phone,l.source_lang,l.created_at,l.src,l.utm_source,l.utm_medium,l.utm_campaign,l.referrer,
    r.event_json,s.state,s.note,s.next_followup_at,s.last_escalated_at,s.last_notification_json,
    a.status AS acknowledgement_status,a.receipt_id AS acknowledgement_receipt,a.last_error AS acknowledgement_error
    FROM leads l LEFT JOIN catering_requests r ON r.lead_id=l.id
    LEFT JOIN catering_lead_service s ON s.lead_id=l.id
    LEFT JOIN catering_acknowledgements a ON a.lead_id=l.id
    WHERE l.kind='catering' ORDER BY l.created_at DESC LIMIT 100`).all();
  const qr = await env.DB.prepare('SELECT id,source_lead_id,customer_email,customer_phone,event_date,deposit_status,email_sent_at,sms_sent_at,created_at,quote_json FROM catering_quotes ORDER BY created_at DESC LIMIT 200').all();
  const [responses, reminders] = await Promise.all([
    env.DB.prepare('SELECT * FROM catering_quote_responses').all(),
    env.DB.prepare('SELECT quote_id,lead_id,step,status,accepted_at,created_at FROM catering_quote_followups ORDER BY created_at DESC').all(),
  ]);
  const parse = s => { try { return JSON.parse(s||'{}'); } catch { return {}; } };
  const quotes = (qr.results||[]).map(q=>({...q,breakdown:parse(q.quote_json)}));
  const leads = read.results||[];
  return leads.map(l=>{
    const q=quoteForLead(l,leads,quotes), event=parse(l.event_json);
    const phase=q?.deposit_status==='paid'?'booked':l.state==='lost'?'lost':l.state==='won'?'owner_won':q?.email_sent_at||q?.sms_sent_at?'awaiting_deposit':l.state==='contacted'?'contacted':'new';
    const response=(responses.results||[]).find(r=>r.lead_id===l.id&&r.quote_id===q?.id);
    const attempts=(reminders.results||[]).filter(r=>r.lead_id===l.id&&r.quote_id===q?.id);
    const accepted=attempts.filter(r=>r.status==='accepted').sort((a,b)=>b.accepted_at-a.accepted_at)[0];
    const uncertain=(reminders.results||[]).some(r=>r.lead_id===l.id&&['pending','unknown'].includes(r.status));
    const actionable=response&&['replied','call_requested','changes_requested'].includes(response.status);
    const due=actionable?(response.next_followup_at||response.updated_at):l.next_followup_at || response?.next_followup_at || (accepted?.accepted_at?accepted.accepted_at+2*86400000:phase==='awaiting_deposit' ? Math.max(q.email_sent_at||0,q.sms_sent_at||0)+86400000 : l.created_at+900000);
    const action=uncertain?'reconcile':response?.status==='declined'?'closed':response?.status==='call_requested'?'call':response?.status==='changes_requested'?'revise':response?.status==='replied'?'reply':accepted?.step==='final_checkin'?'owner_decision':phase==='awaiting_deposit'?'review_reminder':'contact';
    const labels={reconcile:'Reconcile the unconfirmed email before any further send.',closed:'Customer declined. No further quote reminders.',call:'Arrange the requested call.',revise:'Review the requested quote changes.',reply:'Respond to the customer and agree on the next step.',owner_decision:'Confirm plans by call or record the outcome. No automatic closure.',review_reminder:'Review the next quote reminder or make a call.',contact:'Review the request and contact the customer.'};
    return {...l,event,quote_id:q?.id||null,quote_activity_at:q?Math.max(q.created_at,q.email_sent_at||0,q.sms_sent_at||0):null,quote_sent_at:q?Math.max(q.email_sent_at||0,q.sms_sent_at||0):null,quote_sms_at:q?.sms_sent_at||null,phase,response_status:response?.status||null,response_note:response?.note||null,quote_reminder_status:attempts[0]?.status||null,last_reminder_accepted_at:accepted?.accepted_at||null,followup_action:action,followup_action_label:labels[action],followup_due_at:due,followup_overdue:!['booked','lost','owner_won'].includes(phase)&&response?.status!=='declined'&&due<=Date.now(),
      thread_id:`thr_catering_lead_${l.id}`};
  });
}

export async function runCateringLeadService(env, { limit=10 }={}) {
  const config=await serviceConfig(env), leads=await serviceLeads(env), now=Date.now();
  const counts={ acknowledgements_accepted:0,owner_reminders:0,needs_review:0 };
  for(const lead of leads.slice(0,100)) {
    await env.DB.prepare('INSERT OR IGNORE INTO catering_lead_service(lead_id,updated_at) VALUES(?,?)').bind(lead.id,now).run();
    // Enabling never retroactively emails old inquiries, contacted customers, or booked events.
    if(config?.ack_enabled && config.ack_template_version===ACK_VERSION && lead.created_at>=config.activated_at && lead.phase==='new') {
      const payload={to:lead.email,replyTo:env.LEADS_NOTIFY_TO||'dayan@anejocateringco.com',...acknowledgement({...lead,...lead.event})};
      await env.DB.prepare('INSERT OR IGNORE INTO catering_acknowledgements(lead_id,template_version,payload_json,created_at,updated_at) VALUES(?,?,?,?,?)')
        .bind(lead.id,ACK_VERSION,JSON.stringify(payload),now,now).run();
    }
    const active=lead.created_at>now-30*86400000 || lead.quote_activity_at>now-30*86400000 || lead.next_followup_at || (lead.event.event_date && Date.parse(lead.event.event_date+'T23:59:59Z')>=now);
    if(lead.followup_overdue && active && (!lead.last_escalated_at || now-lead.last_escalated_at>=3600000)) {
      // Owner action only. Nothing here messages the customer or changes their quote.
      const claimed=await env.DB.prepare('UPDATE catering_lead_service SET last_escalated_at=? WHERE lead_id=? AND (last_escalated_at IS NULL OR last_escalated_at<=?)').bind(now,lead.id,now-3600000).run();
      if(claimed.meta?.changes) {
        const a=await raiseAlert(env,{alert_type:'catering_followup_due',severity:'warning',
          title:lead.followup_action==='call'?'Catering customer requested a call':lead.followup_action==='revise'?'Catering customer requested changes':lead.followup_action==='reply'?'Catering customer needs your reply':lead.phase==='awaiting_deposit'?'Catering quote follow-up needs review':'Catering lead needs your response',
          body:`${lead.name}: ${lead.followup_action_label}`,
          ref_type:'lead',ref_id:lead.id,url:`/hub/owner/catering-service.html?lead=${encodeURIComponent(lead.id)}`,
          dedupe_key:`catering-followup:${lead.id}:${Math.floor(now/3600000)}`,onceEver:true});
        if(a.ok) {
          counts.owner_reminders++;
          await env.DB.prepare('UPDATE catering_lead_service SET last_notification_json=? WHERE lead_id=?').bind(JSON.stringify({at:now,alert_id:a.id,push:a.push||{unverified:true}}),lead.id).run();
        }
        else await env.DB.prepare('UPDATE catering_lead_service SET last_escalated_at=NULL WHERE lead_id=? AND last_escalated_at=?').bind(lead.id,now).run();
      }
    }
  }
  const due=await env.DB.prepare(`SELECT * FROM catering_acknowledgements WHERE (status='pending' OR (status='leased' AND lease_until<?)) ORDER BY created_at LIMIT ?`).bind(now,limit).all();
  for(const row of due.results||[]) {
    // A disabled template stops pending sends too. Explicit owner activation is required.
    if(!config?.ack_enabled || config.ack_template_version!==row.template_version) continue;
    const current=leads.find(l=>l.id===row.lead_id);
    if(!current||current.phase!=='new'||row.created_at<config.activated_at||current.created_at<config.activated_at) {
      await env.DB.prepare("UPDATE catering_acknowledgements SET status='needs_review',last_error=?,updated_at=? WHERE lead_id=? AND status IN ('pending','leased')")
        .bind('Request predates activation or has progressed. No automatic email sent.',now,row.lead_id).run();
      continue;
    }
    const claimed=await env.DB.prepare(`UPDATE catering_acknowledgements SET status='leased',lease_until=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),updated_at=? WHERE lead_id=? AND (status='pending' OR (status='leased' AND lease_until<?))`).bind(now+120000,now,now,row.lead_id,now).run();
    if(!claimed.meta?.changes)continue;
    let receipt=null,error=null,status='pending';
    if(row.first_attempt_at && now-row.first_attempt_at>=23*3600000) { status='needs_review';error='Provider retry window elapsed. Reconcile before sending.'; }
    else {
      try { const result=await sendEmail(env,{...JSON.parse(row.payload_json),idempotencyKey:`catering-ack:${row.lead_id}`,timeoutMs:15000});
        if(result?.id&&!result.skipped){receipt=result.id;status='accepted';counts.acknowledgements_accepted++;}
        else {status='needs_review';error='Email unavailable or suppressed; owner review required.';}
      }catch{error='Email not confirmed; retry retains the same provider idempotency key.';}
    }
    await env.DB.prepare('UPDATE catering_acknowledgements SET status=?,receipt_id=?,last_error=?,lease_until=NULL,updated_at=? WHERE lead_id=?').bind(status,receipt,error,Date.now(),row.lead_id).run();
    if(status==='needs_review')counts.needs_review++;
  }
  return counts;
}
