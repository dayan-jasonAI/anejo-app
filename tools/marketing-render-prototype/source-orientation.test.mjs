import test from 'node:test';
import assert from 'node:assert/strict';
import {jpegOrientation} from './source-orientation.mjs';
const join=(...parts)=>new Uint8Array(parts.flatMap(p=>Array.from(p)));
function app1(payload){const n=payload.length+2;return join([255,225,n>>8,n&255],payload);}
function fixture(values=[1],little=true){
 const tiff=new Uint8Array(8+2+values.length*12+4),v=new DataView(tiff.buffer);
 tiff.set(little?[73,73]:[77,77]);v.setUint16(2,42,little);v.setUint32(4,8,little);v.setUint16(8,values.length,little);
 values.forEach((value,i)=>{const p=10+i*12;v.setUint16(p,0x112,little);v.setUint16(p+2,3,little);v.setUint32(p+4,1,little);v.setUint16(p+8,value,little);});
 return join([69,120,105,102,0,0],tiff);
}
const jpeg=(...segments)=>join([255,216],...segments,[255,217]);
for(const little of [true,false])test(`all eight orientations parse ${little?'little':'big'} endian inline SHORT`,()=>{
 for(let value=1;value<=8;value++)assert.equal(jpegOrientation(jpeg(app1(fixture([value],little)))),value);
});
test('absent orientation and non-Exif APP1 default to 1; unrelated APP1 does not override EXIF',()=>{
 assert.equal(jpegOrientation(jpeg()),1);assert.equal(jpegOrientation(jpeg(app1(fixture([])))),1);
 const unrelated=app1(new TextEncoder().encode('http://ns.adobe.com/xap/1.0/'));
 assert.equal(jpegOrientation(jpeg(unrelated)),1);assert.equal(jpegOrientation(jpeg(unrelated,app1(fixture([6])))),6);
});
test('duplicate same orientation accepted; conflicting tags and APP1 values rejected',()=>{
 assert.equal(jpegOrientation(jpeg(app1(fixture([6,6])))),6);
 assert.equal(jpegOrientation(jpeg(app1(fixture([6])),app1(fixture([6])))),6);
 assert.throws(()=>jpegOrientation(jpeg(app1(fixture([6,8])))),/conflicting/);
 assert.throws(()=>jpegOrientation(jpeg(app1(fixture([6])),app1(fixture([8])))),/conflicting/);
});
test('recognized malformed EXIF signatures, TIFF headers and offsets reject',()=>{
 for(const n of [4,5,6,7,10,13])assert.throws(()=>jpegOrientation(jpeg(app1(fixture().subarray(0,n)))),/EXIF/);
 for(const mutate of [p=>p[4]=1,p=>p[6]=0,p=>p[8]=0,p=>new DataView(p.buffer).setUint32(10,0,true),p=>new DataView(p.buffer).setUint32(10,0xffffffff,true),p=>new DataView(p.buffer).setUint16(14,65535,true)]){const p=fixture();mutate(p);assert.throws(()=>jpegOrientation(jpeg(app1(p))),/Invalid/);}
 const noTrailer=fixture().subarray(0,fixture().length-1);assert.throws(()=>jpegOrientation(jpeg(app1(noTrailer))),/truncated/);
});
test('invalid orientation value/type/count rejected in both byte orders',()=>{
 for(const little of [true,false]){
  for(const value of [0,9,65535])assert.throws(()=>jpegOrientation(jpeg(app1(fixture([value],little)))),/outside/);
  for(const [offset,value,width] of [[18,4,2],[20,2,4],[20,0,4]]){const p=fixture([1],little),v=new DataView(p.buffer);if(width===2)v.setUint16(offset,value,little);else v.setUint32(offset,value,little);assert.throws(()=>jpegOrientation(jpeg(app1(p))),/SHORT/);}
 }
});
test('truncated JPEG segments and marker streams fail within bounded input',()=>{
 for(const bytes of [[255,216],[255,216,255],[255,216,255,225,0],[255,216,255,225,0,1],[255,216,255,225,0,20,69,120],[255,216,0],[255,216,255,0],[255,216,255,216]])assert.throws(()=>jpegOrientation(new Uint8Array(bytes)),/Invalid/);
 assert.throws(()=>jpegOrientation(new Uint8Array(5*1024*1024+1)),/5 MiB/);assert.throws(()=>jpegOrientation([255,216]),/Uint8Array/);
});
test('respects Uint8Array offsets and stops at SOS without interpreting entropy',()=>{
 const value=jpeg(app1(fixture([8],false))),padded=join([0,0,0],value,[0,0]);assert.equal(jpegOrientation(padded.subarray(3,3+value.length)),8);
 const stream=join([255,216],app1(fixture([6])),[255,218,0,2],app1(fixture([8])));assert.equal(jpegOrientation(stream),6);
 assert.equal(jpegOrientation(jpeg([255,255,1],[255,208],app1(fixture([3])))),3);
});
test('unrelated IFD0 entries are ignored rather than interpreted as orientation',()=>{
 const p=fixture([8]);new DataView(p.buffer).setUint16(16,0x100,true);assert.equal(jpegOrientation(jpeg(app1(p))),1);
});
