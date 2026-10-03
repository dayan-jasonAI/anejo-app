import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writtenClaimRequest,applyWrittenAssessments} from '../../functions/_lib/written_claim_audit.js';
const authority={menuText:'Grape, ham, guava, cheese & pineapple skewer ($3.00)\n',brandText:'Owner supports catering trays.',trainingText:''};
const claim={source:'registered_overlay',caption_line:0,slide:1,quote:'Grazing skewers',claim_id:'pc_scope',assessment:'unresolved',authority_refs:['menu:0']};
const images=[{data:'PRIVATE_IMAGE_BYTES',sourceReceipt:{design_facts:{rendered_text:[{text:claim.quote,product_claim_id:claim.claim_id,claim_kind:'product_category'}]}}}];
const data=()=>({product_evidence:{scope:'explicit_claims',claims:[claim],unreadable_slides:[]},observations:{branding:{status:'unknown',explanation:'Cannot verify the emblem.'},product_fidelity:{status:'unknown',explanation:'Inferred photographic ingredients differ.'}}});
const answer=(assessment='supported',kind='product_category',refs=['menu:0'],coverage=['overlay:1:0'])=>({non_assertions:[],omitted_claims:[],source_coverage:coverage,assessments:[{id:'claim:0',claim_kind:kind,assessment,authority_refs:refs}]});
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
 ['missing',{non_assertions:[],assessments:[],omitted_claims:[],source_coverage:['overlay:1:0']},'missing_or_extra_assessments'],
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
 const response={non_assertions:[],assessments:[],source_coverage:['caption:1'],omitted_claims:[{source_id:'caption:1',quote:'No pineapple.',claim_kind:'ingredient',assessment:'contradicted',authority_refs:['menu:0']}]};
 const result=applyWrittenAssessments(input,response,[],context);
 assert.equal(result.ok,true);assert.equal(result.data.product_evidence.scope,'explicit_claims');assert.equal(result.data.observations.product_fidelity.status,'violated');
 const bad={...response,omitted_claims:[{...response.omitted_claims[0],quote:'Invented'}]};assert.equal(applyWrittenAssessments(input,bad,[],context).issue,'unsupported_additional_claim');
});

const operationalAuthority={menuText:'Cajita de Añejo\n',brandText:'Owner-approved service: Catering trays are available.\nOwner-approved customization: Choose your tray size.\nOwner-approved ordering: Order through our website.\n',trainingText:''};
function operationalCase(quote,kind,assessment='supported',refs=['brand:0']){
 const input=data();input.product_evidence={scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]};
 const context={...operationalAuthority,caption:quote};
 const response={non_assertions:[],assessments:[],source_coverage:['caption:1'],omitted_claims:[{source_id:'caption:1',quote,claim_kind:kind,assessment,authority_refs:refs}]};
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

