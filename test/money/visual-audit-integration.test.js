import { readFileSync } from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, VERSION } from '../../functions/_lib/visual_audit_rubric.js';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { auditDraft as actualAuditDraft } from '../../functions/_lib/governance.js';
const answer=()=>({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_line:0,slides:[1],explanation:'The visible result meets this criterion.'})),suggestions:[]});
test('visual candidate sends rubric and retained coverage, no image persistence',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;let body;
 globalThis.fetch=async(_,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(answer())}]})};};
 try{const r=await auditDraft(env,{caption:'Catering for your gathering',images:[{data:'test-image'}]});assert.equal(r.verdict,'pass');assert.deepEqual(body.output_config.format.schema.properties.observations.items.properties.caption_line.enum,[0,1]);assert.equal(r.input_coverage.training.reads.rules,'empty');assert.equal(r.rubric_version,VERSION);assert.match(body.system,/VERSIONED VISUAL ACCEPTANCE/);assert.ok(!body.system.includes('Return ONLY JSON, nothing else:'));assert.equal(body.messages[0].content[2].source.data,'test-image');assert.equal(body.messages[0].content[4].source.media_type,'image/png');assert.equal(body.messages[0].content[1].text,'Slide 1 — COVER');assert.equal(r.input_coverage.emblem_reference.purpose,'visual_consistency_only');assert.ok(!env.DB.calls.some(c=>c.kind==='run'&&c.args.includes('test-image')));}finally{globalThis.fetch=original;}
});
test('unreadable training blocks visual provider call instead of inventing empty source',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});env.DB.exec('DROP TABLE training_rules');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not call');};
 try{const r=await auditDraft(env,{caption:'Catering',images:[{data:'test'}]});assert.equal(calls,0);assert.equal(r.brand_score,null);assert.ok(r.flags.some(f=>f.type==='audit_unavailable'));}finally{globalThis.fetch=original;}
});
test('caption-only retains legacy payload and response contract',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;let body;
 globalThis.fetch=async(_,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({content:[{text:JSON.stringify({brand_score:90,verdict:'pass',flags:[]})}]})};};
 try{const r=await auditDraft(env,{caption:'Catering'});assert.equal(r.brand_score,90);assert.equal(r.verdict,'pass');assert.equal(body.model,'claude-haiku-4-5');assert.equal(body.output_config,undefined);assert.equal(r.rubric_version,undefined);}finally{globalThis.fetch=original;}
});

 test('fallback menu authority blocks visual provider call with a real database read failure',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});env.DB.exec('DROP TABLE menu_items');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not call');};
 try{const r=await auditDraft(env,{caption:'Catering',images:[{data:'test'}]});assert.equal(calls,0);assert.equal(r.brand_score,null);assert.match(r.flags.find(f=>f.type==='audit_unavailable').detail,/menu_authority_unavailable/);}finally{globalThis.fetch=original;}
 });

const canonicalEmblem = readFileSync(new URL('../../public/assets/img/emblem.png', import.meta.url));
async function auditDraft(env, input) { return actualAuditDraft({ ...env, ASSETS: { fetch: async () => new Response(canonicalEmblem) } }, input); }

test('reference loads canonical bundled bytes with no external or ASSETS request',async()=>{
 const {loadEmblemReference,EMBLEM_REFERENCE_URL,EMBLEM_REFERENCE_SHA256}=await import('../../functions/_lib/governance.js');const original=globalThis.fetch;
 const denied=async()=>{assert.fail('Reference must not access the network');};globalThis.fetch=denied;
 try{const r=await loadEmblemReference({ASSETS:{fetch:denied}});assert.ok(r);assert.equal(r.metadata.source,'public/assets/img/emblem.png');assert.equal(r.metadata.canonical_url,EMBLEM_REFERENCE_URL);assert.equal(r.metadata.sha256,EMBLEM_REFERENCE_SHA256);assert.equal(r.metadata.purpose,'visual_consistency_only');assert.deepEqual(Buffer.from(r.data,'base64'),canonicalEmblem);}finally{globalThis.fetch=original;}
});

test('uncertain visual evidence reports missing proof rather than a provider outage',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;
 globalThis.fetch=async()=>{const data=answer();data.observations[0].status='unknown';return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]})};};
 try{const r=await auditDraft(env,{caption:'Catering',images:[{data:'test'}]});assert.equal(r.complete,false);assert.equal(r.brand_score,null);assert.equal(r.verdict,'flag');assert.equal(r.unknowns[0].criterion_id,'branding');assert.equal(r.observations.length,7);}finally{globalThis.fetch=original;}
});
test('safe audit failure reasons expose no arbitrary provider error or secret',async()=>{
 const {safeAuditFailure}=await import('../../functions/_lib/governance.js');
 assert.match(safeAuditFailure('emblem_reference_unavailable'),/emblem reference/);
 assert.match(safeAuditFailure('unsupported_rule_quote'),/supplied source/);
 assert.match(safeAuditFailure('contradictory_finding'),/contradicts/);
 for(const input of ['provider error sk-ant-PRIVATE', '__proto__', undefined])assert.equal(safeAuditFailure(input),'API unreachable or answer unparseable');
});

