import {square,squareConfigured} from './square.js';
const ORDER_STATES=new Set(['DRAFT','OPEN','COMPLETED','CANCELED']);
const PAYMENT_STATES=new Set(['APPROVED','PENDING','COMPLETED','CANCELED','FAILED']);
const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
async function inspect(env,quoteId) {
 const quote=await env.DB.prepare('SELECT id,deposit_status,square_order_id FROM catering_quotes WHERE id=?').bind(quoteId).first();
 if(!quote)return {quote_id:quoteId,provider_verified:false,error:'Quote not found.'};
 const basic={quote_id:quote.id,local_status:quote.deposit_status,provider_verified:false,order_state:'UNKNOWN',tender_count:null,payments:[]};
 if(!squareConfigured(env)||!safeId(quote.square_order_id))return {...basic,error:'Existing Square checkout is not configured.'};
 let response;try{response=await square(env,`/v2/orders/${encodeURIComponent(quote.square_order_id)}`);}catch{return {...basic,error:'Square order could not be read.'};}
 const order=response.data?.order;
 if(!response.ok||order?.id!==quote.square_order_id)return {...basic,error:'Square order could not be verified.'};
 if(order.tenders!=null&&!Array.isArray(order.tenders))return {...basic,error:'Square tender data is unavailable.'};
 const tenders=order.tenders||[],payments=[];
 for(const tender of tenders.slice(0,10)){
  const paymentId=tender?.payment_id||tender?.id;if(!safeId(paymentId))continue;
  let payment;try{const read=await square(env,`/v2/payments/${encodeURIComponent(paymentId)}`);if(read.ok&&read.data?.payment?.id===paymentId)payment=read.data.payment;}catch{/* Read failure remains UNKNOWN. */}
  payments.push({id:paymentId,status:PAYMENT_STATES.has(payment?.status)?payment.status:'UNKNOWN'});
 }
 return {...basic,provider_verified:true,order_state:ORDER_STATES.has(order.state)?order.state:'UNKNOWN',tender_count:tenders.length,payments,payments_truncated:tenders.length>10};
}
export async function cateringCheckoutStatus(env,body) {
 const quoteId=String(body.quote_id||'');if(!/^[A-Za-z0-9_-]{1,100}$/.test(quoteId))return {ok:false,error:'Valid quote id required.'};
 let target=String(body.replacement_quote_id||'');
 if(!target){const saved=await env.DB.prepare('SELECT replacement_quote_id FROM catering_quote_revisions WHERE source_quote_id=? UNION ALL SELECT target_quote_id AS replacement_quote_id FROM catering_quote_duplicate_retirements WHERE source_quote_id=?').bind(quoteId,quoteId).first();target=saved?.replacement_quote_id||'';}
 if(target&&!/^[A-Za-z0-9_-]{1,100}$/.test(target))return {ok:false,error:'Valid retained quote id required.'};
 const source=await inspect(env,quoteId),retained=target?await inspect(env,target):null;
 return {ok:true,source,retained,observed_at:Date.now(),read_only:true};
}
