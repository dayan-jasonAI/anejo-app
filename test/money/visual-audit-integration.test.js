import { readFileSync } from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, VERSION } from '../../functions/_lib/visual_audit_rubric.js';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { auditDraft as actualAuditDraft } from '../../functions/_lib/governance.js';
const answer=()=>({rubric_version:VERSION,observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_quote:'',slides:[1],explanation:'The visible result meets this criterion.'})),suggestions:[]});
test('visual candidate sends rubric and retained coverage, no image persistence',async()=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test'});const original=globalThis.fetch;let body;
 globalThis.fetch=async(_,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(answer())}]})};};
 try{const r=await auditDraft(env,{caption:'Catering for your gathering',images:[{data:'test-image'}]});assert.equal(r.verdict,'pass');assert.equal(r.input_coverage.training.reads.rules,'empty');assert.equal(r.rubric_version,VERSION);assert.match(body.system,/VERSIONED VISUAL ACCEPTANCE/);assert.ok(!body.system.includes('Return ONLY JSON, nothing else:'));assert.equal(body.messages[0].content[3].source.data,'test-image');assert.equal(body.messages[0].content[1].source.media_type,'image/png');assert.equal(body.messages[0].content[2].text,'Slide 1');assert.equal(r.input_coverage.emblem_reference.purpose,'visual_consistency_only');assert.ok(!env.DB.calls.some(c=>c.kind==='run'&&c.args.includes('test-image')));}finally{globalThis.fetch=original;}
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
 try{const r=await auditDraft(env,{caption:'Catering',images:[{data:'test'}]});const detail=r.flags.find(f=>f.type==='audit_unavailable').detail;assert.match(detail,/evidence is missing or uncertain/);assert.ok(!detail.includes('API unreachable'));}finally{globalThis.fetch=original;}
});
test('safe audit failure reasons expose no arbitrary provider error or secret',async()=>{
 const {safeAuditFailure}=await import('../../functions/_lib/governance.js');
 assert.match(safeAuditFailure('emblem_reference_unavailable'),/emblem reference/);
 assert.match(safeAuditFailure('unsupported_rule_quote'),/supplied source/);
 assert.match(safeAuditFailure('contradictory_finding'),/contradicts/);
 for(const input of ['provider error sk-ant-PRIVATE', '__proto__', undefined])assert.equal(safeAuditFailure(input),'API unreachable or answer unparseable');
});
