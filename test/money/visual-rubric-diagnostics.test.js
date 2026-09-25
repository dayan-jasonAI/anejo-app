import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VERSION,CRITERIA,validateVisualAudit,visualAuditFormat,rubricPrompt} from '../../functions/_lib/visual_audit_rubric.js';
const ctx={caption:'Catering',slideCount:1,brandText:'Brand',brandReceipt:{read_status:'ok'},trainingReceipt:{read_status:'empty'},emblemReference:{verified:true,purpose:'visual_consistency_only'}};
const valid=()=>({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_line:0,slides:[1],explanation:'Visible evidence.'})),suggestions:[]});
const cases=[
 ['null',()=>null,{field:'response',issue:'not_object',type:'null'}],
 ['array',()=>[],{field:'response',issue:'not_object',type:'array'}],
 ...['rubric_version','observations','suggestions'].map(field=>['missing '+field,d=>{delete d[field];return d;},{field,issue:'missing'}]),
 ['extra fields',d=>({...d,'secret-key-value':'private model text'}),{field:'response',issue:'unexpected_fields',count:1}],
 ['version type',d=>({...d,rubric_version:123}),{field:'rubric_version',issue:'not_string',type:'number'}],
 ['version value',d=>({...d,rubric_version:'private model text'}),{field:'rubric_version',issue:'unsupported_value'}],
 ['observation type',d=>({...d,observations:'private model text'}),{field:'observations',issue:'not_array',type:'string'}],
 ['observation count',d=>({...d,observations:[]}),{field:'observations',issue:'wrong_count',count:0,expected:CRITERIA.length}],
 ['suggestion type',d=>({...d,suggestions:{private:'model text'}}),{field:'suggestions',issue:'not_array',type:'object'}],
 ['suggestion count',d=>({...d,suggestions:['a','b','c','d']}),{field:'suggestions',issue:'too_many',count:4,max:3}],
 ['suggestion item type',d=>({...d,suggestions:[null]}),{field:'suggestions',issue:'item_not_string',index:0,type:'null'}],
 ['suggestion item length',d=>({...d,suggestions:['x'.repeat(401)]}),{field:'suggestions',issue:'item_too_long',index:0,length:401,max:400}],
];
for(const [name,mutate,expected] of cases)test('top-level diagnostic: '+name,()=>{
 const r=validateVisualAudit(mutate(valid()),ctx);assert.equal(r.available,false);assert.equal(r.score,null);assert.equal(r.verdict,'flag');assert.deepEqual(r.diagnostic,{reason:'invalid_rubric_response',...expected});assert.doesNotMatch(JSON.stringify(r.diagnostic),/secret-key-value|private model text|xxxx/);
});
test('valid maximum suggestions remain intact; schema instructions mirror mandatory bounds',()=>{
 const d=valid();d.suggestions=Array.from({length:3},()=> 'x'.repeat(400));
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,true);assert.equal(r.score,100);assert.deepEqual(r.suggestions,d.suggestions);
 const suggestions=visualAuditFormat('Catering',1).schema.properties.suggestions;
 assert.match(suggestions.description,/At most 3/);assert.match(suggestions.items.description,/400 characters/);assert.match(rubricPrompt(),/each at most 400 characters/);
 assert.doesNotMatch(JSON.stringify(visualAuditFormat('',1)),/maxItems|maxLength/);
});

test('missing artifact evidence identifies rejected criterion without accepting or leaking text',()=>{
 const d=valid();const o=d.observations.find(o=>o.criterion_id==='product_fidelity');o.slides=[];o.explanation='private model text';
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,false);assert.equal(r.score,null);
 assert.deepEqual(r.diagnostic,{reason:'missing_artifact_evidence',criterion_id:'product_fidelity',status:'met',field:'caption_line/slides',issue:'both_empty'});
 assert.doesNotMatch(JSON.stringify(r.diagnostic),/private model text/);
 assert.match(visualAuditFormat('Catering',1).schema.properties.observations.items.properties.slides.description,/nonempty slides/);
 assert.match(rubricPrompt(),/Empty claims does NOT mean empty observation evidence/);
});
