import { square, squareConfigured } from './square.js';

export async function createBalanceCheckout(env, quoteId, baseUrl) {
  if (!env.DB || !squareConfigured(env)) return { ok:false, error:'Square or database is not configured.' };
  const q=await env.DB.prepare('SELECT id, balance_cents, balance_status, deposit_status FROM catering_quotes WHERE id=?').bind(quoteId).first();
  if (!q || q.deposit_status!=='paid' || q.balance_status!=='due' || !Number.isSafeInteger(q.balance_cents) || q.balance_cents<=0) return {ok:false,error:'An unpaid balance with a paid deposit is required.'};
  await env.DB.prepare("INSERT OR IGNORE INTO catering_balance_checkouts (quote_id,amount_cents,created_at) SELECT id,balance_cents,? FROM catering_quotes WHERE id=? AND balance_status='due' AND deposit_status='paid'").bind(Date.now(),q.id).run();
  const saved=await env.DB.prepare('SELECT * FROM catering_balance_checkouts WHERE quote_id=?').bind(q.id).first();
  if (!saved || saved.amount_cents!==q.balance_cents || saved.paid_at) return {ok:false,error:'The balance changed or has already been paid. Review this quote.'};
  if (saved.payment_link_url) return {ok:true,url:saved.payment_link_url};
  const result=await square(env,'/v2/online-checkout/payment-links',{method:'POST',body:{
    idempotency_key:'catering-balance-'+q.id,
    order:{location_id:env.SQUARE_LOCATION_ID,reference_id:'catering-balance',line_items:[{name:'Añejo catering — final balance',quantity:'1',base_price_money:{amount:saved.amount_cents,currency:'USD'}}]},
    checkout_options:{redirect_url:baseUrl+'/order/confirmed',ask_for_shipping_address:false,allow_tipping:false,accepted_payment_methods:{apple_pay:true,google_pay:true,cash_app_pay:true}}
  }});
  const link=result.data?.payment_link, url=link?.long_url||link?.url;
  if(!result.ok||!url||!link.order_id)return {ok:false,error:'Square could not create the balance link. Please retry.'};
  await env.DB.prepare('UPDATE catering_balance_checkouts SET square_order_id=?,payment_link_url=? WHERE quote_id=? AND amount_cents=?').bind(link.order_id,url,q.id,saved.amount_cents).run();
  return {ok:true,url};
}

export async function markBalancePaid(env, squareOrderId, amount, currency) {
  if(!env.DB||!squareOrderId)return null;
  const row=await env.DB.prepare('SELECT quote_id,amount_cents,paid_at FROM catering_balance_checkouts WHERE square_order_id=?').bind(squareOrderId).first();
  if(!row||row.paid_at||currency!=='USD'||Number(amount)!==row.amount_cents)return null;
  const now=Date.now();
  // D1 batch is transactional: both the quote and payment receipt advance together.
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE catering_quotes SET balance_status='paid',balance_paid_at=?,updated_at=? WHERE id=? AND balance_status='due'").bind(now,now,row.quote_id),
    env.DB.prepare('UPDATE catering_balance_checkouts SET paid_at=? WHERE quote_id=? AND paid_at IS NULL').bind(now,row.quote_id)
  ]);
  return results[1]?.meta?.changes===1?row.quote_id:null;
}
