import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignPreview,onRequestPatch} from '../../functions/api/hub/owner/operator-campaign-preview.js';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequest as middleware} from '../../functions/api/_middleware.js';
const idea_id='obi_'+'a'.repeat(64),request_id='12345678-1234-4123-8123-123456789abc',revision_id='22345678-1234-4123-8123-123456789abc';
const proposal={title:'Private direction',objective:'Full-frame photography',audience:'Suggested local hosts',angle:'Do not impose a food occupancy percentage on every format.',cadence:'For review',success_metric:'Review draft quality',channels:['instagram'],product_ids:[],assets:[],assumptions:[],questions:['Confirm scope']};
async function fixture(){const env=ownerEnv();env.DB.sqlite.prepare("INSERT INTO operator_brief_ideas VALUES (?, 'Idea','Exact owner words','draft','stf_owner',1,1)").run(idea_id);const original=await (await createCampaignPreview(env,'stf_owner',{request_id,idea_id},async()=>({ok:true,proposal:{...proposal,angle:'Original direction'},actions:[],action:null,review_required:true,model:'test-model',input_context:{available_product_ids:[]},inference_receipt:{receipt_id:'original-input'},inference_attempts:[]}))).json();return {env,original:original.preview};}
const request=(body,cookie=OWNER_COOKIE)=>new Request('https://anejocateringco.com/api/hub/owner/operator-campaign-preview',{method:'PATCH',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});
const body=o=>({request_id:revision_id,preview_id:o.id,expected_proposal_sha256:o.proposal_sha256,proposal});
test('private revision preserves original and authority, no provider or planning mutations; retry is idempotent',async()=>{
 const {env,original}=await fixture();const fetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('Provider must not be called');};
 const before=env.DB.one('SELECT COUNT(*) n FROM team_briefs').n;
 try{const first=await onRequestPatch({env,request:request(body(original))});assert.equal(first.status,200);const saved=(await first.json()).preview;
 assert.equal(saved.generated,false);assert.equal(saved.review_required,true);assert.equal(saved.proposal.angle,proposal.angle);assert.equal(saved.source_receipts.revision.parent_id,original.id);assert.equal(saved.source_receipts.revision.approval,false);assert.deepEqual(saved.source_receipts.input_context,original.source_receipts.input_context);
 assert.equal(JSON.parse(env.DB.one('SELECT proposal_json FROM operator_campaign_previews WHERE id=?',original.id).proposal_json).angle,'Original direction');
 const retry=await (await onRequestPatch({env,request:request(body(original))})).json();assert.equal(retry.preview.id,saved.id);assert.equal(env.DB.one('SELECT COUNT(*) n FROM operator_campaign_previews').n,2);assert.equal(env.DB.one('SELECT COUNT(*) n FROM team_briefs').n,before);assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n,0);
 const conflict=body(original);conflict.proposal={...proposal,title:'Different'};assert.equal((await onRequestPatch({env,request:request(conflict)})).status,409);
 }finally{globalThis.fetch=fetch;}
});
test('owner role, exact hash, strict body, catalog and CSRF checks protect private revisions',async()=>{
 const {env,original}=await fixture();
 for(const cookie of ['', 'anejo_sess=tok-marketing'])assert.ok([401,403].includes((await onRequestPatch({env,request:request(body(original),cookie)})).status));
 for(const patch of [{expected_proposal_sha256:'0'.repeat(64)},{proposal:{...proposal,product_ids:['invented']}},{approved:true},{proposal:{...proposal,angle:'x'.repeat(2001)}}])assert.ok([400,409].includes((await onRequestPatch({env,request:request({...body(original),...patch})})).status));
 const req=request(body(original));req.headers.set('Origin','https://attacker.example');assert.equal((await middleware({request:req,next:()=>onRequestPatch({env,request:req})})).status,403);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM operator_campaign_previews').n,1);
});
