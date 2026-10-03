import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,CRITERIA,validateVisualAuditTransport,visualAuditFormat} from '../../functions/_lib/visual_audit_rubric.js';
const context={caption:'Grazing skewers',slideCount:1,brandText:'Use clear Añejo branding.',menuText:'Grazing skewers are offered for catering.',trainingText:'',brandReceipt:{read_status:'ok'},trainingReceipt:{read_status:'ok'},emblemReference:{verified:true,purpose:'visual_consistency_only'}};
function response(){return {rubric_version:VERSION,product_evidence:{scope:'explicit_claims',claims:[{source:'caption',caption_line:1,slide:0,quote:'Grazing skewers',claim_id:'',authority_refs:['menu:0'],assessment:'supported'}],unreadable_slides:[]},observations:Object.fromEntries(CRITERIA.map(c=>[c.id,{status:'met',evidence_anchor:'caption:1',caption_line:1,slides:[],explanation:'Model finding.'}])),suggestions:[]};}
const check=d=>validateVisualAuditTransport(d,context);
test('provider requires model assessments; authority reason is derived without filling judgments',()=>{
 const schema=visualAuditFormat(context.caption,1,context).schema.properties.product_evidence.properties.claims.items;
 assert.ok(schema.required.includes('assessment'));assert.ok(!schema.required.includes('assessment_reason'));assert.equal(schema.properties.assessment_reason,undefined);const d=response();delete d.product_evidence.claims[0].assessment;assert.equal(check(d).available,false);
});
test('skewer reasoning cannot turn unstated price or ingredients into canonical explanation or upgrade unknown',()=>{
 const d=response();d.observations.product_fidelity.status='unknown';d.observations.product_fidelity.explanation='Cannot verify tray price or pictured skewer ingredients.';
 const r=check(d),o=r.observations.find(x=>x.criterion_id==='product_fidelity');
 assert.equal(r.available,true);assert.equal(r.score,null);assert.equal(o.status,'unknown');
 assert.match(o.explanation,/Grazing skewers/);assert.doesNotMatch(o.explanation,/tray price|pictured skewer ingredients/);
 assert.match(o.explanation,/not verified entailment/);assert.equal(o.model_finding.explanation,d.observations.product_fidelity.explanation);
});
test('contradiction and ambiguity downgrade even aggregate met, missing authority cannot support claim',()=>{
 for(const [assessment,reason,status] of [['contradicted','source_contradiction','violated'],['unresolved','ambiguous_authority','unknown']]){
  const d=response();Object.assign(d.product_evidence.claims[0],{assessment});const r=check(d);
  assert.equal(r.observations.find(x=>x.criterion_id==='product_fidelity').status,status);assert.equal(r.verdict,'flag');assert.equal(r.product_evidence.claims[0].assessment_reason,reason);
 }
 const d=response();d.product_evidence.claims[0].authority_refs=[];assert.equal(check(d).available,false);
 Object.assign(d.product_evidence.claims[0],{assessment:'unresolved'});
 assert.equal(check(d).score,null);
});
test('unsupported assessment combinations and absent source references reject without manufacturing status',()=>{
 for(const change of [{assessment:'invented'},{assessment_reason:'missing_authority'},{assessment:'contradicted',assessment_reason:'source_support'},{authority_refs:['menu:99']}]){
  const d=response();Object.assign(d.product_evidence.claims[0],change);assert.equal(check(d).available,false);
 }
});
test('aggregate violation remains violated even all written claims assessed supported',()=>{
 const d=response();d.observations.product_fidelity.status='violated';const r=check(d);assert.equal(r.verdict,'flag');assert.equal(r.observations.find(x=>x.criterion_id==='product_fidelity').status,'violated');
});

test('unresolved reason follows actual references while unknown stays unknown',()=>{for(const refs of [[],['menu:0']]){const d=response();Object.assign(d.product_evidence.claims[0],{assessment:'unresolved',authority_refs:refs});const r=check(d);assert.equal(r.available,true);assert.equal(r.score,null);assert.equal(r.product_evidence.claims[0].assessment,'unresolved');assert.equal(r.product_evidence.claims[0].assessment_reason,refs.length?'ambiguous_authority':'missing_authority');}});
test('empty authority cannot support or contradict; invalid reference cannot become missing authority',()=>{for(const assessment of ['supported','contradicted']){const d=response();Object.assign(d.product_evidence.claims[0],{assessment,authority_refs:[]});assert.equal(check(d).available,false);}const d=response();Object.assign(d.product_evidence.claims[0],{assessment:'unresolved',authority_refs:['menu:99']});assert.equal(check(d).available,false);});
