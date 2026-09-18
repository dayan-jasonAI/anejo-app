import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/marketing-asset-registry.js';
import { attachApprovedMarketingAsset, marketingAssetCandidateContext, suppliedAssetRequirements } from '../../functions/_lib/marketing_asset_attachment.js';
import { runAutomation } from '../../functions/_lib/automations.js';
import { makeKV } from '../helpers/d1.js';
const key = 'marketing-library/reuse.jpg';
const bytes = new Uint8Array([255,216,255,192,0,11,8,5,70,4,56,1,1,17,0,255,217]);
const requirements = { productIds: ['catering_reuse'], format: 'portrait', theme: 'Signature', visualType: 'product' };
async function setup(t) {
 const env = ownerEnv(); t.after(()=>env.DB.sqlite.close());
 env.DB.exec("UPDATE menu_items SET active=0; INSERT INTO menu_items(id,kind,name,price_cents,created_at,updated_at,availability) VALUES('catering_reuse','addon','Tray',100,1,1,'available')");
 env.MEDIA = {get: async()=>({size:bytes.length,arrayBuffer:async()=>bytes.buffer})};
 const response = await onRequestPost({env,request:new Request('https://test/api',{method:'POST',headers:{cookie:OWNER_COOKIE},body:JSON.stringify({asset_key:key,expected_revision:0,menu_item_ids:requirements.productIds,theme:requirements.theme,visual_type:'product',approved_for_draft_selection:true})})});
 assert.equal(response.status,200);
 env.DB.exec("INSERT INTO social_posts(id,caption,media_key,public_token,status,created_at,updated_at,image_brief,scheduled_at,original_caption_hash) VALUES('post','Caption',NULL,'token','draft',1,1,'Tray',999,'old')");
 return env;
}
const attach = env => attachApprovedMarketingAsset(env,{postId:'post',expectedCaption:'Caption',expectedImageBrief:'Tray',requirements});
test('approved exact match attaches privately with immutable linked evidence and clears trust/schedule',async t=>{
 const env=await setup(t);env.DB.exec("UPDATE social_posts SET auto_audit_required=1");const result=await attach(env);assert.equal(result.ok,true);
 const post=env.DB.one("SELECT * FROM social_posts WHERE id='post'");assert.equal(post.status,'draft');assert.equal(post.auto_audit_required,null);assert.equal(post.scheduled_at,null);assert.equal(post.original_caption_hash,null);assert.equal(post.original_design_snapshot,null);
 const receipt=env.DB.one('SELECT * FROM marketing_asset_uses');assert.equal(receipt.asset_revision,1);assert.equal(receipt.content_sha256,result.content_sha256);assert.deepEqual(JSON.parse(receipt.requirements_json),requirements);
 assert.equal(env.DB.one('SELECT origin FROM social_post_media').origin,'reviewed_library');
 assert.throws(()=>env.DB.exec('UPDATE marketing_asset_uses SET asset_revision=99'),/immutable/);
 assert.equal((await attach(env)).ok,false,'never replaces existing media');
 env.DB.exec('DELETE FROM social_post_media');assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_uses').n,1,'detaching preserves historical evidence');
 env.DB.exec("DELETE FROM social_posts WHERE id='post'");assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_uses').n,1,'deleting draft preserves historical evidence');
});
test('revocation or draft edits immediately before atomic attachment refuse without partial writes',async t=>{
 for(const mutation of ["UPDATE marketing_asset_registry SET approved_for_draft_selection=0,revision=2", "UPDATE social_posts SET caption='Edited'", "UPDATE social_posts SET status='scheduled'", "UPDATE menu_items SET active=0"]){
  const env=await setup(t),batch=env.DB.batch;env.DB.batch=async statements=>{env.DB.exec(mutation);return batch(statements);};
  assert.equal((await attach(env)).ok,false);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_post_media').n,0);assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_uses').n,0);
 }
});
test('failed evidence insert rolls back media; wrong requirements and changed content do not attach',async t=>{
 const env=await setup(t);
 env.DB.exec("CREATE TRIGGER reject_use BEFORE INSERT ON marketing_asset_uses BEGIN SELECT RAISE(ABORT,'unavailable'); END");
 assert.equal((await attach(env)).reason,'attachment_storage_failed');assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_post_media').n,0);
 assert.equal((await attachApprovedMarketingAsset(env,{postId:'post',expectedCaption:'Caption'})).reason,'missing_explicit_requirements');
 env.MEDIA.get=async()=>({size:bytes.length,arrayBuffer:async()=>{const changed=bytes.slice();changed[10]=57;return changed.buffer;}});
 assert.equal((await attach(env)).ok,false);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_post_media').n,0);
});
test('planner explicit library request attaches draft only; unknown IDs never trigger paid image fallback',async t=>{
 for(const ids of [['catering_reuse'],['invented']]){
  const env=await setup(t);env.ANTHROPIC_API_KEY='test';env.SESSIONS=makeKV({'cfg:social_cadence':JSON.stringify({feed_per_week:1})});
  env.DB.exec("UPDATE trust_ledger SET auto_publish=1");
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,init)=>{calls++;const body=JSON.parse(init.body);if(!body.system.includes('You are the content writer'))throw Error('audit mocked unavailable');assert.match(body.system,/asset_requirements/);assert.match(body.messages[0].content,/REVIEWED LIBRARY CANDIDATES/);assert.match(body.messages[0].content,/Signature/);return new Response(JSON.stringify({content:[{text:JSON.stringify([{caption:'Catering tray',image_brief:'Tray',category:'catering',asset_requirements:{...requirements,productIds:ids},day_offset:0,hour:12}])}]}));};
  try {await runAutomation(env,'social_plan',{date:'2026-08-03'});}finally{globalThis.fetch=original;}
  const post=env.DB.one("SELECT * FROM social_posts WHERE source='planner'");assert.ok(post);assert.equal(post.status,'draft');assert.equal(post.auto_audit_required,null);assert.equal(post.scheduled_at,null);assert.equal(post.original_design_snapshot,null);assert.equal(post.original_caption_hash,null);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM marketing_asset_uses').n,ids[0]==='invented'?0:1);
  const receipt=env.DB.one("SELECT request_json,components_json FROM inference_receipts WHERE surface='social_plan'");assert.ok(receipt);const component=JSON.parse(receipt.components_json).asset_registry;assert.equal(component.read_status,'ok');assert.equal(component.documents[0].asset_revision,1);assert.equal(component.documents[0].content_sha256,env.DB.one('SELECT content_sha256 FROM marketing_asset_registry').content_sha256);assert.match(receipt.request_json,/Signature/);
  assert.ok(calls<=2,'only caption inference and existing audit, never image generation');
 }
});

