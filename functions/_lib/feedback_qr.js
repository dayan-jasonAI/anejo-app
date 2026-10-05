import QRCode from './vendor/feedback-qr-core.js';
import {appBaseUrl,now} from './util.js';
export async function ensureFeedbackQr(env,siteId){
 const site=await env.DB.prepare("SELECT s.id FROM contract_sites s JOIN contract_accounts a ON a.id=s.account_id WHERE s.id=? AND s.active=1 AND a.status='active'").bind(siteId).first();
 if(!site)return null;
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 await env.DB.prepare('INSERT INTO contract_feedback_qr(site_id,token,active,created_at) VALUES(?,?,1,?) ON CONFLICT(site_id) DO NOTHING').bind(siteId,token,now()).run();
 return env.DB.prepare('SELECT token FROM contract_feedback_qr WHERE site_id=? AND active=1').bind(siteId).first();
}
export function feedbackQrUrl(env,token){return appBaseUrl(env)+'/lunch-feedback?q='+encodeURIComponent(token);}
export function feedbackQrSvg(url){const qr=QRCode.create(url,{errorCorrectionLevel:'M'}),size=qr.modules.size,side=size+8;let path='';for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.modules.get(y,x))path+=`M${x+4} ${y+4}h1v1h-1z`;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="Scan to rate today's lunch"><rect width="${side}" height="${side}" fill="#f5f2ec"/><path d="${path}" fill="#163414"/></svg>`;}
