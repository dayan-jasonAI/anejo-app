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
export async function feedbackSite(env, token, cookie) {
 if (typeof token !== 'string' || !token || token.length>200) return null;
 const site=await env.DB.prepare("SELECT s.* FROM contract_sites s JOIN contract_accounts a ON a.id=s.account_id WHERE s.intake_token=? AND s.active=1 AND a.status='active'").bind(token).first();
 if (!site || !await trustedDevice(env,site,cookie)) return null;
 return site;
}
export async function servedOrder(env, site, orderId) {
 return env.DB.prepare('SELECT id,service_date,item_name,headcount FROM contract_orders WHERE id=? AND site_id=? AND service_date<=? AND headcount>0').bind(orderId,site.id,etDate(Date.now())).first();
}
