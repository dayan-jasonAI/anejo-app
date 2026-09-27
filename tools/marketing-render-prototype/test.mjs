import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import jpeg from 'jpeg-js';
import vm from 'node:vm';
import {Resvg} from '@resvg/resvg-wasm';
import {initialize,dimensions,template,render,TEMPLATE_TOKENS,headlineBounds,HEADLINE_SAFE_BOX,protectedLayout} from './core.mjs';
const read=p=>new Uint8Array(readFileSync(new URL(p,import.meta.url)));
await initialize(read('./node_modules/@resvg/resvg-wasm/index_bg.wasm'));
test('headers establish compressed and decoded bounds before raster decoding',()=>{assert.deepEqual(dimensions(read('./assets/source.jpg')),{width:1448,height:1086,type:'jpeg',rgbaBytes:6290112});assert.throws(()=>dimensions(new Uint8Array(5*1024*1024+1)),/5 MiB/);assert.throws(()=>dimensions(new Uint8Array([255,216,255,192,0,1])),/segment/);const png=read('./assets/emblem.png');new DataView(png.buffer).setUint32(16,9000);assert.throws(()=>dimensions(png),/dimensions/);});
test('layout preserves aspect and escapes bounded text',()=>{const svg=template({width:1000,height:2000},'Añejo & <Cajita>');assert.match(svg,/x="337.5" y="0" width="405" height="810"/);assert.match(svg,/Añejo &amp; &lt;Cajita&gt;/);assert.throws(()=>template({width:1,height:1},'x'.repeat(41)),/Headline/);});
test('JPEG is deterministic and contains actual photograph, not blank unresolved image',()=>{const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf')};const a=render(input),b=render(input);assert.deepEqual(a.jpg,b.jpg);const decoded=jpeg.decode(a.jpg,{useTArray:true,maxResolutionInMP:2,maxMemoryUsageInMB:40});assert.equal(decoded.width,1080);assert.equal(decoded.height,810);assert.ok(a.jpg.length>200000);assert.ok(decoded.data[0]<70);assert.ok(decoded.data[(400*1080+750)*4]>80);});
test('PNG source decodes through same guarded pipeline',()=>{const out=render({source:read('./assets/emblem.png'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf')});assert.equal(out.source.type,'png');assert.equal(out.width,1080);assert.ok(out.jpg.length>10000);});

// A token drift check does not establish pixel/typography or contrast parity.
test('fixed prototype uses current browser title/background inks and headline family',()=>{
 const browser=readFileSync(new URL('../../public/hub/owner/assets/marketing-branding.js',import.meta.url),'utf8');
 const inkBlock=browser.match(/var BRAND_INK = (\{[\s\S]*?\n  \});/);assert.ok(inkBlock);
 const inks=vm.runInNewContext('('+inkBlock[1]+')');
 assert.equal(TEMPLATE_TOKENS.titleInk,inks.parchment.css);
 assert.equal(TEMPLATE_TOKENS.background,inks.deep.css);
 const fontBlock=browser.match(/function headlineFont\(px\) \{[^}]+\}/);assert.ok(fontBlock);
 const scope={};vm.runInNewContext(fontBlock[0],scope);
 assert.ok(scope.headlineFont(29).startsWith(TEMPLATE_TOKENS.fontWeight+' 29px "'+TEMPLATE_TOKENS.fontFamily+'"'));
 const svg=template({width:1448,height:1086});
 assert.match(svg,/xlink:href="source.jpg" x="0" y="0" width="1080" height="810"/);
 assert.ok(svg.includes('fill="'+inks.parchment.css+'"'));
 assert.ok(svg.includes('fill="'+inks.deep.css+'"'));
 assert.doesNotMatch(svg,/#f8f0df|#e6d5b9/i);
 assert.match(svg,/<text x="107" y="757"/);
 assert.match(svg,/xlink:href="emblem.png" x="43" y="717" width="45" height="43"/);
});

function raster(svg,font) {
 let renderer,image;
 try {renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:TEMPLATE_TOKENS.fontFamily}});image=renderer.render();return new Uint8Array(image.pixels);}
 finally {image?.free();renderer?.free();}
}
function luminance(rgb) {
 const linear=Array.from(rgb,value=>{const s=value/255;return s<=.04045?s/12.92:Math.pow((s+.055)/1.055,2.4);});
 return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
}
test('bottom scrim leaves upper photograph unchanged and supports caption over this fixture linen',()=>{
 const font=read('./assets/CormorantGaramond.ttf');
 const out=render({source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font});
 const withoutCaption=out.svg.replace(/<text[^>]*>[\s\S]*?<\/text>/,'');
 const scrimLayer=/<rect id="caption-scrim-layer"[^>]*\/>/;
 assert.match(withoutCaption,scrimLayer);
 const withScrim=raster(withoutCaption,font),withoutScrim=raster(withoutCaption.replace(scrimLayer,''),font);
 assert.deepEqual(withScrim.subarray(0,700*1080*4),withoutScrim.subarray(0,700*1080*4),'scrim must not change any pixel above its bounded bottom band');
 const ink=luminance([232,226,202]);let minimum=Infinity,oldMinimum=Infinity;
 // Background-only samples beneath the original fixture's actual caption over linen.
 // This is a local fixture regression, not contrast certification for arbitrary photos.
 for(let y=738;y<757;y+=2)for(let x=310;x<375;x+=2){
  const offset=(y*1080+x)*4;
  const current=luminance(withScrim.subarray(offset,offset+3));
  const previous=luminance(withoutScrim.subarray(offset,offset+3));
  minimum=Math.min(minimum,(ink+.05)/(current+.05));
  oldMinimum=Math.min(oldMinimum,(ink+.05)/(previous+.05));
 }
 assert.ok(oldMinimum<4.5,'fixture must exercise the original low-contrast linen');
 assert.ok(minimum>=4.5,`sampled caption background contrast is ${minimum}`);
 assert.ok(minimum>oldMinimum*2,'scrim must materially improve the failing background contrast');
 assert.ok(out.svg.indexOf('caption-scrim-layer')<out.svg.indexOf('<text '),'scrim stays behind lettering');
 assert.ok(out.svg.indexOf('caption-scrim-layer')<out.svg.lastIndexOf('<image '),'scrim stays behind the authentic emblem');
});

// Synthetic wording exercises typography only; no food/image fixture is altered.
test('measured headline rejects wide overflow even below character cap, while narrow and accented text fit',()=>{
 const font=read('./assets/CormorantGaramond.ttf');
 assert.throws(()=>headlineBounds('W'.repeat(40),font),/safe area/);
 for(const title of ['i'.repeat(40),'Añejo: celebración y sabor','¡Qué ocasión tan especial!']) {
  const b=headlineBounds(title,font);assert.ok(b.x+b.width<=HEADLINE_SAFE_BOX.right);assert.ok(b.y+b.height<=HEADLINE_SAFE_BOX.bottom);
 }
 assert.throws(()=>headlineBounds('   ',font),/visible glyphs/);
 assert.throws(()=>headlineBounds('',font),/visible glyphs/);
});
test('public render pipeline rejects unsafe title and accepts a following valid render',()=>{
 const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf')};
 assert.throws(()=>render({...input,title:'W'.repeat(40)}),/safe area/);
 const result=render({...input,title:'Celebración Añejo'});
 assert.ok(result.headline.width>0);assert.equal(result.width,1080);assert.ok(result.jpg.length>200000);
});

test('protected source rectangles use contain scale and letterbox offsets for both aspect directions',()=>{
 const heading={x:107,y:735,width:267,height:31};
 const portrait=protectedLayout({width:1000,height:2000},[{x:0,y:0,w:1,h:.5}],heading);
 assert.deepEqual(portrait.photo,{x:337.5,y:0,width:405,height:810});assert.deepEqual(portrait.protectedAreas[0],{x:337.5,y:0,width:405,height:405});
 const landscape=protectedLayout({width:2000,height:1000},[{x:.25,y:.25,w:.5,h:.5}],heading);
 assert.deepEqual(landscape.photo,{x:0,y:135,width:1080,height:540});assert.deepEqual(landscape.protectedAreas[0],{x:270,y:270,width:540,height:270});
 assert.equal(landscape.protectionSource,'provided_regions');assert.equal(landscape.visualReviewRequired,true);
});
test('missing and empty protection metadata require visual review, malformed geometry rejects',()=>{
 const d={width:1080,height:810},heading={x:107,y:735,width:267,height:31};
 for(const regions of [undefined,[]]){const r=protectedLayout(d,regions,heading);assert.equal(r.protectionSource,'visual_review_required');assert.equal(r.visualReviewRequired,true);}
 for(const regions of [null,{},Array(21).fill({x:0,y:0,w:.1,h:.1}),[{x:NaN,y:0,w:.1,h:.1}],[{x:0,y:0,w:Infinity,h:.1}],[{x:-.1,y:0,w:.1,h:.1}],[{x:0,y:0,w:0,h:.1}],[{x:.9,y:0,w:.2,h:.1}],[{x:0,y:.9,w:.1,h:.2}]])assert.throws(()=>protectedLayout(d,regions,heading),/protected|Protected/);
});
test('protected regions reject caption, emblem and scrim collisions including scrim-only overlap',()=>{
 const d={width:1080,height:810},heading={x:107,y:735,width:267,height:31};
 assert.throws(()=>protectedLayout(d,[{x:110/1080,y:740/810,w:20/1080,h:10/810}],heading),/headline/);
 assert.throws(()=>protectedLayout(d,[{x:44/1080,y:720/810,w:10/1080,h:10/810}],heading),/emblem/);
 assert.throws(()=>protectedLayout(d,[{x:900/1080,y:780/810,w:20/1080,h:10/810}],heading),/scrim/);
 assert.doesNotThrow(()=>protectedLayout(d,[{x:0,y:0,w:1,h:700/810}],heading));
});
test('public render rejects declared all-photo protection and accepts subsequent safe render without altering bytes',()=>{
 const input={source:read('./assets/source.jpg'),emblem:read('./assets/emblem.png'),font:read('./assets/CormorantGaramond.ttf')};
 assert.throws(()=>render({...input,protectedRegions:[{x:0,y:0,w:1,h:1}]}),/overlaps/);
 const baseline=render(input),safe=render({...input,protectedRegions:[{x:.25,y:.25,w:.5,h:.4}]});
 assert.deepEqual(safe.jpg,baseline.jpg);assert.equal(baseline.protectionSource,'visual_review_required');assert.equal(safe.protectionSource,'provided_regions');assert.equal(safe.visualReviewRequired,true);
});
