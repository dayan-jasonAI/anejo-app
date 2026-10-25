const ranks={sent:1,delivery_delayed:2,delivered:3,opened:4,clicked:5,failed:6,bounced:6,complained:7,suppressed:7};
export async function saveCateringEmailReceipt(env,{provider_id,status,at=Date.now(),source='signed_webhook'}){
 if(typeof provider_id!=='string'||provider_id.length>192||!Object.hasOwn(ranks,status))return false;
 const rankSql=column=>'CASE '+column+' '+Object.entries(ranks).map(([name,rank])=>"WHEN '"+name+"' THEN "+rank).join(' ')+' ELSE 0 END';
 const old=await env.DB.prepare('SELECT status FROM catering_email_receipts WHERE provider_id=?').bind(provider_id).first();
 if(old&&(ranks[old.status]||0)>ranks[status])return true;
 await env.DB.prepare('INSERT INTO catering_email_receipts VALUES(?,?,?,?) ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status,observed_at=excluded.observed_at,source=excluded.source WHERE catering_email_receipts.observed_at<=excluded.observed_at AND '+rankSql('catering_email_receipts.status')+'<='+rankSql('excluded.status')).bind(provider_id,status,at,source).run();return true;
}
export async function syncCateringEmailReceipts(env,qid,{fetcher=fetch,at=Date.now()}={}){
 if(!env.RESEND_API_KEY)return {ok:false,error:'Provider receipt access unavailable.'};
 const messages=(await env.DB.prepare(`SELECT receipt_id AS provider_id,json_extract(snapshot_json,'$.recipient') AS recipient FROM catering_experience_outbox WHERE quote_id=? AND receipt_id IS NOT NULL UNION SELECT provider_id,json_extract(snapshot_json,'$.recipient') AS recipient FROM catering_service_messages WHERE quote_id=? AND channel='email' AND provider_id IS NOT NULL`).bind(qid,qid).all()).results||[];
 let saved=0;for(const m of messages){
  const r=await fetcher('https://api.resend.com/emails/'+encodeURIComponent(m.provider_id),{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(10000)});if(!r.ok)continue;
  const d=await r.json(),to=Array.isArray(d.to)?d.to:[d.to];if(d.id!==m.provider_id||!to.some(x=>String(x).trim().toLowerCase()===String(m.recipient).trim().toLowerCase()))continue;
  if(await saveCateringEmailReceipt(env,{provider_id:m.provider_id,status:d.last_event,at,source:'provider_readback'}))saved++;
 }
 return {ok:true,saved};
}
