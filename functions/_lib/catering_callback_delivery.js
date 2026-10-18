import { sendEmail, emailShell, escHtml } from './email.js';
import { CALLBACK_TIMEZONE } from './catering_callbacks.js';

export const CALLBACK_EMAIL_VERSION='catering-callback-confirmed-v1';
const LEASE=120000;
const parse=s=>{try{return JSON.parse(s||'null');}catch{return null;}};
export function callbackDeliveryReadiness(env,s) {
  if(!s?.enabled)return {ready:false,reason:'disabled'};
  if(![env.GOOGLE_CALENDAR_CLIENT_ID,env.GOOGLE_CALENDAR_CLIENT_SECRET,env.GOOGLE_CALENDAR_REFRESH_TOKEN].every(Boolean))return {ready:false,reason:'calendar_credentials_missing'};
  if(!s.calendar_email||s.timezone!==CALLBACK_TIMEZONE||s.enabled_at==null)return {ready:false,reason:'calendar_activation_missing'};
  if(!Number.isInteger(s.duration_minutes)||s.duration_minutes<5||s.duration_minutes>120)return {ready:false,reason:'duration_missing'};
  const availability=parse(s.availability_json);
  if(!availability||typeof availability!=='object'||Array.isArray(availability)||!Object.values(availability).some(x=>Array.isArray(x)&&x.length))return {ready:false,reason:'availability_missing'};
  for(const [day,windows] of Object.entries(availability)) {
    if(!/^[0-6]$/.test(day)||!Array.isArray(windows)||windows.some(w=>!Array.isArray(w)||w.length!==2||!w.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||w[0]>=w[1]))return {ready:false,reason:'availability_invalid'};
  }
  return {ready:true,availability};
}
export function withinCallbackHours(start,end,availability) {
  const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:CALLBACK_TIMEZONE,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(t).map(x=>[x.type,x.value]));
  const a=parts(start),b=parts(end),day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(a.weekday);
  if(a.year!==b.year||a.month!==b.month||a.day!==b.day)return false;
  const from=a.hour+':'+a.minute,to=b.hour+':'+b.minute;
  return (availability[day]||[]).some(w=>from>=w[0]&&to<=w[1]);
}
export async function callbackEventId(requestId) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(requestId));
  return 'anejo'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function calendarReadbackMatches(event,p) {
  return !!(event&&event.id===p.event_id&&event.status==='confirmed'&&Date.parse(event.start?.dateTime)===p.start_at&&Date.parse(event.end?.dateTime)===p.end_at&&event.extendedProperties?.private?.anejo_callback_id===p.request_id);
}
// Runtime adapter, never the assistant's connector. Calls are injectable in tests.
export function googleCallbackAdapter(env,{fetcher=fetch}={}) {
  let token=null;
  async function access(){
    if(token)return token;
    const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET,refresh_token:env.GOOGLE_CALENDAR_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
    const data=await r.json();if(!r.ok||!data.access_token)throw Error('calendar_auth_failed');token=data.access_token;return token;
  }
  async function call(url,options={}) {
    const bearer=await access(),r=await fetcher(url,{...options,headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});
    if(r.status===404)return {missing:true};
    if(r.status===409)return {conflict:true};
    if(!r.ok)throw Error('calendar_provider_failed');
    return await r.json();
  }
  const base=p=>'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(p.calendar_id)+'/events';
  return {
    get:async p=>call(base(p)+'/'+p.event_id),
    busy:async p=>{
      const result=await call('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',body:JSON.stringify({timeMin:new Date(p.start_at).toISOString(),timeMax:new Date(p.end_at).toISOString(),timeZone:CALLBACK_TIMEZONE,items:[{id:p.calendar_id}]})});
      const c=result.calendars?.[p.calendar_id];if(!c||c.errors?.length||!Array.isArray(c.busy))throw Error('calendar_availability_unknown');
      return c.busy.some(w=>Date.parse(w.start)<p.end_at&&Date.parse(w.end)>p.start_at);
    },
    create:async p=>call(base(p)+'?sendUpdates=none',{method:'POST',body:JSON.stringify({id:p.event_id,summary:'Añejo catering call · '+p.customer_name,description:'Catering callback '+p.request_id+'\nCall '+p.phone+'\nEvent '+(p.event_date||'not set'),start:{dateTime:new Date(p.start_at).toISOString(),timeZone:CALLBACK_TIMEZONE},end:{dateTime:new Date(p.end_at).toISOString(),timeZone:CALLBACK_TIMEZONE},extendedProperties:{private:{anejo_callback_id:p.request_id}},reminders:{useDefault:true}})})
  };
}
export function callbackEmail(p,kind) {
  const when=new Date(p.start_at).toLocaleString('en-US',{timeZone:CALLBACK_TIMEZONE,weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const reminder=kind==='reminder';
  const text=`Hi ${p.customer_name||'Guest'},\n\n${reminder?'A reminder of your confirmed Añejo catering call':'Your Añejo catering call is confirmed'}: ${when} Eastern time. We will call ${p.phone}. The call is scheduled for ${p.duration_minutes} minutes.\n\nIf your plans change, reply to this email.\n\nThe Añejo Team`;
  return {to:p.customer_email,replyTo:'dayan@anejocateringco.com',subject:reminder?'Your Añejo catering call is in one hour':'Your Añejo catering call is confirmed',text,html:emailShell(`<div style="white-space:pre-line">${escHtml(text)}</div>`)};
}
async function setJob(env,id,status,error,now,providerId=null) {
  await env.DB.prepare('UPDATE catering_callback_jobs SET status=?,last_error=?,provider_id=COALESCE(?,provider_id),lease_until=NULL,next_attempt_at=?,updated_at=? WHERE id=?').bind(status,error,providerId,now+60000,now,id).run();
}
async function leaseJob(env,row,now) {
  const result=await env.DB.prepare("UPDATE catering_callback_jobs SET status='leased',lease_until=?,attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?),updated_at=? WHERE id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='leased' AND lease_until<?))").bind(now+LEASE,now,now,row.id,now,now).run();
  return !!result.meta?.changes;
}
async function calendarJob(env,row,p,adapter,now,availability) {
  const holder=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO catering_callback_calendar_locks(calendar_id,holder,lease_until) VALUES(?,?,?) ON CONFLICT(calendar_id) DO UPDATE SET holder=excluded.holder,lease_until=excluded.lease_until WHERE catering_callback_calendar_locks.lease_until<?').bind(p.calendar_id,holder,now+LEASE,now).run();
  const lock=await env.DB.prepare('SELECT holder FROM catering_callback_calendar_locks WHERE calendar_id=?').bind(p.calendar_id).first();
  if(lock?.holder!==holder){await setJob(env,row.id,'pending','calendar_locked',now);return 'pending';}
  try {
    // Reconcile before every create attempt. A network timeout never invents a new event ID.
    let event=await adapter.get(p);
    if(!event.missing&&!calendarReadbackMatches(event,p)){await setJob(env,row.id,'needs_review','event_readback_mismatch',now);return 'needs_review';}
    if(event.missing) {
      if(p.start_at<=now||!withinCallbackHours(p.start_at,p.end_at,availability)){await setJob(env,row.id,'needs_review','outside_approved_hours_or_past',now);return 'needs_review';}
      const overlap=await env.DB.prepare('SELECT request_id FROM catering_callback_slots WHERE calendar_id=? AND request_id!=? AND start_at<? AND end_at>? LIMIT 1').bind(p.calendar_id,p.request_id,p.end_at,p.start_at).first();
      if(overlap||await adapter.busy(p)){await setJob(env,row.id,'needs_review','calendar_busy',now);return 'needs_review';}
      const fresh=await env.DB.prepare('SELECT enabled,calendar_email FROM catering_callback_settings WHERE id=1').first();
      const active=await env.DB.prepare('SELECT status FROM catering_callback_requests WHERE id=?').bind(p.request_id).first();
      if(!fresh?.enabled||fresh.calendar_email!==p.calendar_id||active?.status!=='requested'){await setJob(env,row.id,'needs_review','activation_or_request_changed_before_create',now);return 'needs_review';}
      await env.DB.prepare('INSERT OR IGNORE INTO catering_callback_slots(request_id,calendar_id,start_at,end_at,created_at) VALUES(?,?,?,?,?)').bind(p.request_id,p.calendar_id,p.start_at,p.end_at,now).run();
      await adapter.create(p); // POST alone is never booking evidence.
      event=await adapter.get(p);
      if(!calendarReadbackMatches(event,p))throw Error('calendar_readback_unconfirmed');
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE catering_callback_requests SET calendar_event_id=?,calendar_confirmed_at=?,duration_minutes=?,booked_end_at=?,updated_at=? WHERE id=? AND status=\'requested\'').bind(p.event_id,now,p.duration_minutes,p.end_at,now,p.request_id),
      env.DB.prepare("UPDATE catering_callback_jobs SET status='verified',provider_id=?,last_error=NULL,lease_until=NULL,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM catering_callback_requests WHERE id=? AND status='requested' AND calendar_event_id=?)").bind(p.event_id,now,row.id,p.request_id,p.event_id)
    ]);
    const saved=await env.DB.prepare('SELECT status,calendar_event_id FROM catering_callback_requests WHERE id=?').bind(p.request_id).first();
    if(saved?.status!=='requested'||saved.calendar_event_id!==p.event_id){await setJob(env,row.id,'needs_review','request_changed_during_calendar_write',now);return 'needs_review';}
    return 'verified';
  } finally {
    await env.DB.prepare('DELETE FROM catering_callback_calendar_locks WHERE calendar_id=? AND holder=?').bind(p.calendar_id,holder).run();
  }
}
// No activation, credentials, hours or duration means an immediate provider-free no-op.
export async function runCallbackDelivery(env,{now=Date.now(),limit=3,adapter=null,emailSender=sendEmail}={}) {
  let settings;try{settings=await env.DB.prepare('SELECT * FROM catering_callback_settings WHERE id=1').first();}catch{return {status:'blocked',reason:'migration_missing'};}
  const readiness=callbackDeliveryReadiness(env,settings);if(!readiness.ready)return {status:'blocked',reason:readiness.reason};
  adapter=adapter||googleCallbackAdapter(env);
  const result={status:'ready',verified:0,accepted:0,needs_review:0};
  const requests=await env.DB.prepare(`SELECT r.*,q.customer_name,q.customer_email,q.event_date,q.deposit_status FROM catering_callback_requests r JOIN catering_quotes q ON q.id=r.quote_id WHERE r.created_at>=? AND r.status='requested' AND NOT EXISTS(SELECT 1 FROM catering_callback_jobs j WHERE j.request_id=r.id AND j.kind='calendar') ORDER BY r.created_at LIMIT 100`).bind(settings.enabled_at).all();
  for(const r of requests.results||[]) {
    if(r.status!=='requested'||r.deposit_status==='void')continue;
    const p={request_id:r.id,quote_id:r.quote_id,calendar_id:settings.calendar_email,start_at:r.requested_start_at,end_at:r.requested_start_at+settings.duration_minutes*60000,duration_minutes:settings.duration_minutes,event_id:await callbackEventId(r.id),phone:r.phone,customer_name:r.customer_name,customer_email:r.customer_email,event_date:r.event_date};
    await env.DB.prepare("INSERT OR IGNORE INTO catering_callback_jobs(id,request_id,kind,payload_json,due_at,created_at,updated_at) VALUES(?,?,'calendar',?,?,?,?)").bind(r.id+'_calendar',r.id,JSON.stringify(p),now,now,now).run();
  }
  const jobs=await env.DB.prepare("SELECT * FROM catering_callback_jobs WHERE kind='calendar' AND ((status='pending' AND next_attempt_at<=?) OR (status='leased' AND lease_until<?)) ORDER BY created_at LIMIT ?").bind(now,now,limit).all();
  for(const row of jobs.results||[]) {
    if(!await leaseJob(env,row,now))continue;
    const p=parse(row.payload_json),current=await env.DB.prepare('SELECT r.status,q.deposit_status FROM catering_callback_requests r JOIN catering_quotes q ON q.id=r.quote_id WHERE r.id=?').bind(row.request_id).first();
    if(p.calendar_id!==settings.calendar_email||current?.status!=='requested'||current.deposit_status==='void'){await setJob(env,row.id,'needs_review','request_changed_or_quote_void',now);result.needs_review++;continue;}
    try{const state=await calendarJob(env,row,p,adapter,now,readiness.availability);if(state==='verified')result.verified++;if(state==='needs_review')result.needs_review++;}
    catch {await setJob(env,row.id,row.attempts>=4?'needs_review':'pending','calendar_result_unconfirmed',now);}
  }
  // Customer messages require both owner activation and this exact previewed template version.
  if(!settings.customer_emails_enabled||settings.email_template_version!==CALLBACK_EMAIL_VERSION||!env.RESEND_API_KEY)return result;
  const confirmed=await env.DB.prepare("SELECT * FROM catering_callback_jobs WHERE kind='calendar' AND status='verified' AND (NOT EXISTS(SELECT 1 FROM catering_callback_jobs c WHERE c.request_id=catering_callback_jobs.request_id AND c.kind='confirmation') OR NOT EXISTS(SELECT 1 FROM catering_callback_jobs r WHERE r.request_id=catering_callback_jobs.request_id AND r.kind='reminder')) ORDER BY created_at LIMIT 100").all();
  for(const row of confirmed.results||[]) {
    const p=parse(row.payload_json);
    for(const kind of ['confirmation','reminder']) {
      const due=kind==='confirmation'?now:p.start_at-3600000;
      // A last-minute booking gets its confirmation, not a stale one-hour reminder.
      const lateReminder=kind==='reminder'&&row.updated_at>=due;
      const payload={...p,...callbackEmail(p,kind)};
      await env.DB.prepare('INSERT OR IGNORE INTO catering_callback_jobs(id,request_id,kind,payload_json,due_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(row.request_id+'_'+kind,row.request_id,kind,JSON.stringify(payload),due,lateReminder?'suppressed':'pending',now,now).run();
    }
  }
  const emails=await env.DB.prepare("SELECT * FROM catering_callback_jobs WHERE kind IN ('confirmation','reminder') AND due_at<=? AND ((status='pending' AND next_attempt_at<=?) OR (status='leased' AND lease_until<?)) ORDER BY due_at LIMIT ?").bind(now,now,now,limit).all();
  for(const row of emails.results||[]) {
    if(!await leaseJob(env,row,now))continue;
    const p=parse(row.payload_json),current=await env.DB.prepare('SELECT status FROM catering_callback_requests WHERE id=?').bind(row.request_id).first();
    if(current?.status!=='requested'||p.start_at<=now){await setJob(env,row.id,'suppressed','request_canceled_or_call_time_elapsed',now);continue;}
    if(row.first_attempt_at&&now-row.first_attempt_at>=23*3600000){await setJob(env,row.id,'needs_review','email_idempotency_window_elapsed',now);continue;}
    try {
      if(!calendarReadbackMatches(await adapter.get(p),p)){await setJob(env,row.id,'needs_review','calendar_changed_before_email',now);continue;}
      const latest=await env.DB.prepare('SELECT status FROM catering_callback_requests WHERE id=?').bind(row.request_id).first();
      if(latest?.status!=='requested'){await setJob(env,row.id,'suppressed','request_changed_before_email',now);continue;}
      const activation=await env.DB.prepare('SELECT enabled,customer_emails_enabled,email_template_version FROM catering_callback_settings WHERE id=1').first();
      if(!activation?.enabled||!activation.customer_emails_enabled||activation.email_template_version!==CALLBACK_EMAIL_VERSION){await setJob(env,row.id,'pending','customer_emails_disabled_during_attempt',now);continue;}
      const receipt=await emailSender(env,{to:p.to,replyTo:p.replyTo,subject:p.subject,text:p.text,html:p.html,idempotencyKey:'callback:'+row.request_id+':'+row.kind,timeoutMs:10000});
      if(receipt?.id){await setJob(env,row.id,'accepted',null,now,receipt.id);result.accepted++;}
      else await setJob(env,row.id,'suppressed','email_provider_skipped',now);
    }catch{await setJob(env,row.id,row.attempts>=4?'needs_review':'pending','email_result_unconfirmed',now);}
  }
  return result;
}