test('candidate snapshot accepts only supplied exact tuples; bounded metadata distinguishes unavailable and empty',async t=>{
 const env=await setup(t);env.MEDIA.get=async()=>{assert.fail('prompt metadata must not read R2');};
 const context=await marketingAssetCandidateContext(env,['catering_reuse']);
 assert.equal(suppliedAssetRequirements(requirements,context),true);
 for(const changed of [{theme:'Guessed birthday'},{format:'square'},{visualType:'lifestyle'},{productIds:['invented']}])assert.equal(suppliedAssetRequirements({...requirements,...changed},context),false);
 const row=env.DB.one('SELECT * FROM marketing_asset_registry'),cols=Object.keys(row);
 const insert=env.DB.sqlite.prepare(`INSERT INTO marketing_asset_registry (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
 for(let i=0;i<21;i++){const clone={...row,id:'candidate_'+i,asset_key:`marketing-library/candidate_${i}.jpg`};insert.run(...cols.map(c=>clone[c]));}
 const capped=await marketingAssetCandidateContext(env,['catering_reuse']);assert.equal(capped.candidates.length,20);assert.equal(capped.receipt.truncated,true);assert.equal(capped.receipt.source_ids.length,20);
 env.DB.exec('UPDATE marketing_asset_registry SET approved_for_draft_selection=0');
 assert.equal((await marketingAssetCandidateContext(env,['catering_reuse'])).receipt.read_status,'empty');
 const prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.includes('FROM marketing_asset_registry'))throw Error('read unavailable');return prepare(sql);};
 const missing=await marketingAssetCandidateContext(env,['catering_reuse']);assert.equal(missing.receipt.read_status,'unavailable');assert.deepEqual(missing.candidates,[]);assert.match(missing.text,/unavailable/);
});
