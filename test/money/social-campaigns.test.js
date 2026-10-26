import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv} from '../helpers/sqlite-d1.js';
import {createCampaign,campaignRow,campaignView,validateCampaignMedia,approveCampaignSchedule,pauseCampaign,updateCampaign,importCampaignPosts,nextCampaignCycle,verifyCampaignPostReview,normalizeCampaignManifest,CampaignError} from '../../functions/_lib/social_campaigns.js';
import {SOCIAL_AUDIT_CURRENT,SOCIAL_AUDIT_CONTEXT,SOCIAL_AUDIT_SNAPSHOT} from '../../functions/_lib/social_audit.js';
import {VERSION} from '../../functions/_lib/visual_audit_rubric.js';
const owner='stf_owner';const jpeg=new Uint8Array([255,216,255,217]);
function fixture({empty=false,video=false}={}){
 const env=ownerEnv();const objects=new Map();env.MEDIA={async get(key){const data=objects.get(key);return data?{size:data.length,etag:Buffer.from(data).toString('hex'),httpMetadata:{contentType:/mp4$/.test(key)?'video/mp4':'image/jpeg'},arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}:null;},async head(key){const obj=await this.get(key);return obj?{size:obj.size,etag:obj.etag,httpMetadata:obj.httpMetadata}:null;}};
 const slots=Array.from({length:30},(_,day_offset)=>{const post_id='sp_test_'+day_offset,key='marketing-library/day'+day_offset+'.'+(video&&day_offset===0?'mp4':'jpg');if(!empty){env.DB.sqlite.prepare('INSERT INTO social_posts(id,status,caption,media_key,media_type,public_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(post_id,'draft','Saved caption '+day_offset,key,video&&day_offset===0?'REELS':null,'token-'+day_offset,1,1);env.DB.sqlite.prepare('INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES(?,?,?,?,?,?)').run('sm_'+day_offset,post_id,0,key,'public-token-'+day_offset,1);}
 objects.set(key,video&&day_offset===0?new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]):jpeg);return {slot_id:'day-'+day_offset,day_offset,time:'11:00',channel:video&&day_offset===0?'reel':'feed',post_id:empty?null:post_id,objective:'Sell lunch',creative_angle:'Food hero',cta:'Order',cta_url:'https://anejocateringco.com/order',language:'en'};});
 return {env,objects,request:{request_id:'campaign-create-test-01',title:'Organic 30 days',start_date:'2027-01-05',slots}};
}
async function ready(f){let view=await createCampaign(f.env,owner,f.request);for(let i=0;i<20&&!view.readiness.validation_complete;i++)view=await validateCampaignMedia(f.env,await campaignRow(f.env,view.campaign.id,owner));assert.equal(view.readiness.validation_complete,true);return view;}
function approval(view,request_id='approval-request-test-01'){return {id:view.campaign.id,expected_version:view.campaign.version,expected_manifest_hash:view.manifest_hash,request_id,review_mode:'owner_reviewed_with_warnings',acknowledge_exact_preview:true,acknowledged_warning_ids:view.readiness.warnings.map(w=>w.id)};}
function markPass(env){env.DB.exec(`UPDATE social_posts SET audit_status='pass',audit_scope='caption_and_media',audit_flags='[]',audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT},audit_context_snapshot=${SOCIAL_AUDIT_CONTEXT},audit_detail_json='{"rubric_version":"${VERSION}"}'`);}

