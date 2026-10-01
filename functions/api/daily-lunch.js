import { json, bad } from '../_lib/util.js';
import { etDayParts } from '../_lib/operating.js';
import { loadDailyLunch, dailyDay, dailyFeeCents, isoDate, dailyOperating, DAILY_GROUP_FREE_DELIVERY_MIN_QTY } from '../_lib/daily_lunch.js';
export const onRequestGet = async ({request,env}) => {
  try {
    const {config,version}=await loadDailyLunch(env), ops=await dailyOperating(env), today=etDayParts().date;
    const weekday=new Date(today+'T12:00:00Z').getUTCDay();
    const monday=new Date(Date.parse(today+'T12:00:00Z')-((weekday+6)%7)*86400000).toISOString().slice(0,10);
    const start=new URL(request.url).searchParams.get('start')||monday;
    if (!isoDate(start)) return bad('Invalid start date.');
    const days=Array.from({length:7},(_,i)=>dailyDay(config,new Date(Date.parse(start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),ops));
    return json({ok:true,today,version,price_cents:1000,delivery_fee_cents:dailyFeeCents(env),group_free_delivery_min_qty:DAILY_GROUP_FREE_DELIVERY_MIN_QTY,settings:config.settings,days,windows:{lunch_start:ops.lunch_start,lunch_end:ops.lunch_end},area_label:ops.area_label,availability_basis:'Manual availability checked when checkout is created; not a stock reservation.'},200,{'Cache-Control':'no-store'});
  } catch { return bad('Daily lunch is temporarily unavailable. Please try again later.',503); }
};
