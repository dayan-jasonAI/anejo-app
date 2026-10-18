// Catering conversations use existing thread/message tables. Provider acceptance is not delivery.
import { sendSms } from './twilio.js';
export const phoneDigits = value => String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const normalized = column => `replace(replace(replace(replace(replace(${column},'+',''),'-',''),' ',''),'(',''),')','')`;
export async function leadForPhone(env, phone) {
  const digits = phoneDigits(phone);
  if (digits.length !== 10) return null;
  const rows = await env.DB.prepare(`SELECT id,name,phone,sms_consent FROM leads WHERE kind='catering' AND ${normalized('phone')} IN (?,?) LIMIT 2`).bind(digits, '1' + digits).all();
  return rows.results?.length === 1 ? rows.results[0] : null;
}
export async function conversationLead(env, thread) {
  if (thread.ref_type !== 'lead') return null;
  return env.DB.prepare("SELECT id,name,phone,sms_consent FROM leads WHERE id=? AND kind='catering'").bind(thread.ref_id).first();
}
export async function ensureCateringConversation(env, { lead, quote }) {
  const refType = lead ? 'lead' : 'catering_quote';
  const refId = lead?.id || quote?.id;
  if (!refId) return null;
  const tid = `thr_catering_${refType}_${refId}`;
  const t = Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO threads (id,audience,subject,ref_type,ref_id,status,created_at,updated_at) VALUES (?,'client',?,?,?,'open',?,?)`)
    .bind(tid, `Catering · ${lead?.name || quote?.customer_name || 'Customer'}`, refType, refId, t, t).run();
  return { id: tid, audience: 'client', ref_type: refType, ref_id: refId };
}
export function smsReceipt(row) {
  if (!row) return { status: 'unverified', provider_sid: null };
  const status = ['accepted','queued','sending','sent'].includes(row.status) ? (row.provider_sid ? 'provider_accepted' : 'unverified') : row.status;
  return { status, provider_sid: row.provider_sid || null, error: row.error || null };
}
export async function projectSms(env, { thread, logId, body, direction = 'outbound', actorId = null, providerSid = null }) {
  if (!logId) throw Error('SMS receipt was not persisted; outcome requires reconciliation.');
  const t = Date.now();
  const mid = providerSid ? `msg_twilio_${providerSid}` : `msg_sms_${logId}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO messages (id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,sms_log_id,created_at) VALUES (?,?,?,'sms',?,?,?,0,?,?)`)
    .bind(mid, thread.id, direction, actorId, actorId ? 'owner' : null, body, logId, t).run();
  await env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(t,t,thread.id).run();
  return mid;
}
export async function cateringSmsOptedOut(env, phone) {
  const digits=phoneDigits(phone);
  return !!await env.DB.prepare(`SELECT id FROM campaign_unsubscribes WHERE channel='sms' AND source='reply_stop' AND ${normalized('phone')} IN (?,?) LIMIT 1`).bind(digits,'1'+digits).first();
}
export async function sendCateringSms(env, { thread, lead, body, actorId, requestId }) {
  if (!lead?.sms_consent || !phoneDigits(lead.phone)) return { ok: false, error: 'Customer SMS consent or phone is missing.' };
  const blocked = await cateringSmsOptedOut(env,lead.phone);
  if (blocked) return { ok: false, error: 'Customer has opted out of text messages.' };
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId || '')) return { ok: false, error: 'A unique SMS request ID is required.' };
  const prior = await env.DB.prepare('SELECT m.id,m.body,m.thread_id,s.status,s.provider_sid FROM messages m LEFT JOIN sms_log s ON s.id=m.sms_log_id WHERE m.id=?').bind(`msg_catering_send_${requestId}`).first();
  if(prior){
    if(prior.thread_id!==thread.id||prior.body!==body)return {ok:false,error:'Request already exists with different text or destination.'};
    const receipt=smsReceipt(prior);
    if(receipt.status==='provider_accepted'||receipt.status==='delivered')return {ok:true,id:prior.id,replayed:true,sms:{sent:true,...receipt}};
    return {ok:false,error:'This SMS request already exists without verified provider acceptance. Reconcile before retrying.'};
  }
  const uncertain = await env.DB.prepare(`SELECT m.id FROM messages m LEFT JOIN sms_log s ON s.id=m.sms_log_id WHERE m.thread_id=? AND m.direction='outbound' AND m.channel='sms' AND (s.id IS NULL OR s.status='unknown') LIMIT 1`).bind(thread.id).first();
  if(uncertain)return {ok:false,error:'An earlier text has an unverified outcome. Reconcile its provider receipt before sending another.'};
  // Claim before contacting provider; uncertain sends cannot be replayed automatically.
  const mid = `msg_catering_send_${requestId}`;
  let claimed;
  try { claimed = await env.DB.prepare(`INSERT OR IGNORE INTO messages (id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES (?,?,'outbound','sms',?,'owner',?,0,?)`)
    .bind(mid,thread.id,actorId,body,Date.now()).run(); }
  catch { return {ok:false,error:'Another text is pending in this conversation. Check its receipt first.'}; }
  if (!claimed.meta?.changes) return { ok: false, error: 'This SMS request already exists. Check its receipt before sending another.' };
  const sent = await sendSms(env,{to:lead.phone,body,thread_id:thread.id});
  if (sent.sms_log_id) await env.DB.prepare('UPDATE messages SET sms_log_id=? WHERE id=?').bind(sent.sms_log_id,mid).run();
  await env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(Date.now(),Date.now(),thread.id).run();
  return { ok: !!sent.sent, id: mid, record_error: sent.record_error || null, sms: { sent: !!sent.sent, status: sent.sent ? (sent.status === 'delivered' ? 'delivered' : 'provider_accepted') : sent.noop ? 'noop' : sent.status || 'unknown', provider_sid: sent.provider_sid || null }, error: sent.error || (sent.noop ? 'SMS is not configured.' : null) };
}

// Owner-initiated reconciliation reads provider records; it NEVER sends or reconstructs text.
// Twilio Messages list: https://www.twilio.com/docs/messaging/api/message-resource
export async function syncCateringQuoteSms(env, quoteId) {
  if(!env.DB)return {ok:false,status:503,error:'Database unavailable.'};
  const quote=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(quoteId).first();
  if(!quote)return {ok:false,status:404,error:'Quote not found.'};
  const digits=phoneDigits(quote.customer_phone),at=Number(quote.sms_sent_at);
  if(digits.length!==10||!at||!quote.access_token)return {ok:false,status:409,error:'A recorded quote SMS timestamp, phone and access token are required. No text was reconstructed.'};
  if(!/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')||!env.TWILIO_AUTH_TOKEN)return {ok:false,status:503,error:'Twilio read access is not configured.'};
  const path=`/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  let next=new URL(path,'https://api.twilio.com');next.searchParams.set('To','+1'+digits);next.searchParams.set('PageSize','100');
  const candidates=new Map();
  for(let page=0;page<3;page++){
    let data, response;
    try{
      response=await fetch(next.href,{method:'GET',headers:{Authorization:'Basic '+btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)},signal:AbortSignal.timeout(15000),redirect:'error'});
    }catch(error){return {ok:false,status:502,error:'Provider history is unavailable. Please retry receipt sync later; no new text was sent.',diagnostic:{stage:'provider_history',category:['TimeoutError','AbortError'].includes(error?.name)?'timeout':'network_error'}};}
    if(!response.ok)return {ok:false,status:502,error:`Provider history returned HTTP ${response.status}. Please retry receipt sync later; no new text was sent.`,diagnostic:{stage:'provider_history',category:'http_error',http_status:response.status}};
    try{data=await response.json();}
    catch(error){return {ok:false,status:502,error:'Provider history could not be read. Please retry receipt sync later; no new text was sent.',diagnostic:{stage:'provider_history',category:['TimeoutError','AbortError'].includes(error?.name)?'timeout':'invalid_json'}};}
    if(!Array.isArray(data?.messages)||data.messages.some(message=>!message||typeof message!=='object'||Array.isArray(message)))return {ok:false,status:502,error:'Provider history has an unsupported format. No new text was sent.',diagnostic:{stage:'provider_history',category:'invalid_response'}};
    for(const message of data.messages){
      const time=Date.parse(message.date_created||message.date_sent||'');
      const body=typeof message.body==='string'?message.body:'';
      const links=body.match(/https:\/\/[^\s<>]+/g)||[];
      const exact=links.some(link=>{try{const url=new URL(link.replace(/[.,!?]+$/,''));return url.hostname==='anejocateringco.com'&&url.pathname===`/q/${quote.access_token}`;}catch{return false;}});
      if(phoneDigits(message.to)!==digits||!String(message.direction||'').startsWith('outbound')||!Number.isFinite(time)||Math.abs(time-at)>10*60000||!exact||!/^SM[a-f0-9]{32}$/i.test(message.sid||''))continue;
      candidates.set(message.sid,{...message,observed_at:time});
    }
    if(!data.next_page_uri){next=null;break;}
    try{next=new URL(data.next_page_uri,'https://api.twilio.com');if(next.origin!=='https://api.twilio.com'||next.pathname!==path)throw Error('Invalid next page');}catch{return {ok:false,status:502,error:'Provider pagination could not be validated.',diagnostic:{stage:'provider_history',category:'invalid_pagination'}};}
  }
  if(next)return {ok:false,status:409,error:'Provider scan reached its three-page bound. Reconcile manually; no receipt was imported.'};
  if(candidates.size!==1)return {ok:false,status:409,error:candidates.size?'Multiple matching provider messages; owner reconciliation required.':'No exact provider message matched this quote. No text was reconstructed.'};
  const match=[...candidates.values()][0];
  let detail;try{detail=JSON.parse(quote.quote_json||'{}');}catch{detail={};}
  const lead=detail.lead_id?await env.DB.prepare("SELECT id,name,phone,sms_consent FROM leads WHERE id=? AND kind='catering'").bind(detail.lead_id).first():await leadForPhone(env,quote.customer_phone);
  const thread=await ensureCateringConversation(env,{lead,quote});
  const old=await env.DB.prepare('SELECT id FROM sms_log WHERE provider_sid=? LIMIT 1').bind(match.sid).first();
  const logId=old?.id||`sms_provider_${match.sid}`;
  const statuses=['accepted','scheduled','canceled','queued','sending','sent','failed','delivered','undelivered'];
  const status=statuses.includes(match.status)?match.status:'unknown';
  const error=match.error_code?String(match.error_code):null;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO sms_log (id,direction,channel,to_number,from_number,body,thread_id,status,provider_sid,error,created_at) VALUES (?,'outbound','sms',?,?,?,?,?,?,?,?)`).bind(logId,match.to,match.from||null,match.body,thread.id,status,match.sid,error,match.observed_at),
    env.DB.prepare('UPDATE sms_log SET thread_id=?,status=?,error=? WHERE id=?').bind(thread.id,status,error,logId),
    env.DB.prepare('UPDATE messages SET thread_id=? WHERE sms_log_id=?').bind(thread.id,logId),
    env.DB.prepare(`INSERT OR IGNORE INTO messages (id,thread_id,direction,channel,body,ai_drafted,sms_log_id,created_at) SELECT ?,?,'outbound','sms',?,0,?,? WHERE NOT EXISTS (SELECT 1 FROM messages WHERE sms_log_id=?)`).bind(`msg_twilio_${match.sid}`,thread.id,match.body,logId,match.observed_at,logId),
    env.DB.prepare('UPDATE threads SET last_message_at=MAX(COALESCE(last_message_at,0),?),updated_at=? WHERE id=?').bind(match.observed_at,Date.now(),thread.id),
  ]);
  return {ok:true,thread_id:thread.id,quote_id:quote.id,provider_sid:match.sid,receipt:smsReceipt({status,provider_sid:match.sid,error}),source:'twilio_provider_history',sent_new_message:false};
}
