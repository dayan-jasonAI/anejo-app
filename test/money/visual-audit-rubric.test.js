import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CRITERIA,VERSION,validateVisualAudit,coverageProblem} from '../../functions/_lib/visual_audit_rubric.js';
const context=()=>({emblemReference:{verified:true,purpose:'visual_consistency_only'},caption:'Planning an event in Hollywood? Share your city and we will confirm availability.',slideCount:3,brandText:'Use legible branding in the full frame.',trainingText:'Keep the entire frame visible.',menuText:'Lechon catering tray',brandReceipt:{read_status:'ok',truncated:false},trainingReceipt:{read_status:'ok',reads:{rules:'ok',examples:'empty'},truncated:false}});
const response=()=>({rubric_version:VERSION,observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_quote:'',slides:[1],explanation:'The inspected evidence satisfies this criterion.'})),suggestions:[]});
function check(data,ctx=context()){return validateVisualAudit(data,ctx);}
test('complete compliant rubric has defined score, suggestions never become violations',()=>{const d=response();d.suggestions=['Optional: shorten the opening sentence.'];const r=check(d);assert.equal(r.verdict,'pass');assert.equal(r.score,100);assert.equal(r.suggestions.length,1);});
test('real stated defect remains flagged with rule and slide evidence',()=>{const d=response();Object.assign(d.observations[1],{status:'violated',slides:[2],explanation:'Slide 2 clips the final word of the required heading.'});const r=check(d);assert.equal(r.verdict,'flag');assert.equal(r.flags.length,1);assert.equal(r.score,86);});
test('unsupported or incomplete observations cannot be accepted',()=>{
 for(const mutate of [d=>d.observations.pop(),d=>d.observations[0].criterion_id='invented',d=>d.observations[0].rule_quote='Invented narrower branding rule',d=>d.observations[0].caption_quote='An absent promise',d=>d.observations[0].slides=[4],d=>d.observations[0].slides=[],d=>d.observations[0].status='unknown',d=>d.observations[0].status='not_applicable']){const d=response();mutate(d);assert.equal(check(d).available,false);assert.equal(check(d).score,null);}
});
test('self-negating defects fail audit, never get removed to create pass',()=>{
 for(const explanation of ['The owner sequence is followed here.','This is not a violation.','A stylistic note rather than a rule violation.']){const d=response();Object.assign(d.observations[0],{status:'violated',explanation});const r=check(d);assert.equal(r.available,false);assert.equal(r.verdict,'flag');assert.equal(r.reason,'contradictory_finding');}
});
test('source failures, partial reads and truncation cannot support visual pass',()=>{
 for(const mutate of [c=>c.trainingReceipt=null,c=>c.brandReceipt.read_status='unavailable',c=>c.trainingReceipt.read_status='partial',c=>c.trainingReceipt.truncated=true,c=>c.brandReceipt.truncated=true,c=>c.trainingReceipt.selection_may_be_limited={rules:true}]){const c=context();mutate(c);assert.ok(coverageProblem(c.brandReceipt,c.trainingReceipt));assert.equal(check(response(),c).available,false);}
});
test('owner instructions remain mandatory even when training table is empty',()=>{const d=response();d.observations[6].status='not_applicable';assert.equal(check(d).available,false);const c=context();c.trainingReceipt.reads.rules='empty';assert.equal(check(d,c).available,false);});
test('canonical rule references are server-derived; model source fields are rejected',()=>{
 const d=response();const out=check(d);assert.equal(out.observations[0].rule_source,'criterion');assert.equal(out.observations[0].rule_quote,CRITERIA[0].rule);
 for(const extra of [{rule_source:'brand'},{rule_quote:CRITERIA[0].rule}]){const invalid=response();Object.assign(invalid.observations[0],extra);assert.equal(check(invalid).available,false);}
});

test('empty brand cannot support acceptance',()=>{const c=context();c.brandText='';assert.equal(check(response(),c).available,false);});

test('missing reference prevents a visual acceptance claim',()=>{const c=context();c.emblemReference=null;assert.equal(check(response(),c).reason,'emblem_reference_unavailable');});
