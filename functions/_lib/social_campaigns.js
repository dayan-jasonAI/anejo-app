// Durable organic campaign manifests. No model/provider call or publication occurs here.
// Saved owner review, model acceptance and actual Meta publication remain separate records.
import {SOCIAL_AUDIT_CONTEXT,SOCIAL_AUDIT_SNAPSHOT,SOCIAL_AUDIT_CURRENT} from './social_audit.js';
import {etWallClockMs,etDateOf,addEtDays} from './hub.js';

export const CAMPAIGN_TIMEZONE='America/New_York';
export const MAX_CAMPAIGN_SLOTS=180;
const MAX_IMAGE=5*1024*1024,MAX_VIDEO=25*1024*1024;
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const parse=(v,fallback=null)=>{try{return JSON.parse(v);}catch{return fallback;}};
export const campaignDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');
export class CampaignError extends Error{constructor(code,status=409,details=null){super(code);this.code=code;this.status=status;this.details=details;}}
const fail=(code,status=409,details=null)=>{throw new CampaignError(code,status,details);};
export const validCampaignRequest=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(v);
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):null;
const iso=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
function slotEpoch(date,time){const ms=etWallClockMs(date+'T'+time);if(!Number.isSafeInteger(ms)||etDateOf(ms)!==date)fail('invalid_slot_time',400);const formatted=new Intl.DateTimeFormat('en-GB',{timeZone:CAMPAIGN_TIMEZONE,hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(new Date(ms));if(formatted!==time)fail('invalid_slot_time',400);return ms;}
export function normalizeCampaignManifest({start_date,slots}){
 if(!iso(start_date)||!Array.isArray(slots)||slots.length<1||slots.length>MAX_CAMPAIGN_SLOTS)fail('invalid_campaign_manifest',400);
 const ids=new Set(),posts=new Set(),times=new Set();
 const normalized=slots.map((s,index)=>{
  if(!plain(s)||typeof s.slot_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(s.slot_id)||ids.has(s.slot_id)||!Number.isInteger(s.day_offset)||s.day_offset<0||s.day_offset>29||typeof s.time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.time)||!['feed','story','reel'].includes(s.channel))fail('invalid_campaign_slot',400,{index});
  const post_id=s.post_id==null?null:text(s.post_id,120);if(post_id&&(!/^sp_[A-Za-z0-9_-]+$/.test(post_id)||posts.has(post_id)))fail('duplicate_or_invalid_post',400,{index});
  const date=addEtDays(start_date,s.day_offset),scheduled_at=slotEpoch(date,s.time);if(times.has(scheduled_at))fail('duplicate_slot_time',400,{index});ids.add(s.slot_id);times.add(scheduled_at);if(post_id)posts.add(post_id);
  const cta_url=text(s.cta_url,700);if(cta_url){let url;try{url=new URL(cta_url);}catch{fail('invalid_cta_url',400);}if(url.protocol!=='https:')fail('invalid_cta_url',400);}
  return {slot_id:s.slot_id,day_offset:s.day_offset,date,time:s.time,scheduled_at,channel:s.channel,post_id,objective:text(s.objective,500),creative_angle:text(s.creative_angle,700),offer:text(s.offer,500),cta:text(s.cta,200),cta_url,utm_campaign:text(s.utm_campaign,120),language:text(s.language,40)};
 }).sort((a,b)=>a.scheduled_at-b.scheduled_at||a.slot_id.localeCompare(b.slot_id));
 return {start_date,end_date:addEtDays(start_date,29),timezone:CAMPAIGN_TIMEZONE,slots:normalized};
}
async function readRows(env,sql,...args){const r=await env.DB.prepare(sql).bind(...args).all();if(r?.success===false||!Array.isArray(r?.results))fail('campaign_source_unavailable',503);return r.results;}
export async function campaignSourceSnapshot(env){try{const row=await env.DB.prepare(`SELECT ${SOCIAL_AUDIT_CONTEXT} AS snapshot`).first();if(typeof row?.snapshot!=='string'||!Array.isArray(parse(row.snapshot)))fail('campaign_source_unavailable',503);return row.snapshot;}catch(error){if(error instanceof CampaignError)throw error;fail('campaign_source_unavailable',503);}}
export async function campaignRow(env,id,owner){const r=await env.DB.prepare('SELECT * FROM social_campaign_cycles WHERE id=? AND owner_id=?').bind(id,owner).first();if(!r)fail('campaign_not_found',404);return r;}
const mediaKind=key=>/\.jpe?g$/i.test(key)?'image':/\.(mp4|mov)$/i.test(key)?'video':null;
function assetKey(key){return typeof key==='string'&&/^(studio|marketing-library)\/[A-Za-z0-9_./%-]+\.(jpg|jpeg|mp4|mov)$/i.test(key)&&!key.includes('..')&&!key.includes('%')&&!key.includes('//');}
const warning=async(post_id,code,detail)=>({id:'cw_'+(await campaignDigest([post_id,code,detail])).slice(0,32),post_id,code,detail});
function postReviewSnapshot(row,media){return {post_id:row.id,caption:row.caption||'',media_type:row.media_type||null,revision_snapshot:row.revision_snapshot,audit_signature:JSON.stringify([row.audit_status,row.audit_scope,row.audit_snapshot,row.audit_context_snapshot,row.audit_detail_json,row.audit_flags]),media:media.map(m=>({id:m.id,seq:m.seq,key:m.media_key}))};}
export async function campaignView(env,row,{at=Date.now()}={}){
 const manifest=parse(row.manifest_json);if(!manifest?.slots)fail('campaign_manifest_unavailable',503);
 const source_snapshot=await campaignSourceSnapshot(env);const ids=manifest.slots.map(s=>s.post_id).filter(Boolean);const posts=ids.length?await readRows(env,`SELECT *, ${SOCIAL_AUDIT_SNAPSHOT} AS revision_snapshot, COALESCE(${SOCIAL_AUDIT_CURRENT},0) AS audit_current FROM social_posts WHERE id IN (${ids.map(()=>'?').join(',')})`,...ids):[];
 const byPost=new Map(posts.map(p=>[p.id,p]));const media=ids.length?await readRows(env,`SELECT id,post_id,seq,media_key,created_at FROM social_post_media WHERE post_id IN (${ids.map(()=>'?').join(',')}) ORDER BY post_id,seq,created_at,id`,...ids):[];
 const byMedia=new Map();for(const m of media){if(!byMedia.has(m.post_id))byMedia.set(m.post_id,[]);byMedia.get(m.post_id).push(m);}
 const blockers=[],warnings=[],slots=[],snapshots=[];const days=new Set(manifest.slots.map(s=>s.day_offset));if(days.size!==30)blockers.push({code:'missing_campaign_days',detail:'Every one of the 30 campaign days needs at least one slot.',missing_days:Array.from({length:30},(_,i)=>i).filter(i=>!days.has(i))});
 const collisions=await readRows(env,"SELECT id,scheduled_at FROM social_posts WHERE status IN ('scheduled','publishing') AND scheduled_at>=? AND scheduled_at<=?",manifest.slots[0].scheduled_at,manifest.slots.at(-1).scheduled_at);
 for(const slot of manifest.slots){
  const p=slot.post_id?byPost.get(slot.post_id):null;const list=p?(byMedia.get(p.id)||[]):[];const local=[];
  if(!slot.post_id)local.push({code:'missing_post',detail:'This slot has no saved draft.'});else if(!p)local.push({code:'post_not_found',detail:'The saved draft no longer exists.'});
  if(p){
   if(!['draft','failed'].includes(p.status)&&!(row.state==='scheduled'&&p.campaign_review_id===row.active_review_id))local.push({code:'post_not_editable',detail:'This post is not an unscheduled draft.'});
   if(p.campaign_review_id&&p.campaign_review_id!==row.active_review_id)local.push({code:'post_has_other_review',detail:'This post belongs to another campaign review.'});
   if(!String(p.caption||'').trim())local.push({code:'missing_caption',detail:'The saved post has no caption.'});
   if(!list.length)local.push({code:'missing_media',detail:'Attach the finished media before review.'});
   if(new Set(list.map(m=>m.seq)).size!==list.length)local.push({code:'ambiguous_media_order',detail:'Saved slides have duplicate sequence numbers.'});
   const expected=slot.channel==='reel'?'REELS':slot.channel==='story'?'STORIES':null;
   if(expected?p.media_type!==expected:['REELS','STORIES'].includes(p.media_type))local.push({code:'channel_mismatch',detail:'The saved post type differs from its campaign slot.'});
   if(list.some(m=>!assetKey(m.media_key)))local.push({code:'unsupported_media_key',detail:'Only saved marketing JPEG or MP4/MOV media can be reviewed.'});
   if(slot.channel==='feed'&&list.some(m=>mediaKind(m.media_key)!=='image'))local.push({code:'feed_requires_photos',detail:'Feed carousel slots must contain JPEG photos.'});
   if(slot.channel==='reel'&&(list.length!==1||mediaKind(list[0]?.media_key)!=='video'))local.push({code:'reel_requires_video',detail:'A Reel must have one MP4/MOV video.'});
   if(slot.channel==='story'&&list.length!==1)local.push({code:'story_requires_one_asset',detail:'A Story requires exactly one image or video.'});
   if(p.ig_media_id||p.published_at)local.push({code:'already_published',detail:'An existing public post cannot be republished through this cycle.'});
   if(!p.audit_current||p.audit_status!=='pass'||p.audit_scope!=='caption_and_media')warnings.push(await warning(p.id,'audit_not_current_pass','The saved draft does not have a current passing image-and-caption audit. Owner review cannot be represented as a model pass.'));
   for(const f of parse(p.audit_flags,[])||[]){if(typeof f?.detail==='string')warnings.push(await warning(p.id,String(f.type||'audit_warning'),f.detail.slice(0,1600)));}
   if(list.some(m=>mediaKind(m.media_key)==='video'))warnings.push(await warning(p.id,'video_manual_review_required','The image auditor cannot inspect this video. The owner must watch the exact video, including wording and audio, before approval.'));
   snapshots.push(postReviewSnapshot(p,list));
  }
  if(slot.scheduled_at<=at&&row.state!=='scheduled')local.push({code:'slot_time_passed',detail:'Choose a future publishing time.'});
  if(collisions.some(c=>c.scheduled_at===slot.scheduled_at&&c.id!==slot.post_id))local.push({code:'slot_collision',detail:'Another scheduled post already occupies this minute.'});
  for(const b of local)blockers.push({...b,slot_id:slot.slot_id,post_id:slot.post_id});
  slots.push({...slot,caption:p?.caption||null,media_type:p?.media_type||null,post_status:p?.status||null,audit_status:p?.audit_status||null,audit_current:Boolean(p?.audit_current),audit_at:p?.audit_at||null,ready:local.length===0,blockers:local,media:list.map(m=>({id:m.id,seq:m.seq,key:m.media_key,kind:mediaKind(m.media_key),preview_url:'/api/hub/media/'+m.media_key}))});
 }
 const base={campaign_id:row.id,campaign_version:row.version,title:row.title,manifest,source_snapshot,posts:snapshots};const base_hash=await campaignDigest(base);const saved=parse(row.validation_json);const valid=saved?.base_hash===base_hash;const validation=valid?saved:{state:saved?'stale':'pending',cursor:0,total:media.length,errors:[],base_hash,receipts:{}};
 const receipts=validation.receipts||{};for(const slot of slots)for(const item of slot.media){const receipt=receipts[item.id];if(receipt?.ok){item.sha256=receipt.sha256;item.byte_length=receipt.byte_length;}}
 const complete=valid&&validation.state==='complete'&&media.length>0&&media.every(m=>receipts[m.id]?.ok);
 const manifest_hash=await campaignDigest({...base,media_receipts:media.map(m=>receipts[m.id]||null)});
 let approval=null;if(row.active_review_id){const r=await env.DB.prepare('SELECT id,owner_id,approved_at,review_mode,manifest_hash FROM social_campaign_reviews WHERE id=? AND campaign_id=?').bind(row.active_review_id,row.id).first();if(r)approval={id:r.id,owner_id:r.owner_id,approved_at:r.approved_at,review_mode:r.review_mode,approved_manifest_hash:r.manifest_hash,scope:'exact_manifest_only'};}
 return {ok:true,campaign:{id:row.id,title:row.title,start_date:row.start_date,end_date:row.end_date,timezone:row.timezone,version:row.version,state:row.state,slot_count:manifest.slots.length,validation:{state:validation.state,cursor:validation.cursor,total:validation.total,errors:validation.errors||[],checked_at:validation.checked_at||null},generation_config:parse(row.generation_config_json,{enabled:false}),approval},posts:slots,readiness:{counts:{slots:slots.length,filled:slots.filter(s=>s.post_id).length,ready:slots.filter(s=>s.ready).length,blocked:slots.filter(s=>!s.ready).length},blockers,warnings,validation_complete:complete,strict_ready:!blockers.length&&complete&&!warnings.length,owner_review_ready:!blockers.length&&complete,scope:'saved_source_readback; asset validation receipt is rechecked before scheduling'},manifest_hash,_base:base,_base_hash:base_hash,_validation:validation};
}
export function publicCampaignView(view){const {_base,_base_hash,_validation,...out}=view;return out;}
async function fingerprint(env,key){
 if(!env.MEDIA||!assetKey(key))fail('campaign_media_unavailable',503);const object=await env.MEDIA.get(key);if(!object)fail('campaign_media_missing',409);
 const kind=mediaKind(key),max=kind==='video'?MAX_VIDEO:MAX_IMAGE;if(!Number.isSafeInteger(object.size)||object.size<4||object.size>max)fail('campaign_media_size_invalid',409,{maximum_bytes:max});
 const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==object.size)fail('campaign_media_read_incomplete',503);
 if(kind==='image'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))fail('campaign_image_not_jpeg',409);
 if(kind==='video'&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')fail('campaign_video_header_invalid',409);
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return {ok:true,key,kind,sha256,byte_length:bytes.length,etag:object.etag||null,content_type:object.httpMetadata?.contentType||null};
}
async function receiptMatches(env,receipt,{bytes=false}={}){
 if(!receipt?.ok)fail('campaign_media_not_validated');
 if(!bytes&&receipt.etag&&typeof env.MEDIA?.head==='function'){const object=await env.MEDIA.head(receipt.key);if(!object||object.etag!==receipt.etag||object.size!==receipt.byte_length||(object.httpMetadata?.contentType||null)!==receipt.content_type)fail('campaign_media_changed');return;}
 const actual=await fingerprint(env,receipt.key);if(actual.sha256!==receipt.sha256||actual.byte_length!==receipt.byte_length)fail('campaign_media_changed');
}
export async function validateCampaignMedia(env,row){
 if(!['draft','paused'].includes(row.state))fail('campaign_not_in_review');const view=await campaignView(env,row);let cache=view._validation;
 if(parse(row.validation_json)?.base_hash&&parse(row.validation_json).base_hash!==view._base_hash){const reset={state:'pending',cursor:0,total:view.posts.reduce((n,p)=>n+p.media.length,0),errors:[],receipts:{},base_hash:view._base_hash};const r=await env.DB.prepare('UPDATE social_campaign_cycles SET validation_json=?,updated_at=? WHERE id=? AND owner_id=? AND version=? AND validation_json IS ?').bind(JSON.stringify(reset),Date.now(),row.id,row.owner_id,row.version,row.validation_json).run();if(r.meta?.changes!==1)fail('campaign_changed');fail('campaign_validation_stale',409);}
 const media=view.posts.flatMap(p=>p.media);const receipts={...(cache.receipts||{})};const pending=media.filter(m=>!receipts[m.id]?.ok).slice(0,3);
 for(const m of pending){try{receipts[m.id]={id:m.id,...await fingerprint(env,m.key)};}catch(error){receipts[m.id]={id:m.id,key:m.key,ok:false,error:error instanceof CampaignError?error.code:'campaign_media_read_failed'};}}
 const errors=media.filter(m=>receipts[m.id]?.ok===false).map(m=>({media_id:m.id,post_id:view.posts.find(p=>p.media.some(a=>a.id===m.id))?.post_id,error:receipts[m.id].error}));const cursor=media.filter(m=>receipts[m.id]).length;const next={base_hash:view._base_hash,state:cursor<media.length?'in_progress':errors.length?'failed':'complete',cursor,total:media.length,errors,receipts,checked_at:Date.now()};
 const current=await campaignSourceSnapshot(env);if(current!==view._base.source_snapshot)fail('campaign_sources_changed');
 const changed=await env.DB.prepare('UPDATE social_campaign_cycles SET validation_json=?,updated_at=? WHERE id=? AND owner_id=? AND version=? AND validation_json IS ?').bind(JSON.stringify(next),Date.now(),row.id,row.owner_id,row.version,row.validation_json).run();if(changed.meta?.changes!==1)fail('campaign_changed');
 return campaignView(env,await campaignRow(env,row.id,row.owner_id));
}
