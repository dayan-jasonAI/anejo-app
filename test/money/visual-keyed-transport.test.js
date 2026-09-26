import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, VERSION, visualAuditFormat, validateVisualAuditTransport } from '../../functions/_lib/visual_audit_rubric.js';
const context = { caption: 'Catering', slideCount: 1, brandText: 'Brand', brandReceipt: {read_status:'ok'}, trainingReceipt: {read_status:'empty'}, emblemReference: {verified:true,purpose:'visual_consistency_only'} };
const answer = () => ({ rubric_version: VERSION, product_evidence: {scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},
  observations: Object.fromEntries(CRITERIA.map(c => [c.id,{status:'met',evidence_anchor:'slide:1',caption_line:0,slides:[1],explanation:'Exact evidence for ' + c.id}])), suggestions: [] });

test('provider schema requires every unique criterion as a closed keyed object', () => {
  const schema = visualAuditFormat('Catering',1).schema.properties.observations;
  assert.equal(schema.type,'object'); assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.required,CRITERIA.map(c=>c.id)); assert.deepEqual(Object.keys(schema.properties),schema.required);
  for (const value of Object.values(schema.properties)) {
    assert.equal(value.additionalProperties,false); assert.equal(Object.hasOwn(value.properties,'criterion_id'),false);
    assert.deepEqual(value.required,['status','evidence_anchor','caption_line','slides','explanation']);
    assert.deepEqual(value.properties.evidence_anchor.enum,['caption:1','slide:1']);
  }
  assert.doesNotMatch(JSON.stringify(schema),/minItems|maxItems/);
});

test('shuffled keyed observations map losslessly to canonical order without mutating transport', () => {
  const data=answer(); data.observations=Object.fromEntries(Object.entries(data.observations).reverse());
  const before=structuredClone(data); const result=validateVisualAuditTransport(data,context);
  assert.equal(result.available,true);assert.deepEqual(result.observations.map(o=>o.criterion_id),CRITERIA.map(c=>c.id));
  for(const o of result.observations) for(const key of ['status','explanation','evidence_anchor','caption_line','slides'])assert.deepEqual(o[key],before.observations[o.criterion_id][key]);
  assert.deepEqual(data,before);
});

test('missing or extra keys, array fallback, malformed values and injected criterion identity fail closed', () => {
  const cases=[d=>delete d.observations.claims,d=>d.observations.secret_extra=d.observations.claims,
    d=>d.observations=Object.values(d.observations),d=>d.observations=null,
    d=>d.observations.claims=null,d=>d.observations.claims.criterion_id='branding',
    d=>delete d.observations.claims.explanation];
  for(const mutate of cases){const data=answer();mutate(data);const result=validateVisualAuditTransport(data,context);
    assert.equal(result.available,false);assert.equal(result.score,null);assert.equal(result.verdict,'flag');
    assert.doesNotMatch(JSON.stringify(result.diagnostic),/secret_extra|Exact evidence/);
  }
});

test('transport keeps uncertainty, violations, missing authority and source gates unchanged', () => {
  const unknown=answer();unknown.observations.branding.status='unknown';
  const result=validateVisualAuditTransport(unknown,context);assert.equal(result.available,true);assert.equal(result.complete,false);assert.equal(result.score,null);
  const violated=answer();violated.observations.readability.status='violated';violated.observations.readability.explanation='Slide 1 clips the heading.';
  assert.equal(validateVisualAuditTransport(violated,context).verdict,'flag');
  const malformed=answer();malformed.observations.claims.evidence_anchor='slide:99';assert.equal(validateVisualAuditTransport(malformed,context).available,false);
  assert.equal(validateVisualAuditTransport(answer(),{...context,brandReceipt:{read_status:'unavailable'}}).available,false);
  const unsupported=answer();unsupported.product_evidence={scope:'explicit_claims',claims:[{source:'caption',caption_line:1,slide:0,quote:'Catering',claim_id:'',authority_refs:[]}],unreadable_slides:[]};
  const unresolved=validateVisualAuditTransport(unsupported,context);assert.equal(unresolved.complete,false);assert.equal(unresolved.score,null);
  assert.equal(unresolved.observations.find(o=>o.criterion_id==='product_fidelity').status,'unknown');
});
