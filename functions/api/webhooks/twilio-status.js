import { ctEq } from '../../_lib/util.js';

const rank={scheduled:0,accepted:0,queued:1,sending:2,sent:3,delivered:4,undelivered:4,failed:4,canceled:4,read:5};
export async function onRequestPost({request,env}) {
  // Status callbacks always require the provider signature, including local/dev routes.
  if(!env.TWILIO_AUTH_TOKEN||!env.DB)return new Response('forbidden',{status:403});
  const params=new URLSearchParams(await request.text());
  let data=env.TWILIO_STATUS_CALLBACK_URL||request.url;
  for(const key of [...params.keys()].sort())data+=key+(params.get(key)||'');
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.TWILIO_AUTH_TOKEN),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const mac=await crypto.subtle.sign('HMAC',key,encoder.encode(data));
  const expected=btoa(String.fromCharCode(...new Uint8Array(mac)));
  if(!ctEq(expected,request.headers.get('X-Twilio-Signature')||''))return new Response('invalid signature',{status:403});
  const sid=params.get('MessageSid'),status=params.get('MessageStatus');
  if(!/^SM[a-fA-F0-9]{32}$/.test(sid||'')||!Object.hasOwn(rank,status))return new Response('invalid status',{status:400});
  try {
    const oldReceipt=await env.DB.prepare('SELECT status FROM sms_delivery_receipts WHERE provider_sid=?').bind(sid).first();
    const error=['failed','undelivered'].includes(status)?String(params.get('ErrorCode')||'Carrier could not deliver').slice(0,200):null;
    if(!oldReceipt || (rank[oldReceipt.status]??-1)<rank[status]) {
      await env.DB.prepare(`INSERT INTO sms_delivery_receipts(provider_sid,status,error,received_at) VALUES(?,?,?,?)
        ON CONFLICT(provider_sid) DO UPDATE SET status=excluded.status,error=excluded.error,received_at=excluded.received_at
        WHERE CASE sms_delivery_receipts.status WHEN 'read' THEN 5 WHEN 'delivered' THEN 4 WHEN 'undelivered' THEN 4 WHEN 'failed' THEN 4 WHEN 'canceled' THEN 4 WHEN 'sent' THEN 3 WHEN 'sending' THEN 2 WHEN 'queued' THEN 1 ELSE 0 END
        < CASE excluded.status WHEN 'read' THEN 5 WHEN 'delivered' THEN 4 WHEN 'undelivered' THEN 4 WHEN 'failed' THEN 4 WHEN 'canceled' THEN 4 WHEN 'sent' THEN 3 WHEN 'sending' THEN 2 WHEN 'queued' THEN 1 ELSE 0 END`)
        .bind(sid,status,error,Date.now()).run();
    }
    const existing=await env.DB.prepare('SELECT id,status FROM sms_log WHERE provider_sid=? AND direction=\'outbound\' LIMIT 1').bind(sid).first();
    // Receipt survives an early callback; the sender reconciles it after inserting its log.
    if(!existing)return new Response(null,{status:204});
    await env.DB.prepare('UPDATE sms_log SET status=(SELECT status FROM sms_delivery_receipts WHERE provider_sid=?),error=(SELECT error FROM sms_delivery_receipts WHERE provider_sid=?) WHERE id=?')
      .bind(sid,sid,existing.id).run();
    return new Response(null,{status:204});
  }catch{return new Response('receipt storage unavailable',{status:503});}
}
