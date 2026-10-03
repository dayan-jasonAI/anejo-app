import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildDesignFacts,moduleText} from '../../scripts/build-audit-design-facts.mjs';
import {DESIGN_FACTS_BY_SHA256 as registry,DESIGN_FACTS_VERSION} from '../../functions/_lib/audit_design_facts.generated.js';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const find=name=>Object.values(registry).find(r=>r.file.endsWith(name));
test('all 26 registry keys independently match actual JPEG bytes and generated module is deterministic',()=>{
 assert.equal(Object.keys(registry).length,26);assert.equal(DESIGN_FACTS_VERSION,'anejo-reviewed-design-facts-4');
 for(const [key,r] of Object.entries(registry)){const bytes=read(r.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),key);assert.equal(bytes.length,r.output.byte_length);assert.equal(key,r.output.sha256);assert.ok(Buffer.byteLength(JSON.stringify(r))<=8192);assert.ok(r.limits.some(s=>s.includes('not independent OCR')));}
 assert.equal(moduleText(buildDesignFacts()),read('functions/_lib/audit_design_facts.generated.js').toString());
});
test('photo words follow actual compose options; collage excludes unused manifest labels and detail',()=>{
 assert.deepEqual(find('gather-02.jpg').rendered_text.map(({role,text})=>({role,text})),[{role:'headline',text:'Croquetas'}]);
 const collage=find('gather-01.jpg');assert.deepEqual(collage.rendered_text,[{role:'eyebrow',text:'INTRODUCING AÑEJO CATERING'},{role:'headline',text:'A table worth gathering around.'}]);
 assert.ok(!JSON.stringify(collage.rendered_text).includes('Desliza'));
 assert.equal(find('gather-07.jpg').layout.text_rotation_degrees,-90);
 assert.equal(find('choice-01.jpg').emblem.rectangle.x,16.2);
 assert.equal(find('personal-09.jpg').layout.text_geometry,'unavailable_without_font_measurements');
 assert.ok(find('personal-09.jpg').rendered_text.some(w=>w.role==='row_body'));
});
test('changed image bytes or validation evidence cannot keep registered facts',()=>{
 assert.throws(()=>buildDesignFacts({read:path=>{const b=read(path);if(path.endsWith('slides/gather-02.jpg')){const c=Buffer.from(b);c[100]^=1;return c;}return b;}}),/Validation mismatch/);
 assert.throws(()=>buildDesignFacts({read:path=>{const b=read(path);if(path.endsWith('/validation.json')){const d=JSON.parse(b);d.files[0].sha256='a'.repeat(64);return Buffer.from(JSON.stringify(d));}return b;}}),/Validation mismatch/);
});
test('renderer drift, duplicate declarations and invalid geometry are rejected',()=>{
 for(const mode of ['renderer','duplicate','geometry'])assert.throws(()=>buildDesignFacts({read:path=>{
  const b=read(path);
  if(mode==='renderer'&&path.endsWith('marketing-branding.source.js'))return Buffer.concat([b,Buffer.from('changed')]);
  if(mode==='duplicate'&&path.endsWith('/manifest.json')){const d=JSON.parse(b);d.posts[0].slides.push(d.posts[0].slides[0]);return Buffer.from(JSON.stringify(d));}
  if(mode==='geometry'&&path.endsWith('gather-02.layout.json')){const d=JSON.parse(b);d.emblem.x=-1;return Buffer.from(JSON.stringify(d));}
  return b;
 }}),/Renderer changed|duplicate|geometry/);
});

test('reviewed wording scope remains bound to exact declared text and bytes',()=>{
 assert.equal(find('gather-05.jpg').rendered_text[0].claim_kind,'product_category');
 assert.equal(find('gather-07.jpg').rendered_text[0].claim_kind,'named_product');
 const personal=find('personal-09.jpg').rendered_text.filter(r=>r.product_claim_id);
 assert.deepEqual(personal.map(r=>r.claim_kind),['quantity','ingredient']);
 for(const record of Object.values(registry))for(const run of record.rendered_text)if(run.product_claim_id)assert.ok(['product_category','named_product','ingredient','quantity','ordering'].includes(run.claim_kind));
});

 test('reviewed operational timing remains an exact mandatory ordering declaration',()=>{
 const run=find('personal-10.jpg').rendered_text.find(w=>w.text==='Standard orders: at least 48 hours. Custom printing: at least 72 hours and a reviewed quote.');
 assert.equal(run.claim_kind,'ordering');assert.ok(run.product_claim_id);
 const changed=buildDesignFacts({read:path=>{const b=read(path);if(path.endsWith('/manifest.json')){const m=JSON.parse(b);for(const p of m.posts)for(const s of p.slides)if(s.file==='slides/personal-10.jpg')for(const row of s.rows)if(row[1]===run.text)row[1]='Standard orders: at least 24 hours.';return Buffer.from(JSON.stringify(m));}return b;}});
 const modified=Object.values(changed).find(r=>r.file.endsWith('personal-10.jpg')).rendered_text.find(w=>w.text==='Standard orders: at least 24 hours.');
 assert.equal(modified.claim_kind,undefined);assert.equal(modified.product_claim_id,undefined);
 });
