import { json,bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { loadDailyLunch,validateDailyConfig } from '../../../_lib/daily_lunch.js';
export const onRequestGet=async({request,env})=>{
  const ctx=await requireRole(request,env,['owner']); if(ctx instanceof Response)return ctx;
  try{return json({ok:true,...await loadDailyLunch(env)},200,{'Cache-Control':'no-store'});}catch{return bad('Daily lunch storage unavailable.',503);}
};
export const onRequestPost=async({request,env})=>{
  const ctx=await requireRole(request,env,['owner']); if(ctx instanceof Response)return ctx;
  let b, config;
  try { const text=await request.text(); if(text.length>200000)return bad('Configuration too large.',413); b=JSON.parse(text); config=validateDailyConfig(b.config); if(!Number.isInteger(b.version)||b.version<1)throw Error('Invalid version.'); }catch(e){return bad(e.message||'Invalid configuration.');}
  try {
    const result=await env.DB.prepare('UPDATE daily_lunch_config SET config_json=?, version=version+1, updated_at=?, updated_by=? WHERE id=1 AND version=?').bind(JSON.stringify(config),Date.now(),ctx.email||ctx.distinct_id||'owner',b.version).run();
    if(!result?.meta?.changes)return bad('Menu changed. Reload before saving.',409);
    return json({ok:true,version:b.version+1,config},200,{'Cache-Control':'no-store'});
  }catch{return bad('Could not save daily lunch menu.',503);}
};