function nonassertionCase(caption,quote=caption,reason='tagline'){
 const input=data();input.product_evidence={scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]};
 const context={...authority,caption};
 const response={non_assertions:[{source_id:'caption:1',quote,reason}],assessments:[],omitted_claims:[],source_coverage:['caption:1']};
 return {input,context,response,result:applyWrittenAssessments(input,response,[],context)};
}
test('decorative scope produces a bounded model disposition receipt without a supported claim',()=>{
 const {result}=nonassertionCase('Made for your moment.');
 assert.equal(result.ok,true);assert.deepEqual(result.data.product_evidence.claims,[]);
 assert.deepEqual(result.receipt.non_assertions,[{source_id:'caption:1',quote:'Made for your moment.',reason:'tagline'}]);
 assert.match(result.receipt.limits[0],/nonassertion dispositions.*model judgments/);
});
for(const [quote,reason] of [['#WestPalmBeach #CateringCubano','hashtag_only'],['¿Celebras en West Palm Beach? Cuéntanos tu ciudad para confirmar disponibilidad.','conditional_question'],['Cajitas and trays','generic_format']])test('source-bound '+reason+' disposition remains inspectable',()=>assert.equal(nonassertionCase(quote,quote,reason).result.ok,true));
for(const [name,mutate,issue] of [
 ['wrong source',r=>r.non_assertions[0].source_id='caption:99','unsupported_non_assertion'],
 ['invented quote',r=>r.non_assertions[0].quote='Invented','unsupported_non_assertion'],
 ['duplicate',r=>r.non_assertions.push({...r.non_assertions[0]}),'duplicate_or_overlapping_non_assertion'],
 ['unknown reason',r=>r.non_assertions[0].reason='ignore','invalid_non_assertion'],
 ['missing coverage',r=>r.source_coverage=[],'incomplete_written_source_coverage'],
 ['extra field',r=>r.non_assertions[0].supported=true,'invalid_non_assertion']
])test('nonassertion '+name+' rejects',()=>{const {input,context,response}=nonassertionCase('Made for your moment.');mutate(response);assert.equal(applyWrittenAssessments(input,response,[],context).issue,issue);});
for(const quote of ['No pineapple.','Six pieces, 48 hours.','We deliver tomorrow.','Contains peanuts.','#FreeDelivery','#Price10'])test('nonassertion cannot conceal protected wording '+quote,()=>assert.equal(nonassertionCase(quote,quote,quote.startsWith('#')?'hashtag_only':'tagline').result.issue,'protected_non_assertion_wording'));
test('hashtag disposition cannot conceal prose or punctuation',()=>assert.equal(nonassertionCase('#WestPalmBeach and a celebration','#WestPalmBeach and a celebration','hashtag_only').result.issue,'invalid_hashtag_non_assertion'));
test('mandatory exact-byte declarations cannot receive nonassertion dispositions',()=>{
 const response={...answer(),non_assertions:[{source_id:'overlay:1:0',quote:claim.quote,reason:'generic_format'}]};
 assert.equal(applyWrittenAssessments(data(),response,images,authority).issue,'mandatory_claim_non_assertion');
});
test('existing unclassified candidates cannot silently disappear through dispositions',()=>{
 const input=data();input.product_evidence.claims=[{...claim,source:'caption',caption_line:1,slide:0,claim_id:'',quote:'Made for your moment.'}];
 const response={...answer('unresolved','unclassified',[],['caption:1']),non_assertions:[{source_id:'caption:1',quote:'Made for your moment.',reason:'tagline'}]};
 assert.equal(applyWrittenAssessments(input,response,[],{...authority,caption:'Made for your moment.'}).issue,'claim_non_assertion_overlap');
});
test('a nonassertion span cannot overlap a newly discovered factual claim',()=>{
 const {input,context,response}=nonassertionCase('Made for your moment.');response.omitted_claims=[{source_id:'caption:1',quote:'your moment',claim_kind:'service',assessment:'unresolved',authority_refs:[]}];
 assert.equal(applyWrittenAssessments(input,response,[],context).issue,'claim_non_assertion_overlap');
});
test('decorative sentence does not erase an adjoining unresolved service claim',()=>{
 const {input,context,response}=nonassertionCase('Made for your moment. Delivery is included.','Made for your moment.');
 response.omitted_claims=[{source_id:'caption:1',quote:'Delivery is included.',claim_kind:'service',assessment:'unresolved',authority_refs:[]}];
 const result=applyWrittenAssessments(input,response,[],context);assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,'unknown');assert.equal(result.data.product_evidence.claims[0].quote,'Delivery is included.');
});
test('new schema requires scope receipts without weakening existing coverage',()=>{
 const request=writtenClaimRequest(data(),images,authority),schema=request.output_config.format.schema;
 assert.ok(schema.required.includes('non_assertions'));assert.deepEqual(schema.properties.non_assertions.items.properties.reason.enum,['tagline','hashtag_only','conditional_question','generic_format']);
 assert.match(request.system,/Inspect full surrounding source text/);assert.match(request.system,/Negation, ingredients, quantities/);
});

test('unregistered exact and partial overlay candidates resolve unique source without inheriting reviewed scope',()=>{
 for(const quote of ['Standard orders need advance planning.','advance planning']){
  const input=data();input.product_evidence.claims=[{...claim,claim_id:'',quote}];
  const image=[{sourceReceipt:{design_facts:{rendered_text:[{text:'Standard orders need advance planning.',product_claim_id:'pc_timing',claim_kind:'ordering'}]}}}];
  const c=JSON.parse(writtenClaimRequest(input,image,authority).messages[0].content).claims[0];
  assert.equal(c.source_id,'overlay:1:0');assert.equal(c.claim_kind,'unclassified');assert.equal(c.scope_basis,'requires_text_interpretation');
 }
});
test('ambiguous overlay substring does not invent a unique source',()=>{
 const input=data();input.product_evidence.claims=[{...claim,claim_id:'',quote:'trays'}];
 const image=[{sourceReceipt:{design_facts:{rendered_text:[{text:'Cajitas and trays'},{text:'Decorative trays'}]}}}];
 assert.equal(JSON.parse(writtenClaimRequest(input,image,authority).messages[0].content).claims[0].source_id,null);
});
test('adjoining ingredient negation remains unresolved while a decorative span is recorded',()=>{
 const {input,context,response}=nonassertionCase('Made for your moment. No peanuts.','Made for your moment.');
 response.omitted_claims=[{source_id:'caption:1',quote:'No peanuts.',claim_kind:'ingredient',assessment:'unresolved',authority_refs:[]}];
 const result=applyWrittenAssessments(input,response,[],context);assert.equal(result.ok,true);assert.equal(result.data.observations.product_fidelity.status,'unknown');assert.equal(result.data.product_evidence.claims[0].quote,'No peanuts.');
});
