// Compile reviewed export declarations, never OCR or model interpretations.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const DIR='docs/marketing/cajita-social-2026-09-17/revision-3';
// The reviewed export uses its archived renderer, not whichever UI version ships today.
const RENDERER=DIR+'/marketing-branding.source.js';
const PINNED_RENDERER='251aebab81ea73d84e21dc5fa73e976ccdb9600272e4de91bbc1f49d53492f89';
const PINNED_PAGE='4cb6e57a7949493cf745d305a62e2023e3943d4dcc04f7c566f8dbe4270db1a7';
const EMBLEM='public/assets/img/emblem.png';
const EMBLEM_HASH='ee2072582d72f1cc2aadc21282dfc24bdce90d92bbf467a062defb6a5e799598';
export const DESIGN_FACTS_VERSION='anejo-reviewed-design-facts-2';
const hash=b=>createHash('sha256').update(b).digest('hex');
function jpegShape(b){
 if(b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217)throw Error('Invalid JPEG');
 let i=2;while(i+4<=b.length){if(b[i++]!==255)throw Error('Invalid JPEG marker');while(b[i]===255)i++;const m=b[i++];if(m===218||m===217)break;const n=b.readUInt16BE(i);if(n<2||i+n>b.length)throw Error('Invalid JPEG segment');if([192,193,194].includes(m)){if(n<8)throw Error('Invalid JPEG frame');return{width:b.readUInt16BE(i+5),height:b.readUInt16BE(i+3)};}i+=n;}
 throw Error('JPEG dimensions missing');
}
function rectangle(r,w,h){if(!r||!['x','y','w','h'].every(k=>Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>w+.001||r.y+r.h>h+.001)throw Error('Invalid frame geometry');return{x:r.x,y:r.y,w:r.w,h:r.h};}
const text=(role,value)=>{if(typeof value!=='string'||value.length>1800)throw Error('Invalid declared text');return{role,text:value};};
export function buildDesignFacts({read=path=>readFileSync(resolve(ROOT,path))}={}){
 const manifestBytes=read(DIR+'/manifest.json'),validationBytes=read(DIR+'/validation.json');
 const manifest=JSON.parse(manifestBytes),validation=JSON.parse(validationBytes);
 if(hash(read(RENDERER))!==PINNED_RENDERER||hash(read(DIR+'/render.html'))!==PINNED_PAGE)throw Error('Renderer changed: review compiler semantics before rebuilding');
 const emblem=read(EMBLEM);if(hash(emblem)!==EMBLEM_HASH)throw Error('Canonical emblem changed');
 const logoRatio=emblem.readUInt32BE(20)/emblem.readUInt32BE(16);
 const records=new Map();for(const record of validation.files){if(records.has(record.file))throw Error('Duplicate validation file');records.set(record.file,record);}
 const registry={},seen=new Set();
 for(const post of manifest.posts)for(const slide of post.slides){
  if(!/^slides\/(gather|personal|choice)-\d{2}\.jpg$/.test(slide.file)||seen.has(slide.file))throw Error('Unsupported or duplicate slide filename');seen.add(slide.file);
  const expected=records.get(slide.file),bytes=read(DIR+'/'+slide.file),sha=hash(bytes),shape=jpegShape(bytes);
  if(!expected||sha!==expected.sha256||bytes.length!==expected.bytes||shape.width!==expected.width||shape.height!==expected.height)throw Error('Validation mismatch: '+slide.file);
  if(registry[sha])throw Error('Duplicate output hash is ambiguous');
  const provenance={manifest_sha256:hash(manifestBytes),validation_sha256:hash(validationBytes),renderer_sha256:PINNED_RENDERER,render_page_sha256:PINNED_PAGE};
  let words=[],logo,layout;
  if(slide.kind==='photo'){
   const opts=slide.layout;if(!['reposado-square','reposado-dense','reposado-portrait','reposado-wide','reposado-cajita'].includes(opts?.preset)||!opts.textRegion||opts.mark)throw Error('Unsupported photo render path');
   const reportBytes=read(DIR+'/'+slide.file.replace('.jpg','.layout.json')),report=JSON.parse(reportBytes);
   if(report.width!==shape.width||report.height!==shape.height||report.preset!=='reposado'||report.templateId!==opts.preset)throw Error('Layout/output shape mismatch');
   provenance.layout_sha256=hash(reportBytes);
   const title=String(opts.text||'').replace(/\s+/g,' ').trim(),kicker=String(opts.kicker||'').trim().toUpperCase();
   if(title.length>80||kicker.length>50)throw Error('Editorial text exceeds renderer guard');
   if(title)words.push(text('headline',title));if(kicker)words.push(text('kicker',kicker));
   logo={source:EMBLEM,sha256:EMBLEM_HASH,rectangle:rectangle(report.emblem,shape.width,shape.height),ink:report.emblem.ink};
   layout={text_region:rectangle(report.text,shape.width,shape.height),text_rotation_degrees:opts.vertical?-90:0,geometry_source:'saved_renderer_layout_report'};
  }else if(slide.kind==='collage'){
   // render.html does not render manifest tile labels, detail or its title/eyebrow values.
   words=[text('eyebrow','INTRODUCING AÑEJO CATERING'),text('headline','A table worth gathering around.')];
   logo={source:EMBLEM,sha256:EMBLEM_HASH,rectangle:rectangle({x:953,y:938,w:75,h:75*logoRatio},shape.width,shape.height)};
   layout={geometry_source:'pinned_render_page_fixed_coordinates'};
  }else if(slide.kind==='details'){
   words=[text('eyebrow',slide.eyebrow),text('headline',slide.title.replace('\n',' '))];
   if(!Array.isArray(slide.rows)||slide.rows.length>12)throw Error('Invalid details rows');
   for(const row of slide.rows){if(!Array.isArray(row)||row.length!==2)throw Error('Invalid details row');words.push(text('row_heading',row[0]),text('row_body',row[1]));}
   words.push(text('detail',slide.detail));
   logo={source:EMBLEM,sha256:EMBLEM_HASH,rectangle:rectangle({x:950,y:30,w:65,h:65*logoRatio},shape.width,shape.height)};
   layout={geometry_source:'pinned_render_page_fixed_emblem_only',text_geometry:'unavailable_without_font_measurements'};
  }else throw Error('Unsupported slide kind');
  // Reviewed written product claims, not assertions that those words are accurate.
  // Collage tile labels are NOT rendered; generic La Cajita/format headlines are excluded.
  words=words.map((run,index)=>{
   const namedGather=/^slides\/gather-0[2-9]\.jpg$/.test(slide.file)&&run.role==='headline';
   const personalList=slide.file==='slides/personal-09.jpg'&&(run.text==='START WITH SIX / SEIS FAVORITOS'||run.text.startsWith('Hawaiian roll with ham spread;'));
   return namedGather||personalList?{...run,product_claim_id:'pc_'+sha+'_'+index}:run;
  });
  registry[sha]={source:'reviewed_revision3_export',file:DIR+'/'+slide.file,output:{sha256:sha,byte_length:bytes.length,...shape},rendered_text:words,emblem:logo,layout,provenance,
   limits:['Reviewed export declarations matched to exact output bytes; not independent OCR or a cryptographic render attestation.','Geometry does not prove visual legibility, lack of food obstruction, or semantic object identity.','No claim of food ingredients, photographic authenticity, owner publication approval or live Instagram pixel equivalence.']};
 }
 for(const entry of Object.values(registry))if(Buffer.byteLength(JSON.stringify(entry))>8192)throw Error('Design fact entry exceeds 8 KiB');
 if(Buffer.byteLength(JSON.stringify(registry))>131072)throw Error('Design fact registry exceeds 128 KiB');
 if(seen.size!==26||records.size!==seen.size)throw Error('Expected exactly all 26 reviewed exports');
 return registry;
}
export function moduleText(registry){return '// Generated by scripts/build-audit-design-facts.mjs. Reviewed declarations only; see per-entry limits.\nexport const DESIGN_FACTS_VERSION='+JSON.stringify(DESIGN_FACTS_VERSION)+';\nexport const DESIGN_FACTS_BY_SHA256='+JSON.stringify(registry,null,2)+';\n';}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=moduleText(buildDesignFacts()),target=resolve(ROOT,'functions/_lib/audit_design_facts.generated.js');
 if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==output)throw Error('Generated design facts differ');console.log('26 exact-byte reviewed design facts match.');}
 else{writeFileSync(target,output);console.log('Generated 26 reviewed design-fact entries.');}
}
