import { trustedDevice, etDate } from './contract.js';
export function validateFeedback(b) {
 if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
 if (typeof b.response_id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(b.response_id)) return null;
 if (typeof b.order_id !== 'string' || !b.order_id || b.order_id.length>100) return null;
 const rating=b.rating ?? null, mood=b.mood ?? null;
 if (!((Number.isInteger(rating) && rating>=1 && rating<=10 && mood===null) || (rating===null && ['sad','neutral','happy'].includes(mood)))) return null;
 if (!['yes','no','unsure','unanswered'].includes(b.eat_again)) return null;
 if (typeof (b.suggestion ?? '') !== 'string' || (b.suggestion ?? '').length>500) return null;
 return {id:b.response_id,order_id:b.order_id,rating,mood,eat_again:b.eat_again,suggestion:(b.suggestion??'').trim()};
}
export async function feedbackSite(env, token, cookie, reminder, qr) {
 if (qr) {
  if(typeof qr!=='string'||!/^[a-f0-9]{64}$/.test(qr))return null;
  return env.DB.prepare(`SELECT s.*,1 AS public_qr FROM contract_feedback_qr q JOIN contract_sites s ON s.id=q.site_id JOIN contract_accounts a ON a.id=s.account_id WHERE q.token=? AND q.active=1 AND s.active=1 AND a.status='active'`).bind(qr).first();
 }
 if (typeof reminder==='string' && /^[a-f0-9]{64}$/.test(reminder)) {
  return env.DB.prepare(`SELECT s.*,r.contract_order_id AS reminder_order_id FROM contract_survey_reminders r JOIN contract_sites s ON s.id=r.site_id JOIN contract_accounts a ON a.id=s.account_id WHERE r.link_token=? AND r.completed_at+86400000>? AND r.status IN ('sending','sent','unconfirmed') AND s.active=1 AND a.status='active'`).bind(reminder,Date.now()).first();
 }
 if (typeof token !== 'string' || !token || token.length>200) return null;
 const site=await env.DB.prepare("SELECT s.* FROM contract_sites s JOIN contract_accounts a ON a.id=s.account_id WHERE s.intake_token=? AND s.active=1 AND a.status='active'").bind(token).first();
 if (!site || !await trustedDevice(env,site,cookie)) return null;
 return site;
}
export async function servedOrder(env, site, orderId) {
 return env.DB.prepare("SELECT c.id,c.service_date,c.item_name,c.headcount,d.id AS delivery_id FROM contract_orders c JOIN deliveries d ON d.order_id=c.order_id WHERE c.id=? AND c.site_id=? AND c.service_date<=? AND c.headcount>0 AND d.status='completed' AND d.completed_at IS NOT NULL ORDER BY d.completed_at ASC LIMIT 1").bind(orderId,site.id,etDate(Date.now())).first();
}
