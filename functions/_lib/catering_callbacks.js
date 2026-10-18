import { raiseAlert } from './alerts.js';

export const CALLBACK_TIMEZONE = 'America/New_York';
export const CALLBACK_NOTICE = 'Preferred time requested; awaiting confirmation. No appointment is booked yet.';
export const callbackCapabilities = Object.freeze({booking_available:false,google_calendar_connected:false,customer_emails_enabled:false,timezone:CALLBACK_TIMEZONE,calendar_email:'dayan@anejocateringco.com'});
const publicRow = row => ({id:row.id,status:row.status,requested_start_at:row.requested_start_at,timezone:row.timezone,phone:row.phone,created_at:row.created_at});
export async function callbackQuote(env,token) {
  if(!/^[a-f0-9]{32}$/.test(String(token||'')))return null;
  return await env.DB.prepare('SELECT * FROM catering_quotes WHERE access_token=?').bind(token).first();
}
export async function listCallbacks(env,quoteId) {
  const rows=await env.DB.prepare('SELECT * FROM catering_callback_requests WHERE quote_id=? ORDER BY created_at DESC LIMIT 25').bind(quoteId).all();
  return (rows.results||[]).map(publicRow);
}
// Resolve Eastern wall time independently of the server timezone. DST gaps and repeated hours
// are rejected rather than silently moving the customer's preferred time.
export function easternCallbackTimestamp(local) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(local||'')))return null;
  const wanted=local.replace('T',' '), matches=[];
  for(const offset of ['-04:00','-05:00']) {
    const timestamp=Date.parse(local+offset);if(!Number.isFinite(timestamp))continue;
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:CALLBACK_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(timestamp);
    const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    if(`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`===wanted)matches.push(timestamp);
  }
  return matches.length===1?matches[0]:null;
}
export function validateCallback(body,quote,now=Date.now()) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.request_key||'')))return {error:'A request identifier is required. Reload and try again.'};
  if(body.timezone!=null&&body.timezone!==CALLBACK_TIMEZONE)return {error:'Please choose your preferred time in Eastern time.'};
  const raw=String(body.requested_start||'');
  if(!body.requested_local&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw))return {error:'Choose a date and time with a timezone.'};
  const start=body.requested_local?easternCallbackTimestamp(body.requested_local):Date.parse(raw);
  if(start==null)return {error:'Choose a valid Eastern time outside the daylight-saving clock change.'};
  if(!Number.isFinite(start)||start<=now||start>now+366*86400000)return {error:'Choose a future time within one year.'};
  let phone=String(body.phone||quote.customer_phone||'').replace(/\D/g,'');
  if(phone.length===10)phone='1'+phone;
  if(!/^1\d{10}$/.test(phone))return {error:'Enter a valid US callback phone number.'};
  return {start,phone:'+'+phone,key:String(body.request_key).toLowerCase()};
}
export async function requestCallback(env,quote,body,{now=Date.now()}={}) {
  // Idempotent replays retain their original data even after the chosen time has passed.
  const key=String(body.request_key||'').toLowerCase();
  let row=await env.DB.prepare('SELECT * FROM catering_callback_requests WHERE quote_id=? AND request_key=?').bind(quote.id,key).first();
  if(!row) {
    if(quote.deposit_status==='void')return {error:'This quote has been replaced. Please open your latest quote.'};
    const parsed=validateCallback(body,quote,now);if(parsed.error)return parsed;
    const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM catering_callback_requests WHERE quote_id=? AND status='requested'").bind(quote.id).first();
    if(Number(active?.n)>=3)return {error:'You already have pending callback requests. Please call us to change them.'};
    const id='ccb_'+crypto.randomUUID().replaceAll('-','');
    const payload={request_id:id,quote_id:quote.id,customer_name:quote.customer_name,customer_email:quote.customer_email,event_date:quote.event_date,phone:parsed.phone,requested_start_at:parsed.start,timezone:CALLBACK_TIMEZONE,notice:CALLBACK_NOTICE};
    // Atomic storage: no response implies an outbox exists unless the same request row exists.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO catering_callback_requests(id,quote_id,request_key,requested_start_at,timezone,phone,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM catering_callback_requests WHERE quote_id=? AND status='requested')<3").bind(id,quote.id,parsed.key,parsed.start,CALLBACK_TIMEZONE,parsed.phone,now,now,quote.id),
      ...['calendar','confirmation','reminder'].map(kind=>env.DB.prepare(`INSERT OR IGNORE INTO catering_callback_outbox(id,request_id,kind,payload_json,created_at)
        SELECT ?,id,?,?,? FROM catering_callback_requests WHERE quote_id=? AND request_key=?`).bind(id+'_'+kind,kind,JSON.stringify({...payload,kind}),now,quote.id,parsed.key))
    ]);
    row=await env.DB.prepare('SELECT * FROM catering_callback_requests WHERE quote_id=? AND request_key=?').bind(quote.id,parsed.key).first();
  }
  if(!row)return {error:'Could not save your preferred time. Please try again.'};
  if(!row.owner_alert_id) {
    const receipt=await raiseAlert(env,{alert_type:'catering_followup_due',severity:'warning',title:'Customer requested a callback',body:`${quote.customer_name||'Catering customer'} requested ${new Date(row.requested_start_at).toLocaleString('en-US',{timeZone:CALLBACK_TIMEZONE})} Eastern. Time is not confirmed.`,ref_type:'catering_callback',ref_id:row.id,url:'/hub/owner/callbacks.html',dedupe_key:'callback:'+row.id,onceEver:true});
    if(receipt.ok)await env.DB.prepare('UPDATE catering_callback_requests SET owner_alert_id=? WHERE id=?').bind(receipt.id,row.id).run();
  }
  return {ok:true,request:publicRow(row),message:quote.lang==='es'?'Horario preferido solicitado; pendiente de confirmación. Aún no hay una cita reservada.':CALLBACK_NOTICE,capabilities:callbackCapabilities};
}