test('manifest time conversion survives November DST and bounds days, caps and duplicate slots',()=>{
 const slots=[{slot_id:'a',day_offset:0,time:'11:00',channel:'feed',post_id:null}];const m=normalizeCampaignManifest({start_date:'2026-11-01',slots});assert.equal(new Date(m.slots[0].scheduled_at).toISOString(),'2026-11-01T16:00:00.000Z');
 assert.throws(()=>normalizeCampaignManifest({start_date:'2026-02-30',slots}),CampaignError);assert.throws(()=>normalizeCampaignManifest({start_date:'2026-11-01',slots:[slots[0],slots[0]]}),CampaignError);
});
test('creation and bounded validation do not schedule; same-key create replays and missing days stay blocked',async()=>{
 const f=fixture();try{let v=await createCampaign(f.env,owner,f.request);assert.equal(v.campaign.state,'draft');assert.equal(v.readiness.validation_complete,false);assert.equal(f.env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='scheduled'").n,0);const same=await createCampaign(f.env,owner,f.request);assert.equal(same.campaign.id,v.campaign.id);assert.equal(same.operation.replayed,true);
 v=await validateCampaignMedia(f.env,await campaignRow(f.env,v.campaign.id,owner));assert.equal(v.campaign.validation.cursor,3);assert.equal(v.campaign.validation.total,30);assert.equal(v.readiness.owner_review_ready,false);
 const few=fixture();try{few.request.request_id='few-day-create-test-01';few.request.slots=few.request.slots.slice(0,2);const x=await createCampaign(few.env,owner,few.request);assert.ok(x.readiness.blockers.some(b=>b.code==='missing_campaign_days'));}finally{few.env.DB.sqlite.close();}
 }finally{f.env.DB.sqlite.close();}
});
test('warning review requires exact acknowledgements; separate receipt schedules once without fabricating an audit pass',async()=>{
 const f=fixture();try{const v=await ready(f);const b=approval(v);await assert.rejects(()=>approveCampaignSchedule(f.env,owner,{...b,acknowledged_warning_ids:[]}),e=>e.code==='acknowledge_all_current_warnings');await assert.rejects(()=>approveCampaignSchedule(f.env,owner,{...b,review_mode:'automated_pass',acknowledged_warning_ids:[]}),e=>e.code==='campaign_has_unresolved_warnings');
 const scheduled=await approveCampaignSchedule(f.env,owner,b);assert.equal(scheduled.operation.scheduled,30);assert.equal(scheduled.campaign.approval.review_mode,'owner_reviewed_with_warnings');assert.equal(f.env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='scheduled'").n,30);assert.equal(f.env.DB.one('SELECT audit_status FROM social_posts LIMIT 1').audit_status,null);assert.equal(f.env.DB.one('SELECT COUNT(*) n FROM social_campaign_reviews').n,1);
 const replay=await approveCampaignSchedule(f.env,owner,b);assert.equal(replay.operation.replayed,true);assert.equal(f.env.DB.one('SELECT COUNT(*) n FROM social_campaign_reviews').n,1);
 await assert.rejects(()=>approveCampaignSchedule(f.env,owner,{...b,review_mode:'automated_pass'}),e=>e.code==='request_key_conflict');
 }finally{f.env.DB.sqlite.close();}
});
test('strict mode schedules only current passing audits and ties publisher to source and exact byte receipt',async()=>{
 const f=fixture();try{markPass(f.env);const v=await ready(f);assert.equal(v.readiness.warnings.length,0);const b={...approval(v),review_mode:'automated_pass',acknowledged_warning_ids:[]};const out=await approveCampaignSchedule(f.env,owner,b);const review=out.campaign.approval.id;
 assert.equal((await verifyCampaignPostReview(f.env,'sp_test_0',review)).ok,true);f.objects.set('marketing-library/day0.jpg',new Uint8Array([255,216,255,0]));assert.equal((await verifyCampaignPostReview(f.env,'sp_test_0',review)).ok,false);f.objects.set('marketing-library/day0.jpg',jpeg);
 f.env.DB.exec("UPDATE daily_lunch_config SET version=version+1");assert.equal((await verifyCampaignPostReview(f.env,'sp_test_0',review)).ok,false);
 }finally{f.env.DB.sqlite.close();}
});
test('a source or media change after preview blocks the whole batch and leaves every post unscheduled',async()=>{
 for(const source of [true,false]){const f=fixture();try{const v=await ready(f);const b=approval(v);if(source)f.env.DB.exec('UPDATE daily_lunch_config SET version=version+1');else f.objects.set('marketing-library/day0.jpg',new Uint8Array([255,216,255,0]));await assert.rejects(()=>approveCampaignSchedule(f.env,owner,b),CampaignError);assert.equal(f.env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='scheduled'").n,0);assert.equal(f.env.DB.one('SELECT COUNT(*) n FROM social_campaign_reviews').n,0);}finally{f.env.DB.sqlite.close();}}
});
test('pause cancels only campaign-owned unsent work and never alters an already published post',async()=>{
 const f=fixture();try{const v=await ready(f);const scheduled=await approveCampaignSchedule(f.env,owner,approval(v));f.env.DB.exec("UPDATE social_posts SET status='published',ig_media_id='public-media',published_at=1 WHERE id='sp_test_0'");const out=await pauseCampaign(f.env,owner,{id:v.campaign.id,expected_version:v.campaign.version,request_id:'pause-campaign-test-01'});assert.equal(out.operation.unscheduled,29);assert.equal(f.env.DB.one("SELECT status FROM social_posts WHERE id='sp_test_0'").status,'published');assert.equal(f.env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='scheduled'").n,0);assert.equal((await verifyCampaignPostReview(f.env,'sp_test_1',scheduled.campaign.approval.id)).ok,false);
 }finally{f.env.DB.sqlite.close();}
});
test('video slot remains a manual-watch warning, validates bytes and uses a separate owner receipt',async()=>{
 const f=fixture({video:true});try{const v=await ready(f);assert.ok(v.readiness.warnings.some(w=>w.code==='video_manual_review_required'));assert.equal(v.posts[0].media[0].kind,'video');assert.equal(v.posts[0].media[0].content_type,'video/mp4');const out=await approveCampaignSchedule(f.env,owner,approval(v));assert.equal((await verifyCampaignPostReview(f.env,'sp_test_0',out.campaign.approval.id)).ok,true);f.objects.set('marketing-library/day0.mp4',new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,110]));assert.equal((await verifyCampaignPostReview(f.env,'sp_test_0',out.campaign.approval.id)).ok,false);}finally{f.env.DB.sqlite.close();}
});
test('bulk import is idempotent, versioned, grouped and draft only; next cycle clears content and approvals',async()=>{
 const f=fixture({empty:true});try{const v=await createCampaign(f.env,owner,f.request);const b={id:v.campaign.id,expected_version:v.campaign.version,request_id:'import-campaign-test-01',posts:[{slot_id:'day-0',caption:'Imported actual words',media_keys:['marketing-library/day0.jpg'],media_type:null}]};const r=await importCampaignPosts(f.env,owner,b);assert.equal(r.campaign.version,2);assert.ok(r.posts[0].post_id);assert.equal(r.posts[0].post_status,'draft');assert.equal((await importCampaignPosts(f.env,owner,b)).operation.replayed,true);assert.equal(f.env.DB.one('SELECT COUNT(*) n FROM social_posts').n,1);
 const next=await nextCampaignCycle(f.env,owner,{id:v.campaign.id,start_date:'2027-02-04',request_id:'next-cycle-test-001'});assert.equal(next.campaign.state,'draft');assert.equal(next.campaign.approval,null);assert.ok(next.posts.every(p=>p.post_id===null));assert.equal(next.posts[0].objective,'Sell lunch');assert.equal(next.readiness.counts.filled,0);
 }finally{f.env.DB.sqlite.close();}
});
test('edits use version CAS and invalidate validation; posts cannot be assigned to two campaigns',async()=>{
 const f=fixture();try{const v=await ready(f);await assert.rejects(()=>createCampaign(f.env,owner,{...f.request,request_id:'duplicate-members-test'}),e=>e.code==='campaign_posts_unavailable');const update={id:v.campaign.id,expected_version:1,request_id:'edit-campaign-test-01',title:'Changed title'};const r=await updateCampaign(f.env,owner,update);assert.equal(r.campaign.version,2);assert.equal(r.campaign.validation.state,'pending');await assert.rejects(()=>updateCampaign(f.env,owner,{...update,request_id:'edit-campaign-test-02'}),e=>e.code==='campaign_version_changed');}finally{f.env.DB.sqlite.close();}
});
