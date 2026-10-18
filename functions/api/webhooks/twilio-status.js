import { ctEq } from '../../_lib/util.js';

const rank={accepted:0,queued:1,sending:2,sent:3,delivered:4,undelivered:4,failed:4};
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
    const existing=await env.DB.prepare('SELECT id,status FROM sms_log WHERE provider_sid=? AND direction=\'outbound\' LIMIT 1').bind(sid).first();
    // Provider callbacks can arrive before the POST response is persisted; ask for a retry.
    if(!existing)return new Response('receipt not yet available',{status:503});
    if((rank[existing.status]??-1)<rank[status]) {
      await env.DB.prepare('UPDATE sms_log SET status=?,error=? WHERE id=? AND status=?')
        .bind(status,['failed','undelivered'].includes(status)?String(params.get('ErrorCode')||'Carrier could not deliver').slice(0,200):null,existing.id,existing.status).run();
    }
    return new Response(null,{status:204});
  }catch{return new Response('receipt storage unavailable',{status:503});}
}
