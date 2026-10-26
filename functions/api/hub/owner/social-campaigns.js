// Owner-private organic editorial cycles. Creating/validating is not public approval.
import {requireRole} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {setCampaignGeneration,generateCampaignSlot} from '../../../_lib/social_campaign_generation.js';
import {CampaignError,campaignRow,campaignView,publicCampaignView,createCampaign,updateCampaign,importCampaignPosts,validateCampaignMedia,approveCampaignSchedule,pauseCampaign,nextCampaignCycle} from '../../../_lib/social_campaigns.js';
const replyError=error=>json({ok:false,error:error instanceof CampaignError?error.code:'campaign_operation_unavailable',review_required:true,...(error instanceof CampaignError&&error.details?{details:error.details}:{})},error instanceof CampaignError?error.status:503);
async function context(request,env){const owner=await requireRole(request,env,['owner']);if(owner instanceof Response)return owner;if(!env.DB||!owner.distinct_id)return json({ok:false,error:'campaign_owner_context_unavailable'},503);return owner;}
export async function onRequestGet({request,env}){
 const owner=await context(request,env);if(owner instanceof Response)return owner;
 try{const q=new URL(request.url).searchParams;if([...q.keys()].some(k=>k!=='id'))throw new CampaignError('invalid_query',400);
 if(q.has('id'))return json(publicCampaignView(await campaignView(env,await campaignRow(env,q.get('id'),owner.distinct_id))));
 const rows=await env.DB.prepare('SELECT id,title,start_date,end_date,timezone,version,state,manifest_json,validation_json,created_at,updated_at FROM social_campaign_cycles WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(owner.distinct_id).all();if(rows?.success===false||!Array.isArray(rows?.results))throw Error();
 return json({ok:true,campaigns:rows.results.map(({manifest_json,validation_json,...row})=>{const manifest=JSON.parse(manifest_json),validation=validation_json?JSON.parse(validation_json):null;return {...row,slot_count:manifest.slots.length,filled_slots:manifest.slots.filter(s=>s.post_id).length,validation:validation?{state:validation.state,cursor:validation.cursor,total:validation.total,checked_at:validation.checked_at}:null,readiness:'open_for_current_readback'};})});
 }catch(error){return replyError(error);}
}
async function bodyJson(request){if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw new CampaignError('json_required',415);const reader=request.body?.getReader();if(!reader)throw new CampaignError('invalid_json',400);let size=0,text='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512*1024){await reader.cancel();throw new CampaignError('request_too_large',413);}text+=decoder.decode(value,{stream:true});}try{return JSON.parse(text+decoder.decode());}catch{throw new CampaignError('invalid_json',400);}}
export async function onRequestPost({request,env}){
 const owner=await context(request,env);if(owner instanceof Response)return owner;
 try{const b=await bodyJson(request);if(!b||typeof b!=='object'||Array.isArray(b))throw new CampaignError('invalid_request',400);const who=owner.distinct_id;let result;
 if(b.op==='create')result=await createCampaign(env,who,b);
 else if(b.op==='update')result=await updateCampaign(env,who,b);
 else if(b.op==='import_posts')result=await importCampaignPosts(env,who,b);
 else if(b.op==='validate'){const row=await campaignRow(env,b.id,who);if(row.version!==b.expected_version)throw new CampaignError('campaign_version_changed');result=publicCampaignView(await validateCampaignMedia(env,row));}
 else if(b.op==='approve_schedule')result=await approveCampaignSchedule(env,who,b);
 else if(b.op==='pause')result=await pauseCampaign(env,who,b);
 else if(b.op==='next_cycle')result=await nextCampaignCycle(env,who,b);
 else if(b.op==='set_generation')result=await setCampaignGeneration(env,who,b);
 else if(b.op==='generate_slot')result=await generateCampaignSlot(env,who,b);
 else throw new CampaignError('unknown_operation',400);
 return json(result);
 }catch(error){return replyError(error);}
}