test('rejected criterion retains bounded diagnostic without response body or image bytes',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;
 globalThis.fetch=async()=>{const data=answer();data.observations[0].status='unknown';data.observations[0].explanation='Unable to compare this emblem confidently.';return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]})};};
 try{const r=await auditDraft(env,{caption:'Catering',images:[{data:'PRIVATE_IMAGE_BYTES'}]});assert.equal(r.verdict,'flag');assert.equal(r.unknowns[0].criterion_id,'branding');assert.equal(r.observations[0].status,'unknown');assert.match(r.unknowns[0].explanation,/Unable/);assert.ok(!JSON.stringify(r).includes('PRIVATE_IMAGE_BYTES'));assert.equal(r.rubric_version,VERSION);}finally{globalThis.fetch=original;}
});

test('actual visual request numbers publication JPEGs first and reference PNG last, never as cover',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;let request;
 globalThis.fetch=async(_,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_line:0,slides:[1],explanation:'Test fixture evidence'})),suggestions:[]})}]})};};
 try{await auditDraft(env,{caption:'Menu',images:['cover','cajitas','tray','bites','combo','cta'].map(data=>({data}))});
 const content=request.messages[0].content;const pictures=content.filter(c=>c.type==='image');assert.deepEqual(pictures.slice(0,6).map(c=>c.source.data),['cover','cajitas','tray','bites','combo','cta']);assert.equal(pictures[6].source.media_type,'image/png');assert.equal(pictures.length,7);
 for(let i=0;i<6;i++){assert.match(content[1+2*i].text,new RegExp('^Slide '+(i+1)));assert.equal(content[2+2*i].source.data,pictures[i].source.data);}
 assert.match(content[1].text,/COVER/);assert.match(content[13].text,/END OF NUMBERED CAROUSEL/);assert.match(content[13].text,/excluded from slide count/);assert.equal(content[14].source.media_type,'image/png');assert.deepEqual(request.output_config.format.schema.properties.observations.items.properties.slides.items.enum,[1,2,3,4,5,6]);assert.equal(VERSION,'anejo-visual-7');
 }finally{globalThis.fetch=original;}
});

test('source declarations preserve actual carousel order without turning source data into an audit pass',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;let body;
 const sourceReceipt={media_id:'m2',seq:9,key:'marketing-library/test.jpg',sha256:'a'.repeat(64),design_facts:{rendered_text:[{role:'detail',text:'DM CAJITA / Escríbenos CAJITA'}]}};
 globalThis.fetch=async(_,init)=>{body=JSON.parse(init.body);const data=answer();data.observations[0].status='unknown';return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(data)}]})};};
 try {
  const result=await auditDraft(env,{caption:'Catering',images:[{data:'test',sourceReceipt}]});
  const declarations=body.messages[0].content.at(-1).text;
  assert.match(declarations,/"slide":1/);assert.doesNotMatch(declarations,/"seq":9/);
  assert.match(declarations,/DM CAJITA/);assert.match(declarations,/do not recommend wording already present/);
  assert.equal(result.input_coverage.slide_sources[0].sha256,sourceReceipt.sha256);
  assert.equal(result.verdict,'flag');assert.equal(result.brand_score,null);
 } finally {globalThis.fetch=original;}
});
test('unavailable provider preserves supplied source receipts without asserting acceptance',async()=>{
 const sourceReceipt={sha256:'b'.repeat(64),design_facts:null};
 const result=await auditDraft(ownerEnv(),{caption:'Catering',images:[{data:'test',sourceReceipt}]});
 assert.equal(result.verdict,'flag');assert.equal(result.brand_score,null);
 assert.equal(result.input_coverage.slide_sources[0].sha256,sourceReceipt.sha256);
 assert.equal(result.input_coverage.slide_sources[0].design_facts,null);
});

test('oversized source declarations fail closed rather than silently truncating known facts',async()=>{
 const {designEvidencePrompt}=await import('../../functions/_lib/governance.js');
 assert.throws(()=>designEvidencePrompt([{sourceReceipt:{design_facts:{rendered_text:[{text:'x'.repeat(24001)}]}}}]),/design_evidence_limit/);
});
