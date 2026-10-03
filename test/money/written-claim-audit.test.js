import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writtenClaimRequest,applyWrittenAssessments} from '../../functions/_lib/written_claim_audit.js';
const authority={menuText:'Grape, ham, guava, cheese & pineapple skewer ($3.00)\n',brandText:'Owner supports catering trays.',trainingText:''};
const claim={source:'registered_overlay',caption_line:0,slide:1,quote:'Grazing skewers',claim_id:'pc_scope',assessment:'unresolved',authority_refs:['menu:0']};
const images=[{data:'PRIVATE_IMAGE_BYTES',sourceReceipt:{design_facts:{rendered_text:[{text:claim.quote,product_claim_id:claim.claim_id,claim_kind:'product_category'}]}}}];
const data=()=>({product_evidence:{scope:'explicit_claims',claims:[claim],unreadable_slides:[]},observations:{branding:{status:'unknown',explanation:'Cannot verify the emblem.'},product_fidelity:{status:'unknown',explanation:'Inferred photographic ingredients differ.'}}});
const answer=(assessment='supported',kind='product_category',refs=['menu:0'],coverage=['overlay:1:0'])=>({omitted_claims:[],source_coverage:coverage,assessments:[{id:'claim:0',claim_kind:kind,assessment,authority_refs:refs}]});
test('actual authority request contains words and references only, no imagery or multimodal findings',()=>{
 const input=data();input.image_brief='PRIVATE_ART_DIRECTION';
 const request=writtenClaimRequest(input,images,authority),text=JSON.stringify(request);
 assert.ok(!text.includes('PRIVATE_IMAGE_BYTES'));assert.ok(!text.includes('PRIVATE_ART_DIRECTION'));assert.ok(!text.includes('Inferred photographic ingredients'));
 const content=JSON.parse(request.messages[0].content);assert.deepEqual(content.claims,[{id:'claim:0',source:'registered_overlay',source_id:'overlay:1:0',slide:1,caption_line:0,wording:'Grazing skewers',claim_kind:'product_category',scope_basis:'reviewed_exact_byte_declaration'}]);
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
for(const kind of ['ingredient','quantity','named_product','service','customization','ordering','exact_photo_assortment'])test('cannot expand reviewed category scope into '+kind,()=>{
 assert.equal(applyWrittenAssessments(data(),answer('supported',kind),images,authority).issue,'reviewed_scope_mismatch');
});
for(const [name,value,issue] of [
 ['missing',{assessments:[],omitted_claims:[],source_coverage:['overlay:1:0']},'missing_or_extra_assessments'],
 ['duplicate',{...answer(),assessments:[...answer().assessments,...answer().assessments]},'missing_or_extra_assessments'],
 ['invented',{...answer(),assessments:[{...answer().assessments[0],id:'claim:99'}]},'unknown_claim'],
 ['extra',{...answer(),explanation:'guess'},'missing_or_extra_assessments'],
 ['fake ref',answer('supported','product_category',['menu:999']),'unknown_authority_ref'],
 ['missing support',answer('supported','product_category',[]),'assessment_missing_authority']
])test(name+' evidence rejects instead of fabricating support',()=>assert.equal(applyWrittenAssessments(data(),value,images,authority).issue,issue));
test('unregistered future wording has no reviewed scope credit',()=>{
 const request=writtenClaimRequest(data(),[],authority);assert.equal(JSON.parse(request.messages[0].content).claims[0].scope_basis,'requires_text_interpretation');
 assert.equal(applyWrittenAssessments(data(),answer('supported','unclassified',['menu:0'],[]),[],authority).issue,'unclassified_scope');
});
test('explicit exact-photo promise stays unresolved in a words-only review',()=>{
 const photo=[{sourceReceipt:{design_facts:{rendered_text:[{text:claim.quote,product_claim_id:claim.claim_id,claim_kind:'exact_photo_assortment'}]}}}];
 assert.equal(applyWrittenAssessments(data(),answer('supported','exact_photo_assortment'),photo,authority).issue,'photo_correspondence_unverified');
 assert.equal(applyWrittenAssessments(data(),answer('unresolved','exact_photo_assortment'),photo,authority).data.observations.product_fidelity.status,'unknown');
});

test('full caption and adjacent overlay wording reach the independent reviewer without substring loss',()=>{
 const context={...authority,caption:'The photograph shows this exact Grazing skewers assortment. No pineapple.'};
 const adjacent=[{...images[0],sourceReceipt:{design_facts:{rendered_text:[...images[0].sourceReceipt.design_facts.rendered_text,{text:'Exactly what is in your tray.'}]}}}];
 const request=writtenClaimRequest(data(),adjacent,context),input=JSON.parse(request.messages[0].content);
 assert.equal(input.written_sources[0].wording,context.caption);assert.equal(input.written_sources[2].wording,'Exactly what is in your tray.');
 assert.equal(applyWrittenAssessments(data(),answer(),adjacent,context).issue,'incomplete_written_source_coverage');
});
test('independent exact-photo qualifier omitted by visual candidate remains unknown',()=>{
 const context={...authority,caption:'The photograph shows this exact assortment.'};
 const response={...answer(),source_coverage:['caption:1','overlay:1:0'],omitted_claims:[{source_id:'caption:1',quote:context.caption,claim_kind:'exact_photo_assortment',assessment:'unresolved',authority_refs:[]}]};
 const result=applyWrittenAssessments(data(),response,images,context);
 assert.equal(result.ok,true);assert.equal(result.data.product_evidence.claims.length,2);assert.equal(result.data.observations.product_fidelity.status,'unknown');
 assert.equal(result.receipt.superseded_multimodal_candidate.explanation,'Inferred photographic ingredients differ.');
});
test('zero candidate claims does not remove written source coverage or newly discovered claims',()=>{
 const context={...authority,caption:'No pineapple.'},input=data();input.product_evidence={scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]};
 const response={assessments:[],source_coverage:['caption:1'],omitted_claims:[{source_id:'caption:1',quote:'No pineapple.',claim_kind:'ingredient',assessment:'contradicted',authority_refs:['menu:0']}]};
 const result=applyWrittenAssessments(input,response,[],context);
 assert.equal(result.ok,true);assert.equal(result.data.product_evidence.scope,'explicit_claims');assert.equal(result.data.observations.product_fidelity.status,'violated');
 const bad={...response,omitted_claims:[{...response.omitted_claims[0],quote:'Invented'}]};assert.equal(applyWrittenAssessments(input,bad,[],context).issue,'unsupported_additional_claim');
});

const operationalAuthority={menuText:'Cajita de Añejo\n',brandText:'Owner-approved service: Catering trays are available.\nOwner-approved customization: Choose your tray size.\nOwner-approved ordering: Order through our website.\n',trainingText:''};
function operationalCase(quote,kind,assessment='supported',refs=['brand:0']){
 const input=data();input.product_evidence={scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]};
 const context={...operationalAuthority,caption:quote};
 const response={assessments:[],source_coverage:['caption:1'],omitted_claims:[{source_id:'caption:1',quote,claim_kind:kind,assessment,authority_refs:refs}]};
 return {input,context,response,result:applyWrittenAssessments(input,response,[],context)};
}
test('explicit operational kinds reach words-only schema with evidence requirements and no automatic generic classification',()=>{
 const request=writtenClaimRequest(data(),images,operationalAuthority);
 const kinds=request.output_config.format.schema.properties.assessments.items.properties.claim_kind.enum;
 for(const kind of ['service','customization','ordering'])assert.ok(kinds.includes(kind));
 assert.match(request.system,/actual supplied owner\/brand\/menu authority/);
 assert.match(request.system,/do not automatically label slogans or vague wording/);
 assert.match(request.system,/A citation does not prove entailment/);
});
for(const [kind,quote,ref] of [
 ['service','Catering trays are available.','brand:0'],
 ['customization','Choose your tray size.','brand:54'],
 ['ordering','Order through our website.','brand:107']
])test(kind+' supports explicit wording with a real authority reference',()=>{
 const {result}=operationalCase(quote,kind,'supported',[ref]);
 assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,'met');
 assert.deepEqual(result.data.product_evidence.claims[0].authority_refs,[ref]);
 assert.equal(result.receipt.scopes[0].claim_kind,kind);
});
test('service contradiction remains violated and missing service evidence remains unknown',()=>{
 const contradiction=operationalCase('Catering trays are unavailable.','service','contradicted');
 assert.equal(contradiction.result.ok,true);assert.equal(contradiction.result.data.observations.product_fidelity.status,'violated');
 const missing=operationalCase('Delivery is included.','service','unresolved',[]);
 assert.equal(missing.result.ok,true);assert.equal(missing.result.data.observations.product_fidelity.status,'unknown');
});
test('service supported without a reference rejects with the exact offending source',()=>{
 const {result}=operationalCase('Delivery is included.','service','supported',[]);
 assert.equal(result.ok,false);assert.equal(result.issue,'assessment_missing_authority');
 assert.deepEqual(result.diagnostic,{id:'claim:0',source:'caption',source_id:'caption:1',slide:0,caption_line:1,quote:'Delivery is included.',quote_truncated:false,claim_kind:'service',assessment:'supported',authority_refs:[],citations:[]});
});
test('service cannot use an invented authority reference',()=>{
 const {result}=operationalCase('Catering trays are available.','service','supported',['brand:999']);
 assert.equal(result.ok,false);assert.equal(result.issue,'unknown_authority_ref');
 assert.equal(result.diagnostic.quote,'Catering trays are available.');assert.deepEqual(result.diagnostic.citations,[]);
});
for(const assessment of ['supported','contradicted'])test('unclassified '+assessment+' rejection retains wording and selected evidence',()=>{
 const {result}=operationalCase('Made for your moment.','unclassified',assessment);
 assert.equal(result.ok,false);assert.equal(result.issue,'unclassified_scope');
 assert.equal(result.diagnostic.quote,'Made for your moment.');assert.equal(result.diagnostic.id,'claim:0');
 assert.equal(result.diagnostic.source_id,'caption:1');assert.equal(result.diagnostic.source,'caption');
 assert.equal(result.diagnostic.claim_kind,'unclassified');assert.equal(result.diagnostic.assessment,assessment);
 assert.deepEqual(result.diagnostic.authority_refs,['brand:0']);
 assert.equal(result.diagnostic.citations[0].quote,'Owner-approved service: Catering trays are available.\n');
});
test('generic unclassified wording cannot be upgraded by a service authority reference',()=>{
 const {result}=operationalCase('Made for your moment.','unclassified','unresolved',['brand:0']);
 assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,'unknown');
});
test('diagnostic bounds long claim and authority excerpts without retaining provider or image bodies',()=>{
 const input=data();input.product_evidence.claims=[{...claim,quote:'Q'.repeat(10000)}];
 const context={...authority,brandText:'B'.repeat(5000)};
 const image=[{data:'PRIVATE_IMAGE_BYTES',sourceReceipt:{design_facts:{rendered_text:[{text:input.product_evidence.claims[0].quote,product_claim_id:claim.claim_id}]}}}];
 const response=answer('supported','unclassified',Array.from({length:8},(_,i)=>'brand:'+i*400));
 const result=applyWrittenAssessments(input,response,image,context);
 assert.equal(result.issue,'unclassified_scope');assert.equal(result.diagnostic.quote.length,250);assert.equal(result.diagnostic.quote_truncated,true);
 assert.equal(result.diagnostic.citations.length,3);assert.ok(result.diagnostic.citations.every(c=>c.quote.length===160&&c.quote_truncated));
 assert.equal(result.diagnostic.source_id,'overlay:1:0');assert.equal(result.diagnostic.slide,1);
 assert.ok(JSON.stringify(result).length<1800);assert.ok(!JSON.stringify(result).includes('PRIVATE_IMAGE_BYTES'));
});
