import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import jpeg from 'jpeg-js';
import {Resvg} from '@resvg/resvg-wasm';
import {initialize} from './core.mjs';
import {renderEditorial,INKS} from './editorial.mjs';
const read=p=>new Uint8Array(readFileSync(new URL(p,import.meta.url)));
await initialize(read('./node_modules/@resvg/resvg-wasm/index_bg.wasm'));
const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/AnejoEditorialSerif-SemiBold.ttf'),kickerFont:read('./assets/AnejoEditorialSans-Medium.ttf'),title:'Your Cajita.',kicker:'AÑEJO CATERING',templateId:'reposado-cajita'};
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
 for(const out of [dark,light]){const kicker=out.measurements.runs.find(r=>r.role==='kicker');assert.ok(kicker.px>=10);assert.ok(kicker.bounds.w<=out.layout.textRegion.w);assert.ok(kicker.bounds.y+kicker.bounds.h<=out.layout.textRegion.y+out.layout.textRegion.h);assert.equal(kicker.px,Math.round(Math.min(out.layout.width,out.layout.height)*.013));}
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

test('editorial font artifacts match the recorded static weight build',async()=>{
 const {createHash}=await import('node:crypto');const manifest=JSON.parse(readFileSync(new URL('./assets/editorial-fonts.json',import.meta.url),'utf8'));
 for(const entry of manifest.fonts){
  const bytes=read('./assets/'+entry.output),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tables={};
  assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  for(let i=0;i<v.getUint16(4);i++){const at=12+i*16,tag=String.fromCharCode(...bytes.subarray(at,at+4));tables[tag]=v.getUint32(at+8);}
  assert.equal(tables.fvar,undefined);assert.equal(v.getUint16(tables['OS/2']+4),entry.weight);
 }
});

test('actual raster applies all eight JPEG orientations before editorial source geometry',async()=>{
 const {sourceGraphic}=await import('./editorial.mjs');
 const {dimensions}=await import('./core.mjs');
 const W=40,H=20,data=new Uint8Array(W*H*4),colors=[[240,15,15],[15,240,15],[15,15,240],[240,240,15]];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,c=colors[(y>=H/2?2:0)+(x>=W/2?1:0)];data.set([...c,255],i);}
 const original=jpeg.encode({data,width:W,height:H},95).data;
 function tagged(value){const exif=Buffer.from([69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,value,0,0,0,0,0,0,0]),marker=Buffer.from([255,225,0,exif.length+2]);return new Uint8Array(Buffer.concat([original.subarray(0,2),marker,exif,original.subarray(2)]));}
 const expected=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]];
 for(let orientation=1;orientation<=8;orientation++){
  const source=tagged(orientation),g=sourceGraphic(source,dimensions(source));assert.equal(g.width,orientation>=5?H:W);assert.equal(g.height,orientation>=5?W:H);
  const raster=pixels(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${g.width}" height="${g.height}">${g.markup({x:0,y:0,w:g.width,h:g.height})}</svg>`);
  for(let corner=0;corner<4;corner++){const x=Math.floor(g.width*(corner%2?.75:.25)),y=Math.floor(g.height*(corner>=2?.75:.25)),offset=(y*g.width+x)*4,c=colors[expected[orientation-1][corner]];for(let k=0;k<3;k++)assert.ok(Math.abs(raster[offset+k]-c[k])<20,`orientation${orientation} corner${corner}`);}
 }
 const output=renderEditorial({...input,source:tagged(6)});assert.equal(output.source.orientation,6);assert.equal(output.source.displayWidth,H);assert.equal(output.source.displayHeight,W);assert.equal(output.layout.photo.w,405);assert.equal(output.layout.photo.x,337.5);
});

test('actual PNG raster applies all eight declared EXIF orientations once, retaining original bytes',async()=>{
 const {sourceGraphic}=await import('./editorial.mjs'),{dimensions}=await import('./core.mjs');
 let engine,image,plain;try{
  engine=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><path fill="#f00" d="M0 0h20v10H0z"/><path fill="#0f0" d="M20 0h20v10H20z"/><path fill="#00f" d="M0 10h20v10H0z"/><path fill="#ff0" d="M20 10h20v10H20z"/></svg>');image=engine.render();plain=image.asPng().slice();
 }finally{image?.free();engine?.free();}
 function tagged(value){
  const tiff=new Uint8Array(26),v=new DataView(tiff.buffer);tiff.set([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,value]);
  const chunk=new Uint8Array(38),cv=new DataView(chunk.buffer);cv.setUint32(0,26);chunk.set([101,88,73,102],4);chunk.set(tiff,8);
  let crc=0xffffffff;for(const byte of chunk.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}cv.setUint32(34,(crc^0xffffffff)>>>0);
  const out=new Uint8Array(plain.length+chunk.length);out.set(plain.subarray(0,-12));out.set(chunk,plain.length-12);out.set(plain.subarray(-12),plain.length-12+chunk.length);return out;
 }
 const expected=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]],colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0]];
 for(let orientation=1;orientation<=8;orientation++){
  const source=tagged(orientation),original=source.slice(),g=sourceGraphic(source,dimensions(source));assert.equal(g.orientation,orientation);
  const raster=pixels(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${g.width}" height="${g.height}">${g.markup({x:0,y:0,w:g.width,h:g.height})}</svg>`);
  for(let corner=0;corner<4;corner++){const x=Math.floor(g.width*(corner%2?.75:.25)),y=Math.floor(g.height*(corner>=2?.75:.25)),at=(y*g.width+x)*4;assert.deepEqual(Array.from(raster.subarray(at,at+3)),colors[expected[orientation-1][corner]]);}
  assert.deepEqual(source,original);
 }
 const result=renderEditorial({...input,source:tagged(6)});assert.equal(result.source.orientation,6);assert.equal(result.source.displayWidth,20);assert.equal(result.source.displayHeight,40);assert.equal(result.visualReviewRequired,true);
});
