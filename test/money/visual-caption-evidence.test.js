import {test} from 'node:test';import assert from 'node:assert/strict';
import {VERSION,CRITERIA,captionEvidenceChoices,visualAuditFormat,captionEvidencePrompt,validateVisualAudit} from '../../functions/_lib/visual_audit_rubric.js';
const caption='Cajitas, trays, or both?\n\nShare your city—we will confirm availability.';
const ctx={caption,slideCount:2,brandText:'Approved brand',brandReceipt:{read_status:'ok'},trainingReceipt:{read_status:'ok',reads:{rules:'ok',examples:'empty'}},emblemReference:{verified:true,purpose:'visual_consistency_only'}};
const data=()=>({rubric_version:VERSION,observations:CRITERIA.map(c=>({criterion_id:c.id,status:'met',caption_quote:'',slides:[1],explanation:'Visible evidence matches criterion.'})),suggestions:[]});
test('dynamic grammar contains only verbatim caption lines, never overlay or paraphrase',()=>{
 const choices=captionEvidenceChoices(caption);assert.deepEqual(choices,['','Cajitas, trays, or both?','Share your city—we will confirm availability.']);assert.ok(!choices.includes('CATERING BY AÑEJO'));assert.ok(choices.every(q=>caption.includes(q)));
 assert.deepEqual(visualAuditFormat(caption).schema.properties.observations.items.properties.caption_quote.enum,choices);
 assert.match(captionEvidencePrompt(caption,'CATERING BY AÑEJO'),/IMAGE BRIEF — internal art direction, never caption evidence/);
});
test('overlay in caption field remains rejected even with valid slide; bounded actionable diagnostic',()=>{
 const d=data();d.observations[0].caption_quote='CATERING BY AÑEJO';const r=validateVisualAudit(d,ctx);assert.equal(r.available,false);assert.equal(r.verdict,'flag');assert.equal(r.diagnostic.criterion_id,'branding');assert.equal(r.diagnostic.quote,'CATERING BY AÑEJO');assert.equal(r.diagnostic.field,'caption_quote');assert.deepEqual(r.diagnostic.slides,[1]);
 d.observations[0].caption_quote='z'.repeat(1000);assert.equal(validateVisualAudit(d,ctx).diagnostic.quote.length,300);
});
test('real caption evidence and distinct visual observation pass structural checks, invented paraphrase fails',()=>{
 const d=data();d.observations[0].explanation='Slide 1 visibly contains an emblem and the text CATERING BY AÑEJO.';d.observations[5].caption_quote='Share your city—we will confirm availability.';assert.equal(validateVisualAudit(d,ctx).available,true);
 d.observations[5].caption_quote='We deliver to your city.';assert.equal(validateVisualAudit(d,ctx).available,false);
});
