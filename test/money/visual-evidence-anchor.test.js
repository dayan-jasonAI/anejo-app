import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,CRITERIA,visualAuditFormat,validateVisualAudit} from '../../functions/_lib/visual_audit_rubric.js';
const ctx={caption:'Cajitas and trays\nAsk about availability',slideCount:2,brandText:'Real emblem and readable food',brandReceipt:{read_status:'ok'},trainingReceipt:{read_status:'empty'},emblemReference:{verified:true,purpose:'visual_consistency_only'}};
const response=()=>({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',evidence_anchor:'slide:1',caption_line:0,slides:[],explanation:'Inspected source meets the scoped criterion.'})),suggestions:[]});
test('provider schema makes actual source anchor mandatory without unsupported keywords',()=>{
 const format=visualAuditFormat(ctx.caption,ctx.slideCount).schema.properties.observations.items;
 assert.ok(format.required.includes('evidence_anchor'));
 assert.deepEqual(format.properties.evidence_anchor.enum,['caption:1','caption:2','slide:1','slide:2']);
 assert.doesNotMatch(JSON.stringify(visualAuditFormat(ctx.caption,2)),/"(?:minItems|maxItems|minLength|maxLength|anyOf|oneOf|if|then)":/);
 assert.deepEqual(visualAuditFormat('',0).schema.properties.observations.items.properties.evidence_anchor.enum,['unavailable']);
 assert.equal(VERSION,'anejo-visual-10');
});
test('no-product-claim met resolves ONLY selected inspected slide instead of inventing a default',()=>{
 const d=response(),o=d.observations.find(o=>o.criterion_id==='product_fidelity');o.evidence_anchor='slide:2';
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,true);
 const result=r.observations.find(o=>o.criterion_id==='product_fidelity');assert.deepEqual(result.slides,[2]);assert.equal(result.caption_line,0);assert.equal(result.evidence_anchor,'slide:2');assert.equal(result.caption_quote,'');
 assert.deepEqual(o.slides,[],'input remains unchanged');
});
test('selected caption reference resolves original text and preserves supplemental slides',()=>{
 const d=response();Object.assign(d.observations[0],{evidence_anchor:'caption:2',slides:[2]});
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,true);assert.equal(r.observations[0].caption_line,2);assert.equal(r.observations[0].caption_quote,'Ask about availability');assert.deepEqual(r.observations[0].slides,[2]);
});
test('missing, unknown, out-of-range and conflicting selected sources fail closed',()=>{
 for(const anchor of [undefined,'','unavailable','slide:3','caption:3','slide:01',1]){
  const d=response();if(anchor===undefined)delete d.observations[0].evidence_anchor;else d.observations[0].evidence_anchor=anchor;
  const r=validateVisualAudit(d,ctx);assert.equal(r.available,false);assert.equal(r.score,null);
 }
 const d=response();Object.assign(d.observations[0],{evidence_anchor:'caption:2',caption_line:1});assert.equal(validateVisualAudit(d,ctx).diagnostic.issue,'caption_reference_conflict');
});
test('unknown and not-applicable remain meaningful despite an inspected source anchor',()=>{
 const d=response();Object.assign(d.observations[0],{status:'unknown',explanation:'Source inspected but the emblem comparison is uncertain.'});d.observations.find(o=>o.criterion_id==='themed_packaging').status='not_applicable';
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,true);assert.equal(r.complete,false);assert.equal(r.score,null);assert.equal(r.verdict,'flag');assert.equal(r.criteria_applicable,6);assert.deepEqual(r.unknowns[0].slides,[1]);
});
test('unavailable sentinel never supplies a passing or failing judgment',()=>{
 const d=response();for(const o of d.observations)o.evidence_anchor='unavailable';
 const r=validateVisualAudit(d,{...ctx,caption:'',slideCount:0});assert.equal(r.available,false);assert.equal(r.diagnostic.issue,'unavailable_for_finding');assert.equal(r.score,null);
});
test('v7 responses cannot retain current acceptance after evidence contract change',()=>{
 const d=response();d.rubric_version='anejo-visual-7';assert.equal(validateVisualAudit(d,ctx).available,false);
});
