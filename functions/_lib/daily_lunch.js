// Daily lunches share the normal paid-order kitchen path. Explicit dates, never implicit recurring sales.
import { cateringEventTimestamp } from './catering-notice.js';
import { etDayParts, deliveryDays, isClosed, DEFAULTS } from './operating.js';
export const DAILY_PRICE_CENTS = 1000;
export const DAILY_MAX_QTY = 50;
export const DAILY_GROUP_FREE_DELIVERY_MIN_QTY = 6;
export const DAILY_PREFIX = 'daily_lunch_';
export const isoDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0,10) === s;
const clock = s => typeof s === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
const minute = s => Number(s.slice(0,2))*60+Number(s.slice(3));
export function validateDailyConfig(c) {
  if (!c || !Array.isArray(c.products) || c.products.length > 100 || !Array.isArray(c.dates) || c.dates.length > 370 || !Array.isArray(c.weekdays) || c.weekdays.length > 7) throw Error('Invalid daily lunch configuration.');
  if (!c.settings || !clock(c.settings.same_day_cutoff) || !clock(c.settings.preorder_cutoff)) throw Error('Set valid HH:MM ordering cutoffs.');
  const ids = new Set();
  const products = c.products.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9_]{1,60}$/.test(p.id) || ids.has(p.id)) throw Error('Invalid or duplicate meal ID.');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length>120 || typeof p.description !== 'string' || p.description.length>1000) throw Error('Invalid meal name or description.');
    const image = p.image_url || null;
    if (image !== null && (typeof image !== 'string' || image.length>500 || !/^\/(?!\/)[a-zA-Z0-9_./%-]+$/.test(image) || image.includes('..'))) throw Error('Use an existing local website image path.');
    return {id:p.id,name:p.name.trim(),description:p.description.trim(),image_url:image};
  });
  const seenDates = new Set(), seenDays = new Set();
  const dates = c.dates.map(d => {
    if (!d || !isoDate(d.date) || seenDates.has(d.date) || !ids.has(d.product_id) || typeof d.enabled !== 'boolean' || typeof d.sold_out !== 'boolean') throw Error('Invalid or duplicate scheduled date.');
    seenDates.add(d.date); return {date:d.date,product_id:d.product_id,enabled:d.enabled,sold_out:d.sold_out};
  });
  const weekdays = c.weekdays.map(d => {
    if (!d || !Number.isInteger(d.dow) || d.dow<0 || d.dow>6 || seenDays.has(d.dow) || !ids.has(d.product_id) || typeof d.enabled !== 'boolean') throw Error('Invalid weekday template.');
    seenDays.add(d.dow); return {dow:d.dow,product_id:d.product_id,enabled:d.enabled};
  });
  return {products,dates,weekdays,settings:{same_day_cutoff:c.settings.same_day_cutoff,preorder_cutoff:c.settings.preorder_cutoff}};
}
export async function dailyOperating(env) {
  const r=await env.DB.prepare("SELECT key,value FROM app_settings WHERE key LIKE 'ops.%'").all();
  if(r?.success===false || !Array.isArray(r?.results))throw Error('Operating settings unavailable.');
  const ops={...DEFAULTS};
  for(const row of r.results){const k=String(row.key).replace('ops.','');if(k in ops)ops[k]=row.value;}
  return ops;
}
export async function loadDailyLunch(env) {
  if (!env.DB) throw Error('Daily lunch is temporarily unavailable.');
  const r = await env.DB.prepare('SELECT config_json, version, updated_at, updated_by FROM daily_lunch_config WHERE id=1').first();
  if (!r) throw Error('Daily lunch is not configured.');
  return {config:validateDailyConfig(JSON.parse(r.config_json)),version:r.version,updated_at:r.updated_at,updated_by:r.updated_by};
}
export function dailyFeeCents(env) {
  const raw = env.DELIVERY_FEE_USD;
  const n = raw === undefined || raw === null || raw === '' ? 5 : Number(raw);
  if (!Number.isFinite(n) || n<0 || n>10000) throw Error('Delivery fee is not configured correctly.');
  return Math.round(n*100);
}
export function dailyDay(config, date, ops, now = new Date()) {
  if (!isoDate(date)) return {date,orderable:false,reason:'invalid_date'};
  const et = etDayParts(now), row = config.dates.find(d=>d.date===date), product = row && config.products.find(p=>p.id===row.product_id);
  const out = {date, ...(product||{}),product_id:product?.id || null, price_cents:DAILY_PRICE_CENTS,enabled:!!row?.enabled,sold_out:!!row?.sold_out,orderable:false,free_delivery:false,mode:date===et.date?'on_demand':'scheduled'};
  let reason;
  if (!row || !product || !row.enabled) reason='not_scheduled';
  else if (date<et.date) reason='past';
  else if (!deliveryDays(ops).includes(new Date(date+'T12:00:00Z').getUTCDay()) || isClosed(ops,date)) reason='closed';
  else if (row.sold_out) reason='sold_out';
  else if (date===et.date && et.minutes>=minute(config.settings.same_day_cutoff)) reason='same_day_cutoff';
  else {
    const previous = new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);
    if (date>et.date && previous===et.date && et.minutes>=minute(config.settings.preorder_cutoff)) reason='preorder_cutoff';
  }
  return {...out,reason:reason||null,orderable:!reason,free_delivery:!reason && date>et.date};
}
export const CORPORATE_LUNCH_POLICY = Object.freeze({notice_hours:24,min_qty_per_product:20,max_total_qty:DAILY_MAX_QTY,horizon_days:14,full_payment:true});
export function corporateLunchDay(config,date,ops,now=new Date()) {
  const out={date,orderable:false,free_delivery:true,mode:'scheduled',corporate:true};
  if(!isoDate(date))return {...out,reason:'invalid_date'};
  const today=etDayParts(now).date;
  const last=new Date(Date.parse(today+'T12:00:00Z')+14*86400000).toISOString().slice(0,10);
  const row=config.dates.find(d=>d.date===date);
  const eventAt=cateringEventTimestamp(date,ops.lunch_start);
  let reason=null;
  if(date<=today||date>last)reason='outside_corporate_horizon';
  else if(!deliveryDays(ops).includes(new Date(date+'T12:00:00Z').getUTCDay())||isClosed(ops,date))reason='closed';
  else if(row&&!row.enabled)reason='disabled';
  else if(row?.sold_out)reason='sold_out';
  else if(eventAt===null||!Number.isFinite(now.getTime()))reason='invalid_window';
  else if(eventAt-now.getTime()<CORPORATE_LUNCH_POLICY.notice_hours*3600000)reason='corporate_notice';
  return {...out,orderable:!reason,reason,event_at:eventAt};
}
export async function validateDailyOrder(env, items, date, now = new Date(), corporate = false) {
  if(typeof corporate!=='boolean')throw Error('Invalid corporate ordering option.');
  const {config} = await loadDailyLunch(env), ops = await dailyOperating(env);
  const day = corporate?corporateLunchDay(config,date,ops,now):dailyDay(config,date,ops,now);
  if (!day.orderable) throw Error('This lunch date is unavailable ('+day.reason+'). Please choose an available date.');
  if(corporate){
    if(!Array.isArray(items)||!items.length||items.length>config.products.length)throw Error('Choose valid corporate lunch selections.');
    const seen=new Set();let total=0;
    const products=items.map(item=>{
      const product=config.products.find(p=>DAILY_PREFIX+p.id===item?.id);
      if(!product||seen.has(product.id)||!Number.isInteger(item.qty)||item.qty<CORPORATE_LUNCH_POLICY.min_qty_per_product||item.qty>DAILY_MAX_QTY)throw Error('Corporate lunches require at least 20 of each unique meal, up to 50 total.');
      seen.add(product.id);total+=item.qty;
      return {product_id:product.id,name:product.name,description:product.description,qty:item.qty};
    });
    if(total>DAILY_MAX_QTY)throw Error('Corporate online orders allow up to 50 lunches total. Request a quote for larger orders.');
    return {...day,products,fee_cents:0,ops};
  }
  if (items.length!==1 || items[0]?.id!==DAILY_PREFIX+day.product_id || !Number.isInteger(items[0].qty) || items[0].qty<1 || items[0].qty>DAILY_MAX_QTY) throw Error('Order one daily meal selection for one date, quantity 1–'+DAILY_MAX_QTY+'. Other products require a separate checkout.');
  const freeDelivery = day.free_delivery || items[0].qty >= DAILY_GROUP_FREE_DELIVERY_MIN_QTY;
  return {...day,products:[{product_id:day.product_id,name:day.name,description:day.description,qty:items[0].qty}],free_delivery:freeDelivery,fee_cents:freeDelivery?0:dailyFeeCents(env),ops};
}
