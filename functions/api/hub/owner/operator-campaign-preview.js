// Owner-private proposal storage only. Never invokes an action executor or retries inference.
import {requireRole} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {leadReply,validateCampaignProposal} from '../../../_lib/team_lead.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const keyFor=async(owner,key)=>'ocp_'+await digest(JSON.stringify([owner,key.toLowerCase()]));
const failure=(error,status=503)=>json({ok:false,error,review_required:true},status);
const safeErrors=new Set(['no_api_key','budget','budget_unavailable','model_error','empty_response','invalid_proposal','input_receipt_unavailable','grounding_unavailable','generation_failed','incomplete_preview_response','invalid_preview_response','invalid_preview_request','invalid_mode']);
function boundedJson(value,max){const text=JSON.stringify(value);if(!text||new TextEncoder().encode(text).length>max)throw Error('result_too_large');return text;}
function projection(row){
 const base={id:row.id,request_id:row.request_id,idea_id:row.idea_id,state:row.state,created_at:row.created_at,updated_at:row.updated_at,review_required:true,private:true,generated:row.state==='succeeded'};
 if(row.state==='succeeded')return {...base,proposal:JSON.parse(row.proposal_json),source_receipts:JSON.parse(row.source_receipts_json),model:row.model};
 if(row.state==='failed')return {...base,error:row.error_code,source_receipts:row.source_receipts_json?JSON.parse(row.source_receipts_json):null,model:row.model};
 return {...base,outcome_unknown:Date.now()-row.updated_at>10*60*1000,detail:'Generation was claimed. Do not create another request to retry an uncertain provider outcome.'};
}
function result(row){return json({ok:row.state!=='failed',saved:row.state==='succeeded',preview:projection(row)},row.state==='generating'?202:200);}
async function readRow(env,id,owner){return env.DB.prepare('SELECT * FROM operator_campaign_previews WHERE id=? AND owner_id=?').bind(id,owner).first();}
// Injectable generator is a test seam, never a request/body or environment capability.
export async function createCampaignPreview(env,owner,b,generate=leadReply){
 const id=await keyFor(owner,b.request_id);let row;
 try{
 row=await readRow(env,id,owner);
 if(row){if(row.idea_id!==b.idea_id)return failure('request_key_conflict',409);return result(row);}
 const idea=await env.DB.prepare('SELECT id,objective FROM operator_brief_ideas WHERE id=? AND created_by=?').bind(b.idea_id,owner).first();
 if(!idea)return failure('idea_not_found',404);
 if(typeof idea.objective!=='string'||!idea.objective.trim()||idea.objective.length>1000)return failure('saved_idea_invalid',409);
 const at=Date.now(),hash=await digest(idea.objective);
 const claim=await env.DB.prepare("INSERT INTO operator_campaign_previews(id,owner_id,request_id,idea_id,topic,topic_sha256,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'generating',?,?) ON CONFLICT(owner_id,request_id) DO NOTHING").bind(id,owner,b.request_id.toLowerCase(),idea.id,idea.objective,hash,at,at).run();
 if(claim.meta?.changes!==1){row=await readRow(env,id,owner);if(!row)return failure('claim_not_verified');if(row.idea_id!==b.idea_id)return failure('request_key_conflict',409);return result(row);}
 let generated;try{generated=await generate(env,{message:idea.objective,history:[],mode:'private_campaign_preview'});}catch{generated={ok:false,reason:'generation_failed'};}
 let proposal=null,receipts=null,error=null;
 try{
 receipts=boundedJson({input_context:generated.input_context??null,inference_receipt:generated.inference_receipt??null,inference_attempts:generated.inference_attempts??null},65536);
 if(!generated.ok)error=safeErrors.has(generated.reason)?generated.reason:'generation_failed';
 else if(generated.action!==null||!Array.isArray(generated.actions)||generated.actions.length||generated.review_required!==true||!Array.isArray(generated.input_context?.available_product_ids)||!validateCampaignProposal(generated.proposal,generated.input_context.available_product_ids))error='invalid_proposal';
 else proposal=boundedJson(generated.proposal,32768);
 }catch{error='invalid_proposal';proposal=null;receipts=null;}
 const state=error?'failed':'succeeded';
 const update=await env.DB.prepare("UPDATE operator_campaign_previews SET state=?,proposal_json=?,source_receipts_json=?,model=?,error_code=?,updated_at=? WHERE id=? AND owner_id=? AND state='generating'").bind(state,proposal,receipts,typeof generated.model==='string'?generated.model.slice(0,100):null,error,Date.now(),id,owner).run();
 if(update.meta?.changes!==1)return failure('generation_save_not_verified');
 row=await readRow(env,id,owner);if(!row)return failure('generation_save_not_verified');return result(row);
 }catch{return failure('generation_state_unavailable');}
}
async function ownerContext(request,env){const owner=await requireRole(request,env,['owner']);return owner instanceof Response?owner:owner.distinct_id?owner:failure('owner_identity_unavailable',403);}
export async function onRequestPost({request,env}){
 const owner=await ownerContext(request,env);if(owner instanceof Response)return owner;
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return failure('json_required',415);
 let body;try{const reader=request.body?.getReader();if(!reader)throw Error();let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return failure('request_too_large',413);}text+=decoder.decode(value,{stream:true});}body=JSON.parse(text+decoder.decode());}catch{return failure('invalid_json',400);}
 if(!body||Array.isArray(body)||Object.keys(body).length!==2||!uuid(body.request_id)||typeof body.idea_id!=='string'||!/^obi_[a-f0-9]{64}$/.test(body.idea_id))return failure('invalid_preview_request',400);
 return createCampaignPreview(env,owner.distinct_id,body);
}
export async function onRequestGet({request,env}){
 const owner=await ownerContext(request,env);if(owner instanceof Response)return owner;
 const q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>!['id','request_id','idea_id'].includes(k))||[...q.keys()].length>1)return failure('invalid_query',400);
 try{
 if(q.has('id')||q.has('request_id')){
  if(q.has('request_id')&&!uuid(q.get('request_id')))return failure('invalid_query',400);
  const id=q.has('id')?q.get('id'):await keyFor(owner.distinct_id,q.get('request_id'));
  if(!/^ocp_[a-f0-9]{64}$/.test(id))return failure('invalid_query',400);
  const row=await readRow(env,id,owner.distinct_id);return row?result(row):failure('preview_not_found',404);
 }
 if(q.has('idea_id')&&!/^obi_[a-f0-9]{64}$/.test(q.get('idea_id')))return failure('invalid_query',400);
 const rows=await env.DB.prepare('SELECT * FROM operator_campaign_previews WHERE owner_id=?'+(q.has('idea_id')?' AND idea_id=?':'')+' ORDER BY created_at DESC,id DESC LIMIT 20').bind(...(q.has('idea_id')?[owner.distinct_id,q.get('idea_id')]:[owner.distinct_id])).all();
 if(rows?.success===false||!Array.isArray(rows?.results))throw Error();
 return json({ok:true,limit:20,review_required:true,previews:rows.results.map(projection)});
 }catch{return failure('preview_read_unavailable');}
}
