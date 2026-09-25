import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CRITERIA,VERSION,validateVisualAudit,visualAuditOutputBudget} from '../../functions/_lib/visual_audit_rubric.js';
import {DESIGN_FACTS_BY_SHA256 as registry} from '../../functions/_lib/audit_design_facts.generated.js';
const images=name=>Object.values(registry).filter(x=>x.file.includes('/'+name+'-')).sort((a,b)=>a.file.localeCompare(b.file)).map(x=>({sourceReceipt:{sha256:x.output.sha256,design_facts:x}}));
const ctx=name=>({images:images(name),slideCount:images(name).length,caption:'Private audit fixture',brandText:'Owner guidance.',trainingText:'Owner rule.',menuText:'Menu evidence.',brandReceipt:{read_status:'ok',truncated:false},trainingReceipt:{read_status:'ok',reads:{rules:'ok',examples:'empty'},truncated:false},emblemReference:{verified:true,purpose:'visual_consistency_only'}});
const answer=()=>({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',evidence_anchor:'slide:1',caption_line:0,slides:[1],explanation:'Inspected source.'})),suggestions:[]});
const claimed=c=>{const d=answer();d.product_evidence.scope='explicit_claims';d.product_evidence.claims=c.images.flatMap((x,i)=>x.sourceReceipt.design_facts.rendered_text.filter(r=>r.product_claim_id).map(r=>({source:'registered_overlay',caption_line:0,slide:i+1,quote:r.text,claim_id:r.product_claim_id,authority_source:'unknown',authority_quote:''})));d.observations.find(o=>o.criterion_id==='product_fidelity').status='unknown';return d;};
test('reviewed IDs bind exact JPEG and run position; generic formats have none',()=>{let count=0;for(const r of Object.values(registry))r.rendered_text.forEach((run,i)=>{if(run.product_claim_id){assert.equal(run.product_claim_id,'pc_'+r.output.sha256+'_'+i);count++;}});assert.equal(count,10);assert.equal(claimed(ctx('gather')).product_evidence.claims.length,8);assert.equal(claimed(ctx('personal')).product_evidence.claims.length,2);assert.equal(claimed(ctx('choice')).product_evidence.claims.length,0);});
test('exact v8 personal and gather format-only conclusions are rejected in v9',()=>{const rows=JSON.parse(readFileSync(new URL('../../docs/marketing/AUDIT_V8_READBACK_2026-09-25.json',import.meta.url))).flatMap(x=>x.results);for(const [name,id] of [['personal','sp_58424887f40e1a1b611f'],['gather','sp_20fbf4bea6aea85f30bf']]){const old=JSON.parse(rows.find(r=>r.id===id).audit_detail_json);assert.equal(old.product_evidence.scope,'format_only_or_no_claim');const d=answer();d.product_evidence=old.product_evidence;d.observations.find(o=>o.criterion_id==='product_fidelity').explanation=old.observations.find(o=>o.criterion_id==='product_fidelity').explanation;assert.equal(validateVisualAudit(d,ctx(name)).diagnostic.issue,'known_claim_scope_omission');}});
test('known claims cannot be omitted, duplicated, shortened, or asserted without authority',()=>{const c=ctx('personal');for(const mutate of [d=>d.product_evidence.claims.pop(),d=>d.product_evidence.claims.push(d.product_evidence.claims[0]),d=>d.product_evidence.claims[1].quote='Hawaiian roll']){const d=claimed(c);mutate(d);assert.equal(validateVisualAudit(d,c).available,false);}const r=validateVisualAudit(claimed(c),c);assert.equal(r.available,true);assert.equal(r.complete,false);assert.equal(r.score,null);});
test('all v9 claims require strict authority fields and actual supplied source substring',()=>{const c=ctx('personal');const d=claimed(c);for(const claim of d.product_evidence.claims){claim.authority_source='owner';claim.authority_quote='Owner rule.';}assert.equal(validateVisualAudit(d,c).available,true);d.product_evidence.claims[0].authority_quote='Invented authority';assert.equal(validateVisualAudit(d,c).diagnostic.issue,'claim_authority_unmatched');delete d.product_evidence.claims[0].claim_id;assert.equal(validateVisualAudit(d,c).diagnostic.issue,'invalid_claim');});
test('generic imagery remains scoped and output budget is finite',()=>{assert.equal(validateVisualAudit(answer(),ctx('choice')).verdict,'pass');assert.equal(visualAuditOutputBudget(images('gather')),6144);assert.equal(visualAuditOutputBudget([]),4096);assert.equal(visualAuditOutputBudget(Array(100).fill(images('gather')[1])),12288);});

test('authority IDs resolve supplied text and preserve multiple citations without changing verdict',()=>{
 const c=ctx('personal'),d=claimed(c);
 for(const claim of d.product_evidence.claims){delete claim.authority_source;delete claim.authority_quote;claim.authority_refs=['menu:0','training:0'];}
 const r=validateVisualAudit(d,c);
 assert.equal(r.available,true);assert.equal(r.score,null);
 assert.deepEqual(r.product_evidence.claims[0].authority_citations.map(x=>x.quote),['Menu evidence.','Owner rule.']);
 d.product_evidence.claims[0].authority_refs=['menu:999'];
 assert.equal(validateVisualAudit(d,c).diagnostic.issue,'unknown_authority_ref');
});
test('empty reference requires unknown and mixed transport fields cannot evade validation',()=>{
 const c=ctx('personal'),d=claimed(c);
 for(const claim of d.product_evidence.claims){delete claim.authority_source;delete claim.authority_quote;claim.authority_refs=[];}
 assert.equal(validateVisualAudit(d,c).available,true);
 d.observations.find(o=>o.criterion_id==='product_fidelity').status='met';
 assert.equal(validateVisualAudit(d,c).score,null);assert.equal(validateVisualAudit(d,c).complete,false);
 d.product_evidence.claims[0].authority_quote='injected';
 assert.equal(validateVisualAudit(d,c).diagnostic.issue,'invalid_claim');
});

test('unresolved authority conservatively replaces met and preserves original model judgment',()=>{
 const c=ctx('personal'),d=claimed(c),o=d.observations.find(x=>x.criterion_id==='product_fidelity');
 o.status='met';o.explanation='Model considered the selection supported.';
 const r=validateVisualAudit(d,c),finding=r.observations.find(x=>x.criterion_id==='product_fidelity');
 assert.equal(r.available,true);assert.equal(r.complete,false);assert.equal(r.score,null);assert.equal(r.verdict,'flag');
 assert.equal(finding.status,'unknown');assert.deepEqual(finding.model_finding,{status:'met',explanation:o.explanation});
 assert.equal(finding.resolution.source,'deterministic_evidence_gate');
 assert.equal(r.observations.find(x=>x.criterion_id==='branding').status,'met');
});
test('unresolved authority does not erase a reported violation or accept malformed evidence',()=>{
 const c=ctx('personal'),d=claimed(c),o=d.observations.find(x=>x.criterion_id==='product_fidelity');
 o.status='violated';o.explanation='The written ingredient conflicts with the supplied menu.';
 const r=validateVisualAudit(d,c);assert.equal(r.available,true);assert.equal(r.score,null);assert.equal(r.verdict,'flag');
 assert.equal(r.observations.find(x=>x.criterion_id==='product_fidelity').status,'violated');
 assert.ok(r.flags.some(x=>x.type==='photo'));assert.ok(r.flags.some(x=>x.type==='audit_uncertain'));
 d.observations.find(x=>x.criterion_id==='product_fidelity').evidence_anchor='invented';
 assert.equal(validateVisualAudit(d,c).available,false);
});
