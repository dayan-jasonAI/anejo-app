import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visualAuditFormat,rubricPrompt} from '../../functions/_lib/visual_audit_rubric.js';
import {auditAuthorityReferences,resolveAuditAuthorityReferences} from '../../functions/_lib/audit_authority_refs.js';

test('references resolve exact supplied text with original offsets and source identity',()=>{
  const context={menuText:'Croquetas — pollo\r\nCongrí\n',brandText:'Real Añejo emblem',trainingText:'No fixed assortment.'};
  for(const ref of auditAuthorityReferences(context)) {
    const text=context[ref.source==='menu'?'menuText':ref.source==='brand'?'brandText':'trainingText'];
    assert.equal(text.slice(ref.offset,ref.offset+ref.quote.length),ref.quote);
    assert.deepEqual(resolveAuditAuthorityReferences([ref.id],context).citations,[ref]);
  }
});
test('long source rows remain bounded without losing any source characters',()=>{
  const menuText='a'.repeat(399)+'😀'+'b'.repeat(450);
  const refs=auditAuthorityReferences({menuText});
  assert.equal(refs.map(ref=>ref.quote).join(''),menuText);
  assert.ok(refs.every(ref=>ref.quote.length<=400));
});
test('invented, duplicate, excessive and malformed references fail closed',()=>{
  const context={menuText:'Croquetas'};
  for(const ids of [['menu:99'],['menu:0','menu:0'],Array(9).fill('menu:0'),null,[1],['brand:0']])assert.equal(resolveAuditAuthorityReferences(ids,context).ok,false);
});
test('no citation means unresolved; selecting a citation never asserts semantic support',()=>{
  assert.deepEqual(resolveAuditAuthorityReferences([],{}),{ok:true,citations:[],unresolved:true});
  const result=resolveAuditAuthorityReferences(['menu:0'],{menuText:'No shrimp available.'});
  assert.equal(result.ok,true);assert.equal(result.citations[0].quote,'No shrimp available.');
  assert.equal(Object.hasOwn(result,'met'),false);assert.equal(Object.hasOwn(result,'score'),false);
});

test('provider schema and prompt use the same supplied authority IDs',()=>{
 const context={menuText:'Menu source.',brandText:'Brand source.',trainingText:'Owner source.'};
 const claims=visualAuditFormat('Caption',1,context).schema.properties.product_evidence.properties.claims.items;
 assert.ok(claims.required.includes('authority_refs'));
 assert.equal(Object.hasOwn(claims.properties,'authority_quote'),false);
 assert.deepEqual(claims.properties.authority_refs.items.enum,auditAuthorityReferences(context).map(ref=>ref.id));
 const prompt=rubricPrompt(context);
 for(const ref of auditAuthorityReferences(context))assert.ok(prompt.includes(JSON.stringify(ref)));
});
