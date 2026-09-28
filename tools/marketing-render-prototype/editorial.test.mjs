import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import jpeg from 'jpeg-js';
import {Resvg} from '@resvg/resvg-wasm';
import {initialize} from './core.mjs';
import {renderEditorial,INKS} from './editorial.mjs';
const read=p=>new Uint8Array(readFileSync(new URL(p,import.meta.url)));
await initialize(read('./node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf'),kickerFont:read('../cardgen/fonts/JosefinSans.ttf'),title:'Your Cajita.',kicker:'AÑEJO CATERING',templateId:'reposado-cajita'};
function diagnostic(value){const data=new Uint8Array(64*64*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;}return new Uint8Array(jpeg.encode({data,width:64,height:64},95).data);}
function pixels(xml){let r,image;try{r=new Resvg(xml,{font:{fontBuffers:[input.font,input.kickerFont]}});image=r.render();return new Uint8Array(image.pixels);}finally{image?.free();r?.free();}}
test('actual WASM renders both shared editorial profiles with fitted headline, kicker and deterministic JPEG',()=>{
 for(const templateId of ['reposado-wide','reposado-cajita']){
  const a=renderEditorial({...input,templateId}),b=renderEditorial({...input,templateId});assert.deepEqual(a.jpg,b.jpg);assert.equal(a.layout.templateId,templateId);assert.equal(a.layout.width,1080);assert.equal(a.layout.height,810);
  const decoded=jpeg.decode(a.jpg,{useTArray:true,maxResolutionInMP:2,maxMemoryUsageInMB:40});assert.equal(decoded.width,1080);assert.ok(a.jpg.length>100000);
  const region=a.layout.textRegion;for(const r of a.measurements.runs){assert.ok(r.bounds.x>=region.x&&r.bounds.x+r.bounds.w<=region.x+region.w);assert.ok(r.bounds.y>=region.y&&r.bounds.y+r.bounds.h<=region.y+region.h);}
  assert.equal(a.measurements.runs[0].text,'AÑEJO CATERING');assert.equal(a.measurements.runs.filter(r=>r.role==='headline').map(r=>r.text).join(' '),'Your Cajita.');assert.equal(a.visualReviewRequired,true);assert.doesNotMatch(a.svg,/caption-scrim/);
 }
});
test('background samples choose light ink on dark diagnostic and dark ink on light diagnostic',()=>{
 const dark=renderEditorial({...input,source:diagnostic(8)}),light=renderEditorial({...input,source:diagnostic(245)});
 assert.equal(dark.ink.text.color,INKS.parchment);assert.ok([INKS.deep,INKS.black].includes(light.ink.text.color));assert.equal(dark.ink.emblem.color,INKS.parchment);
 for(const out of [dark,light]){const kicker=out.measurements.runs.find(r=>r.role==='kicker');assert.ok(kicker.px>=14);assert.ok(kicker.bounds.w<=out.layout.textRegion.w);assert.ok(kicker.bounds.y+kicker.bounds.h<=out.layout.textRegion.y+out.layout.textRegion.h);assert.ok(out.deviations.some(x=>x.includes('14px floor')));}
 assert.equal(dark.layout.photo.x,135);assert.equal(dark.layout.photo.w,810);assert.equal(dark.layout.backgroundExtended,true);assert.match(dark.svg,/linearGradient id="left"/);
});
test('composition leaves pre-JPEG photograph pixels unchanged outside declared lettering and emblem',()=>{
 const out=renderEditorial(input),full=pixels(out.svg),base=pixels(out.svg.replace(/<text[^>]*>[\s\S]*?<\/text>/g,'').replace(/<image id="brand-emblem"[^>]*\/>/,''));
 const regions=[out.layout.textRegion,out.layout.emblemRegion];let checked=0,changed=0;
 for(let y=0;y<810;y++)for(let x=0;x<1080;x++){
  const offset=(y*1080+x)*4,inside=regions.some(r=>x>=Math.floor(r.x)-2&&x<=Math.ceil(r.x+r.w)+2&&y>=Math.floor(r.y)-2&&y<=Math.ceil(r.y+r.h)+2);
  if(inside){if(full[offset]!==base[offset])changed++;continue;}
  for(let c=0;c<4;c++)assert.equal(full[offset+c],base[offset+c]);checked++;
 }
 assert.ok(checked>700000);assert.ok(changed>100);assert.match(out.svg,/feComposite in2="SourceAlpha" operator="in"/);
});
test('unsupported layouts, missing pinned font, protected collision and text overflow reject explicitly',()=>{
 assert.throws(()=>renderEditorial({...input,templateId:'reposado-portrait'}),/Unsupported/);
 assert.throws(()=>renderEditorial({...input,kickerFont:undefined}),/font bytes/);
 assert.throws(()=>renderEditorial({...input,protectedRegions:[{x:0,y:0,w:1,h:1}]}),/protected/);
 assert.throws(()=>renderEditorial({...input,title:'W'.repeat(80)}),/headline does not fit/);
 assert.throws(()=>renderEditorial({...input,kicker:'W'.repeat(50)}),/kicker does not fit/);
 assert.throws(()=>renderEditorial({...input,title:'<script>\n'}),/wording/);
});
test('original emblem alpha produces selected brand ink rather than original gold or a filled rectangle',()=>{
 const out=renderEditorial({...input,source:diagnostic(8)}),data=pixels(out.svg),mark=out.measurements.emblem;let inkPixels=0,darkPixels=0;
 for(let y=Math.ceil(mark.y);y<Math.floor(mark.y+mark.h);y++)for(let x=Math.ceil(mark.x);x<Math.floor(mark.x+mark.w);x++){
  const at=(y*1080+x)*4;
  if(Math.abs(data[at]-232)<=1&&Math.abs(data[at+1]-226)<=1&&Math.abs(data[at+2]-202)<=1)inkPixels++;
  if(data[at]<20&&data[at+1]<20&&data[at+2]<20)darkPixels++;
 }
 assert.ok(inkPixels>20,`selected brand ink pixels: ${inkPixels}`);assert.ok(darkPixels>20,`transparent emblem holes retained: ${darkPixels}`);
});
