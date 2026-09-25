import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeSqliteD1} from '../helpers/sqlite-d1.js';
import {leadReply,campaignPreviewFormat,FALLBACK_MODEL} from '../../functions/_lib/team_lead.js';
import {persistInferenceReceipt} from '../../functions/_lib/inference_receipt.js';
const proposal={title:'Launch',objective:'Catering inquiries',audience:'Suggested hosts',angle:'Real food',cadence:'Suggested weekly',success_metric:'Track inquiries',channels:['instagram'],product_ids:[],assets:[],assumptions:[],questions:[]};
function fixture(t,responses){
 const DB=makeSqliteD1();t.after(()=>DB.sqlite.close());const sent=[],old=globalThis.fetch;
 globalThis.fetch=async (_url,init)=>{sent.push(init.body);const next=responses.shift();assert.ok(next);return new Response(JSON.stringify(next.body),{status:next.status||200});};t.after(()=>{globalThis.fetch=old;});
 return {env:{DB,ANTHROPIC_API_KEY:'fixture'},sent};
}
const answer=(text=JSON.stringify(proposal),stop_reason='end_turn')=>({body:{stop_reason,content:[{type:'text',text}],usage:{input_tokens:1,output_tokens:1}}});
test('private grammar is transmitted and stored identically through model fallback',async t=>{
 const f=fixture(t,[{status:404,body:{error:{type:'not_found_error',message:'model missing'}}},answer()]);f.env.TEAM_LEAD_MODEL='missing-model';
 const r=await leadReply(f.env,{mode:'private_campaign_preview',message:'Plan launch'});assert.equal(r.ok,true);assert.equal(r.model,FALLBACK_MODEL);assert.equal(f.sent.length,2);
 const schema=campaignPreviewFormat().schema;assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,Object.keys(proposal));
 assert.doesNotMatch(JSON.stringify(schema),/"(?:minLength|maxLength|minItems|maxItems|uniqueItems)":/);
 for(let i=0;i<2;i++){
  const request=JSON.parse(f.sent[i]);assert.deepEqual(request.output_config,{format:campaignPreviewFormat()});
  const row=f.env.DB.one('SELECT * FROM inference_receipts WHERE id=?',r.inference_attempts[i].input_receipt.receipt_id);
  assert.equal(row.request_json,f.sent[i]);assert.equal(row.request_sha256,createHash('sha256').update(f.sent[i]).digest('hex'));
 }
});
test('ordinary Lead remains unstructured',async t=>{
 const f=fixture(t,[answer('Discussion only')]);const r=await leadReply(f.env,{message:'Discuss strategy'});assert.equal(r.ok,true);assert.equal(Object.hasOwn(JSON.parse(f.sent[0]),'output_config'),false);
});
for(const [name,text,stop,reason] of [
 ['refusal','I cannot help','refusal','incomplete_preview_response'],
 ['truncation','{"title":','max_tokens','incomplete_preview_response'],
 ['invalid JSON','{"title":','end_turn','invalid_preview_response'],
 ['prose wrapper','Here is the answer: '+JSON.stringify(proposal),'end_turn','invalid_preview_response'],
 ['length overflow',JSON.stringify({...proposal,title:'x'.repeat(201)}),'end_turn','invalid_preview_response'],
 ['duplicates',JSON.stringify({...proposal,channels:['instagram','instagram']}),'end_turn','invalid_preview_response'],
 ['invented ID',JSON.stringify({...proposal,product_ids:['invented']}),'end_turn','invalid_preview_response'],
]) test('grammar request does not bypass '+name+' validation',async t=>{
 const f=fixture(t,[answer(text,stop)]);const r=await leadReply(f.env,{mode:'private_campaign_preview',message:'Plan'});assert.equal(r.ok,false);assert.equal(r.reason,reason);assert.equal(f.sent.length,1);assert.equal(r.inference_receipt.persisted,true);
});
test('receipt accepts bounded closed schema and rejects config/keyword/secret extensions',async t=>{
 const DB=makeSqliteD1();t.after(()=>DB.sqlite.close());
 const base={model:'claude-opus-4-6',max_tokens:2400,system:'Brand',messages:[{role:'user',content:'Idea'}],output_config:{format:campaignPreviewFormat()}};
 assert.equal((await persistInferenceReceipt({DB},{surface:'team_lead',requestJson:JSON.stringify(base)})).persisted,true);
 for(const mutate of [
 b=>{b.output_config.effort='high';},b=>{b.output_config.format.type='other';},b=>{b.output_config.format.schema.additionalProperties=true;},b=>{b.output_config.format.schema.properties.title.maxLength=200;},b=>{b.output_config.format.schema.properties.title.$ref='https://example.com';},b=>{b.output_config.format.schema.required.pop();},b=>{b.output_config.format.schema.properties.title.description='Bearer abcdefghijklmnop';},b=>{b.output_config.format.schema.properties.api_key={type:'string'};b.output_config.format.schema.required.push('api_key');},b=>{b.output_config.format.schema.properties.title.description='x'.repeat(501);},b=>{b.output_config.format.schema.properties.title={type:'object',additionalProperties:false,required:[],properties:{}};}
 ]){const invalid=structuredClone(base);mutate(invalid);const r=await persistInferenceReceipt({DB},{surface:'team_lead',requestJson:JSON.stringify(invalid)});assert.equal(r.persisted,false);}
 assert.equal(DB.one('SELECT COUNT(*) AS n FROM inference_receipts').n,1);
});
