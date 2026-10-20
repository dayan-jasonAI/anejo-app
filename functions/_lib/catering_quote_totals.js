// Owner-entered delivery is explicit integer cents, separate from food lines.
import {normalizeQuoteLines,MAX_TOTAL_CENTS} from './catering_quote_lines.js';
export function quoteDeliveryFee(value,stored=null) {
 const fee=value===undefined?stored:value;
 if(fee===null)return {ok:true,delivery_fee_cents:null};
 if(typeof fee!=='number'||!Number.isSafeInteger(fee)||fee<0||fee>MAX_TOTAL_CENTS)return {ok:false,error:'Delivery fee must be a nonnegative whole number of cents, or left unconfirmed.'};
 return {ok:true,delivery_fee_cents:fee};
}
export function quoteLineTotals(lines,fee,stored=null) {
 const norm=normalizeQuoteLines(lines);if(!norm.ok)return norm;
 const delivery=quoteDeliveryFee(fee,stored);if(!delivery.ok)return delivery;
 const total=norm.subtotal_cents+(delivery.delivery_fee_cents||0);
 if(total>MAX_TOTAL_CENTS)return {ok:false,error:'Food and delivery total exceeds $100,000.'};
 return {...norm,...delivery,total_cents:total};
}
