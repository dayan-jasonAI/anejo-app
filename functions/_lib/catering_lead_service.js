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
  const linked = quotes.filter(q => q.source_lead_id === lead.id || q.breakdown?.lead_id === lead.id);
  if (linked.length) return linked.sort((a,b)=>b.created_at-a.created_at)[0];
  const phone = p => String(p||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  if (!lead.email || phone(lead.phone).length !== 10) return null;
  const same = x => String(x.email||x.customer_email||'').toLowerCase() === lead.email.toLowerCase() && phone(x.phone||x.customer_phone) === phone(lead.phone);
  if (leads.filter(same).length !== 1) return null;
  let event={};try{event=JSON.parse(lead.event_json||'{}');}catch{/* unlinked remains unverified */}
  return quotes.filter(q=>same(q)&&q.deposit_status!=='void'&&event.event_date&&q.event_date===event.event_date).sort((a,b)=>b.created_at-a.created_at)[0] || null;
}

export async function serviceLeads(env) {
  const read = await env.DB.prepare(`SELECT l.id,l.name,l.email,l.phone,l.source_lang,l.created_at,
    r.event_json,s.state,s.note,s.next_followup_at,s.last_escalated_at,s.last_notification_json,
    a.status AS acknowledgement_status,a.receipt_id AS acknowledgement_receipt,a.last_error AS acknowledgement_error
    FROM leads l LEFT JOIN catering_requests r ON r.lead_id=l.id
    LEFT JOIN catering_lead_service s ON s.lead_id=l.id
    LEFT JOIN catering_acknowledgements a ON a.lead_id=l.id
    WHERE l.kind='catering' ORDER BY l.created_at DESC LIMIT 100`).all();
  const qr = await env.DB.prepare('SELECT id,source_lead_id,customer_email,customer_phone,event_date,deposit_status,email_sent_at,sms_sent_at,created_at,quote_json FROM catering_quotes ORDER BY created_at DESC LIMIT 200').all();
  const parse = s => { try { return JSON.parse(s||'{}'); } catch { return {}; } };
  const quotes = (qr.results||[]).map(q=>({...q,breakdown:parse(q.quote_json)}));
  const leads = read.results||[];
  return leads.map(l=>{
    const q=quoteForLead(l,leads,quotes), event=parse(l.event_json);
    const phase=q?.deposit_status==='paid'?'booked':l.state==='lost'?'lost':l.state==='won'?'owner_won':q?.email_sent_at||q?.sms_sent_at?'awaiting_deposit':l.state==='contacted'?'contacted':'new';
    const due=l.next_followup_at || (phase==='awaiting_deposit' ? Math.max(q.email_sent_at||0,q.sms_sent_at||0)+86400000 : l.created_at+900000);
    return {...l,event,quote_id:q?.id||null,quote_sms_at:q?.sms_sent_at||null,phase,followup_due_at:due,followup_overdue:!['booked','lost','owner_won'].includes(phase)&&due<=Date.now(),
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
    if(lead.followup_overdue && lead.created_at>now-30*86400000 && (!lead.last_escalated_at || now-lead.last_escalated_at>=3600000)) {
      // Owner action only. Nothing here messages the customer or changes their quote.
      const claimed=await env.DB.prepare('UPDATE catering_lead_service SET last_escalated_at=? WHERE lead_id=? AND (last_escalated_at IS NULL OR last_escalated_at<=?)').bind(now,lead.id,now-3600000).run();
      if(claimed.meta?.changes) {
        const a=await raiseAlert(env,{alert_type:'catering_followup_due',severity:'warning',
          title:lead.phase==='awaiting_deposit'?'Catering deposit follow-up needs a call':'Catering lead needs your response',
          body:`${lead.name}: ${lead.phase==='awaiting_deposit'?'Quote sent; deposit still unpaid.':'Review the request and call the customer.'}`,
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
