import {test} from 'node:test';import assert from 'node:assert/strict';
import {VERSION,CRITERIA,captionEvidenceLines,visualAuditFormat,captionEvidencePrompt,validateVisualAudit} from '../../functions/_lib/visual_audit_rubric.js';
const caption='Individual Cajitas or trays for the table? You can plan a celebration around either—or both.\n\n  Share your city—we will confirm availability.  ';
const ctx={caption,slideCount:2,brandText:'Approved brand',brandReceipt:{read_status:'ok'},trainingReceipt:{read_status:'ok',reads:{rules:'ok',examples:'empty'}},emblemReference:{verified:true,purpose:'visual_consistency_only'}};
const data=()=>({rubric_version:VERSION,product_evidence:{scope:'format_only_or_no_claim',claims:[],unreadable_slides:[]},observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_line:0,slides:[1],explanation:'Visible evidence matches criterion.'})),suggestions:[]});
test('numeric caption contract resolves exact source casing and whitespace on server',()=>{
 const lines=captionEvidenceLines(caption);assert.deepEqual(lines.map(l=>l.id),[1,2]);
 const format=visualAuditFormat(caption,2).schema.properties.observations.items;
 assert.deepEqual(format.properties.caption_line,{type:'integer',enum:[0,1,2],description:'Select the supplied caption line ID; 0 means no caption evidence. Never output caption text.'});
 assert.equal(format.properties.caption_quote,undefined);assert.equal(format.additionalProperties,false);
 const d=data();d.observations[0].caption_line=1;d.observations[1].caption_line=2;
 const result=validateVisualAudit(d,ctx);assert.equal(result.available,true);assert.equal(result.observations[0].caption_quote,caption.split('\n')[0]);assert.equal(result.observations[1].caption_quote,lines[1].text);assert.equal(result.observations[0].caption_line,1);
 assert.ok(captionEvidencePrompt(caption,'overlay').includes(JSON.stringify(lines)));
});
test('model recopied caption cannot reintroduce observed Trays capitalization failure',()=>{
 const d=data();d.observations[0].caption_line=1;d.observations[0].caption_quote=caption.split('\n')[0].replace('trays','Trays');
 assert.equal(validateVisualAudit(d,ctx).reason,'invalid_observation');
 delete d.observations[0].caption_quote;assert.equal(validateVisualAudit(d,ctx).observations[0].caption_quote.includes('or trays'),true);
});
test('invalid caption IDs fail with bounded diagnostics, never normalize or fall back',()=>{
 for(const value of [-1,3,1.5,'1',null]){const d=data();d.observations[0].caption_line=value;const r=validateVisualAudit(d,ctx);assert.equal(r.available,false);assert.equal(r.diagnostic.field,'caption_line');assert.equal(r.diagnostic.issue,'invalid_number_or_range');}
 assert.deepEqual(visualAuditFormat('',1).schema.properties.observations.items.properties.caption_line.enum,[0]);
});
test('declared identifiers accept only exact case-insensitive tokens',()=>{
 const d=data();d.rubric_version=VERSION.toUpperCase();d.observations[0].criterion_id='Branding';d.observations[0].status='Met';
 const r=validateVisualAudit(d,ctx);assert.equal(r.available,true);assert.equal(r.observations[0].criterion_id,'branding');assert.equal(r.observations[0].status,'met');
 for(const value of [' met','met ','compliant']){d.observations[0].status=value;assert.equal(validateVisualAudit(d,ctx).available,false);}
 d.observations[0].status='met';d.observations[0].criterion_id='brand';assert.equal(validateVisualAudit(d,ctx).available,false);
});
test('schema bounds slide IDs without unsupported length constraints',()=>{const format=visualAuditFormat(caption,2);assert.deepEqual(format.schema.properties.observations.items.properties.slides.items.enum,[1,2]);assert.ok(!JSON.stringify(format).includes('maxLength'));assert.ok(!JSON.stringify(format).includes('maxItems'));});
