import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import jpeg from 'jpeg-js';
import vm from 'node:vm';
import {initialize,dimensions,template,render,TEMPLATE_TOKENS} from './core.mjs';
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
