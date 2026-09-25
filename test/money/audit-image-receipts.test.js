import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadAuditImages,verifyAuditImageReceipts} from '../../functions/_lib/social_audit.js';
const root=new URL('../../docs/marketing/cajita-social-2026-09-17/revision-3/slides/',import.meta.url);
const photo=readFileSync(new URL('choice-02.jpg',root));
const cta=readFileSync(new URL('personal-10.jpg',root));
const snapshot=JSON.stringify(['photo',8,'marketing-library/renamed.jpg'])+','+JSON.stringify(['cta',11,'studio/another.jpg']);
function envFor(bytes=[photo,cta]){return {MEDIA:{get:async key=>{const value=bytes[key.startsWith('marketing-library')?0:1];return {size:value.length,arrayBuffer:async()=>Uint8Array.from(value).buffer};}}};}
test('registry selection uses actual bytes and emits current order instead of original filenames',async()=>{
 const images=await loadAuditImages(envFor(),snapshot);
 assert.match(images[0].sourceReceipt.design_facts.file,/choice-02.jpg$/);
 assert.equal(images[0].sourceReceipt.media_id,'photo');assert.equal(images[0].sourceReceipt.seq,8);
 assert.ok(images[0].sourceReceipt.design_facts.emblem.rectangle.y>900);
 assert.ok(images[1].sourceReceipt.design_facts.rendered_text.some(x=>/CAJITA/.test(x.text)));
 const detail={input_coverage:{slide_sources:images.map((image,index)=>({slide:index+1,...image.sourceReceipt}))}};
 assert.equal(await verifyAuditImageReceipts(envFor(),snapshot,JSON.stringify(detail)),true);
 const swapped=JSON.parse('['+snapshot+']').reverse().map(row=>JSON.stringify(row)).join(',');
 assert.equal(await verifyAuditImageReceipts(envFor(),swapped,detail),false);
});
test('unknown or modified JPEG never inherits a known source declaration',async()=>{
 const altered=Buffer.from(photo);altered[100]^=1;
 const images=await loadAuditImages(envFor([altered,cta]),snapshot);
 assert.equal(images[0].sourceReceipt.design_facts,null);
 assert.ok(images[1].sourceReceipt.design_facts);
 const original=await loadAuditImages(envFor(),snapshot);
 const detail={input_coverage:{slide_sources:original.map((image,index)=>({slide:index+1,...image.sourceReceipt}))}};
 assert.equal(await verifyAuditImageReceipts(envFor([altered,cta]),snapshot,detail),false);
 assert.equal(await verifyAuditImageReceipts(envFor(),snapshot,{}),false);
 assert.equal(await verifyAuditImageReceipts(envFor(),snapshot,'not json'),false);
});
