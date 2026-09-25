import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { leadReply, validateCampaignProposal, PRIVATE_CAMPAIGN_PREVIEW as mode } from '../../functions/_lib/team_lead.js';
const proposal = () => ({title:'Catering launch',objective:'Increase catering inquiries',audience:'Suggested: local hosts',angle:'Premium Cuban food',channels:['instagram'],product_ids:[],cadence:'Suggested: two posts',success_metric:'Measure attributable inquiries; target needs review',assets:['Proposed carousel; availability unverified'],assumptions:[],questions:['What event dates are available?']});
function fixture(t, answer, stop='end_turn') {
 const DB=makeSqliteD1(); t.after(()=>DB.sqlite.close());
 DB.exec('DELETE FROM team_briefs; DELETE FROM social_posts');
 const env={DB,ANTHROPIC_API_KEY:'test-only'};
 let calls=0, sent;
 const old=globalThis.fetch;
 globalThis.fetch=async (_url,init)=>{calls++;sent=init.body;return new Response(JSON.stringify({stop_reason:stop,content:[{type:'text',text:typeof answer==='string'?answer:JSON.stringify(answer)}],usage:{input_tokens:1,output_tokens:1}}));};
 t.after(()=>{globalThis.fetch=old;});
 return {env,calls:()=>calls,sent:()=>sent};
}
test('private preview uses existing exact receipt and returns proposal without action writes',async t=>{
 const f=fixture(t,proposal());
 const before=f.env.DB.one('SELECT COUNT(*) AS n FROM team_briefs').n;
 const r=await leadReply(f.env,{message:'Develop a catering launch',mode});
 assert.equal(r.ok,true);assert.deepEqual(r.proposal,proposal());assert.deepEqual(r.actions,[]);assert.equal(r.action,null);assert.equal(r.review_required,true);
 assert.equal(f.env.DB.one('SELECT COUNT(*) AS n FROM team_briefs').n,before);
 assert.equal(f.env.DB.one('SELECT COUNT(*) AS n FROM social_posts').n,0);
 const receipt=f.env.DB.one('SELECT * FROM inference_receipts WHERE id=?',r.inference_receipt.receipt_id);
 assert.equal(receipt.request_json,f.sent());assert.equal(r.inference_receipt.persisted,true);
 assert.match(JSON.parse(f.sent()).system,/EXACT MENU SNAPSHOT/);
 assert.deepEqual(JSON.parse(receipt.components_json).menu.source_ids,r.input_context.supplied_product_ids);
 assert.equal(r.input_context.coverage.intel.read_status,'not_supplied');
});
test('contract rejects guessed IDs, privileged extra fields and malformed arrays',()=>{
 assert.equal(validateCampaignProposal(proposal(),[]),true);
 for(const mutation of [{product_ids:['guessed']},{approved:true},{channels:['email']},{assets:['x'.repeat(401)]},{questions:'unknown'},{channels:[]},{title:''},{product_ids:['known','known']}]) assert.equal(validateCampaignProposal({...proposal(),...mutation},['known']),false);
});
for(const [name,answer,stop,reason] of [
 ['truncated',proposal(),'max_tokens','incomplete_preview_response'],
 ['missing stop',proposal(),null,'incomplete_preview_response'],
 ['action output',{action:'draft_posts'},'end_turn','invalid_preview_response'],
 ['fenced response','```json\n{}\n```','end_turn','invalid_preview_response'],
 ['unknown product',{...proposal(),product_ids:['invented']},'end_turn','invalid_preview_response']
]) test(name+' never becomes a strategy',async t=>{const f=fixture(t,answer,stop);const r=await leadReply(f.env,{mode,message:'Plan'});assert.equal(r.ok,false);assert.equal(r.reason,reason);assert.equal(f.calls(),1);assert.ok(r.inference_receipt);assert.equal(f.env.DB.one('SELECT COUNT(*) AS n FROM team_briefs').n,0);});
test('bad mode/input and unreadable budget do not invoke provider',async t=>{
 const f=fixture(t,proposal());
 for(const args of [{mode:'bad',message:'x'},{mode,message:'x',history:[{body:'x'}]},{mode,message:'x'.repeat(1001)}]) assert.equal((await leadReply(f.env,args)).ok,false);
 const r=await leadReply({ANTHROPIC_API_KEY:'test'}, {mode,message:'Plan'});assert.equal(r.reason,'budget_unavailable');assert.equal(f.calls(),0);
});
test('unknown reads are explicit rather than a zero performance claim',async t=>{
 const f=fixture(t,proposal());f.env.DB.exec('DROP TABLE ig_account_metrics; DROP TABLE social_posts');
 const r=await leadReply(f.env,{mode,message:'Plan'});assert.equal(r.ok,true);assert.equal(r.input_context.coverage.account.read_status,'unavailable');assert.equal(r.input_context.coverage.drafts.read_status,'unavailable');
 assert.match(JSON.parse(f.sent()).system,/count is unknown/);
});
test('selected product is validated against the original supplied menu while provider is pending',async t=>{
 const f=fixture(t,proposal());
 const item=f.env.DB.one("SELECT id FROM menu_items WHERE active=1 AND kind='bowl' LIMIT 1");
 assert.ok(item);
 globalThis.fetch=async (_url,init)=>{
   const body=JSON.parse(init.body);assert.match(body.system,new RegExp(item.id));
   f.env.DB.sqlite.prepare('UPDATE menu_items SET active=0 WHERE id=?').run(item.id);
   return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({...proposal(),product_ids:[item.id]})}],usage:{input_tokens:1,output_tokens:1}}));
 };
 const r=await leadReply(f.env,{mode,message:'Develop idea'});assert.equal(r.ok,true);assert.deepEqual(r.proposal.product_ids,[item.id]);
 assert.ok(r.input_context.supplied_product_ids.includes(item.id));
 assert.ok(r.input_context.available_product_ids.includes(item.id));
 // This is historical supplied context, not a claim that the product is still available.
 assert.equal(f.env.DB.one('SELECT active FROM menu_items WHERE id=?',item.id).active,0);
});
test('receipt failure does not fabricate evidence or execute a strategy',async t=>{
 const f=fixture(t,proposal());f.env.DB.exec('DROP TABLE inference_receipts');
 const r=await leadReply(f.env,{mode,message:'Develop idea'});assert.equal(r.ok,true);assert.equal(r.inference_receipt.persisted,false);assert.equal(r.inference_receipt.receipt_id,undefined);assert.deepEqual(r.actions,[]);
});
