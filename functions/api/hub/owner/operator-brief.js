// Deterministic private idea capture. No model, strategy generation, or action execution.
import { requireRole } from '../../../_lib/roles.js';
import { json } from '../../../_lib/util.js';
const validKey = key => typeof key === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key);
async function briefId(owner, key) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([owner,key.toLowerCase()])));
  return 'obi_' + [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function receipt(row) {
  return { ok:true, saved:true, kind:'owner_supplied_draft_idea', generated:false,
    brief:{id:row.id,title:row.title,topic:row.objective,status:row.status,created_at:row.created_at} };
}
export async function onRequestPost({request,env}) {
  const owner = await requireRole(request,env,['owner']);
  if(owner instanceof Response)return owner;
  if(!owner.distinct_id)return json({ok:false,error:'owner_identity_unavailable'},403);
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return json({ok:false,error:'json_required'},415);
  let body;try {body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['request_id','topic'].includes(k)) || !validKey(body.request_id) || typeof body.topic!=='string' || !body.topic.trim() || body.topic.length>1000)return json({ok:false,error:'invalid_brief_request'},400);
  const id=await briefId(owner.distinct_id,body.request_id), by=owner.distinct_id;
  const title='Owner-supplied draft idea: '+body.topic.slice(0,160), at=Date.now();
  try {
    await env.DB.prepare(`INSERT INTO operator_brief_ideas (id,title,objective,status,created_by,created_at,updated_at) VALUES (?,?,?,'draft',?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,title,body.topic,by,at,at).run();
    const row=await env.DB.prepare('SELECT id,title,objective,status,created_by,created_at FROM operator_brief_ideas WHERE id=? AND created_by=?').bind(id,by).first();
    if(!row)return json({ok:false,saved:false,error:'save_not_verified'},503);
    if(row.objective!==body.topic || row.title!==title)return json({ok:false,saved:false,error:'request_key_conflict'},409);
    return json(receipt(row));
  }catch{return json({ok:false,saved:false,error:'save_not_verified',detail:'Save could not be verified. Retry the same request key; no model or public action was run.'},503);}
}

export async function onRequestGet({request,env}) {
  const owner=await requireRole(request,env,['owner']);
  if(owner instanceof Response)return owner;
  if(!owner.distinct_id)return json({ok:false,error:'owner_identity_unavailable'},403);
  try {
    const result=await env.DB.prepare('SELECT id,title,objective,status,created_at FROM operator_brief_ideas WHERE created_by=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(owner.distinct_id).all();
    if(result?.success===false || !Array.isArray(result?.results))throw Error('unavailable');
    return json({ok:true,kind:'owner_supplied_draft_ideas',generated:false,limit:20,ideas:result.results.map(row=>receipt(row).brief)});
  }catch{return json({ok:false,error:'saved_ideas_unavailable'},503);}
}
