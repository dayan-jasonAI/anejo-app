import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writtenClaimRequest,applyWrittenAssessments} from '../../functions/_lib/written_claim_audit.js';
const authority={menuText:'Grape, ham, guava, cheese & pineapple skewer ($3.00)\n',brandText:'Owner supports catering trays.',trainingText:''};
const claim={source:'registered_overlay',caption_line:0,slide:1,quote:'Grazing skewers',claim_id:'pc_scope',assessment:'unresolved',authority_refs:['menu:0']};
const images=[{data:'PRIVATE_IMAGE_BYTES',sourceReceipt:{design_facts:{rendered_text:[{text:claim.quote,product_claim_id:claim.claim_id,claim_kind:'product_category'}]}}}];
const data=()=>({product_evidence:{scope:'explicit_claims',claims:[claim],unreadable_slides:[]},observations:{branding:{status:'unknown',explanation:'Cannot verify the emblem.'},product_fidelity:{status:'unknown',explanation:'Inferred photographic ingredients differ.'}}});
const answer=(assessment='supported',kind='product_category',refs=['menu:0'])=>({assessments:[{id:'claim:0',claim_kind:kind,assessment,authority_refs:refs}]});
test('actual authority request contains words and references only, no imagery or multimodal findings',()=>{
 const input=data();input.image_brief='PRIVATE_ART_DIRECTION';
 const request=writtenClaimRequest(input,images,authority),text=JSON.stringify(request);
 assert.ok(!text.includes('PRIVATE_IMAGE_BYTES'));assert.ok(!text.includes('PRIVATE_ART_DIRECTION'));assert.ok(!text.includes('Inferred photographic ingredients'));
 const content=JSON.parse(request.messages[0].content);assert.deepEqual(content.claims,[{id:'claim:0',source:'registered_overlay',wording:'Grazing skewers',claim_kind:'product_category',scope_basis:'reviewed_exact_byte_declaration'}]);
 assert.ok(content.authority_references.some(r=>r.id==='menu:0'));assert.equal(request.output_config.format.schema.additionalProperties,false);
});
test('dedicated product finding retains other uncertain visual findings unchanged',()=>{
 const input=data(),result=applyWrittenAssessments(input,answer(),images,authority);
 assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,'met');
 assert.deepEqual(result.data.observations.branding,input.observations.branding);assert.equal(input.observations.product_fidelity.status,'unknown');
 assert.equal(result.receipt.method,'words_only_authority_review');
});
for(const assessment of ['unresolved','contradicted'])test('text authority '+assessment+' cannot be upgraded',()=>{
 const result=applyWrittenAssessments(data(),answer(assessment),images,authority);assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,assessment==='unresolved'?'unknown':'violated');
});
test('unreadable wording remains unknown even with source support',()=>{
 const input=data();input.product_evidence.unreadable_slides=[1];const result=applyWrittenAssessments(input,answer(),images,authority);assert.equal(result.data.observations.product_fidelity.status,'unknown');
});
for(const kind of ['ingredient','quantity','named_product','exact_photo_assortment'])test('cannot expand reviewed category scope into '+kind,()=>{
 assert.equal(applyWrittenAssessments(data(),answer('supported',kind),images,authority).issue,'reviewed_scope_mismatch');
});
for(const [name,value,issue] of [
 ['missing',{assessments:[]},'missing_or_extra_assessments'],
 ['duplicate',{assessments:[...answer().assessments,...answer().assessments]},'missing_or_extra_assessments'],
 ['invented',{assessments:[{...answer().assessments[0],id:'claim:99'}]},'unknown_claim'],
 ['extra',{...answer(),explanation:'guess'},'missing_or_extra_assessments'],
 ['fake ref',answer('supported','product_category',['menu:999']),'unknown_authority_ref'],
 ['missing support',answer('supported','product_category',[]),'assessment_missing_authority']
])test(name+' evidence rejects instead of fabricating support',()=>assert.equal(applyWrittenAssessments(data(),value,images,authority).issue,issue));
test('unregistered future wording has no reviewed scope credit',()=>{
 const request=writtenClaimRequest(data(),[],authority);assert.equal(JSON.parse(request.messages[0].content).claims[0].scope_basis,'requires_text_interpretation');
 assert.equal(applyWrittenAssessments(data(),answer('supported','unclassified'),[],authority).issue,'unclassified_scope');
});
test('explicit exact-photo promise stays unresolved in a words-only review',()=>{
 const photo=[{sourceReceipt:{design_facts:{rendered_text:[{text:claim.quote,product_claim_id:claim.claim_id,claim_kind:'exact_photo_assortment'}]}}}];
 assert.equal(applyWrittenAssessments(data(),answer('supported','exact_photo_assortment'),photo,authority).issue,'photo_correspondence_unverified');
 assert.equal(applyWrittenAssessments(data(),answer('unresolved','exact_photo_assortment'),photo,authority).data.observations.product_fidelity.status,'unknown');
});
