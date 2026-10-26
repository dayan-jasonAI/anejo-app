// Audit authority for the separate, explicitly dated lunch offer. This is the same
// validated configuration checkout consumes, not a reconstructed menu or an approval.
import {loadDailyLunch,DAILY_PRICE_CENTS,DAILY_MAX_QTY,DAILY_GROUP_FREE_DELIVERY_MIN_QTY} from './daily_lunch.js';

const clockLabel=value=>{
 const [h,m]=value.split(':').map(Number);
 return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'p.m.':'a.m.');
};
export async function loadDailyLunchAuditContext(env){
 try {
  const {config,version,updated_at}=await loadDailyLunch(env);
  const scheduled=config.dates.filter(row=>row.enabled&&!row.sold_out);
  const products=new Map(config.products.map(product=>[product.id,product]));
  const lines=[
   'DAILY LUNCH — recorded website offer, separate from regular menu_items prices.',
   'Source: daily_lunch_config id=1; version='+version+'; updated_at='+updated_at+'.',
   'Ordering route: https://anejocateringco.com/order?category=daily . Daily lunch price: $'+(DAILY_PRICE_CENTS/100).toFixed(2)+' per meal; quantities 1–'+DAILY_MAX_QTY+'.',
   'Daily lunch advance ordering cutoff: '+config.settings.preorder_cutoff+' ('+clockLabel(config.settings.preorder_cutoff)+') America/New_York (Eastern), the day before delivery. This is the currently configured value, not a permanent promise.',
   config.settings.same_day_cutoff==='00:00'?'Same-day daily lunch ordering is disabled.':'Same-day daily lunch ordering cutoff: '+config.settings.same_day_cutoff+' America/New_York (Eastern).',
   'Advance preorders for a future delivery date include free delivery to one address within the configured service area; groups of '+DAILY_GROUP_FREE_DELIVERY_MIN_QTY+' or more meals also qualify. Availability and delivery-area checks still apply.',
   'Explicit enabled, not-sold-out schedule rows follow. These are dated menu announcements, not a promise that checkout remains open after a cutoff or closure. No unlisted date or weekday template is an approved sales date.',
  ];
  const described=new Set();
  for(const row of scheduled){const product=products.get(row.product_id);lines.push('Delivery date '+row.date+': '+product.name+'; product_id='+product.id+'; $'+(DAILY_PRICE_CENTS/100).toFixed(2)+'.');if(!described.has(product.id)){lines.push('Recorded '+product.name+' description: '+product.description);described.add(product.id);}}
  if(!scheduled.length)lines.push('No enabled, not-sold-out delivery dates are configured. Do not advertise an orderable lunch date.');
  const text=lines.join('\n');
  if(text.length>32000)throw Error('Daily lunch audit authority exceeds bounded context.');
  return {text,price_cents:scheduled.length?DAILY_PRICE_CENTS:null,receipt:{source:'d1_daily_lunch_config',status:'ok',version,updated_at,scheduled_dates:scheduled.length}};
 }catch{return {text:'DAILY LUNCH AUTHORITY UNAVAILABLE: no validated current configuration was read. Do not infer a price, menu, cutoff or orderable date from old campaigns.',price_cents:null,receipt:{source:'d1_daily_lunch_config',status:'unavailable'}};}
}

// Bounded source receipt for shared Lead/planner inference and private proposal promotion.
export async function dailyLunchInferenceReceipt(context){
 const text=String(context?.text||'');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
 return {source:'d1_daily_lunch_config',read_status:context?.receipt?.status==='ok'?'ok':'unavailable',id:'1',updated_at:context?.receipt?.updated_at??null,truncated:false,rendered_sha256:hash};
}
