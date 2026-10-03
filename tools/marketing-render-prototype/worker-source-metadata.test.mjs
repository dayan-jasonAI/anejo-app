import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {deflateSync} from 'node:zlib';
import {readWorkerSourceMetadata} from './worker-source-metadata.mjs';

const {crc32}=globalThis.AnejoImageOrientation;
const pixels=Buffer.from([190,80,45,45,155,80,40,90,180,120,120,120,230,210,170,20,30,20]);
function pngChunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);out.set(data,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function pngChunks(bytes){const chunks=[];for(let at=8;at<bytes.length;){const n=bytes.readUInt32BE(at),end=at+n+12;chunks.push({type:bytes.toString('ascii',at+4,at+8),bytes:bytes.subarray(at,end),data:bytes.subarray(at+8,end-4)});at=end;}return chunks;}
function rewritePng(bytes,transform){return Buffer.concat([bytes.subarray(0,8),...transform(pngChunks(bytes)).map(c=>c.bytes)]);}
function iccpChunk(profile,name='sRGB built-in'){return pngChunk('iCCP',Buffer.concat([Buffer.from(name,'latin1'),Buffer.from([0,0]),deflateSync(profile)]));}
function jpegSegments(bytes){const segments=[];let at=2;while(at<bytes.length){if(bytes[at++]!==255)throw Error('bad test JPEG');while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7)){segments.push({marker,bytes:bytes.subarray(at-2,at)});continue;}const n=bytes.readUInt16BE(at),end=at+n;segments.push({marker,bytes:bytes.subarray(at-2,end),payload:bytes.subarray(at+2,end)});at=end;}return segments;}
function rewriteJpeg(bytes,transform){const segments=transform(jpegSegments(bytes));const sos=bytes.indexOf(Buffer.from([0xff,0xda]));return Buffer.concat([bytes.subarray(0,2),...segments.map(s=>s.bytes),bytes.subarray(sos)]);}
function jpegSegment(marker,payload){const out=Buffer.alloc(payload.length+4);out[0]=255;out[1]=marker;out.writeUInt16BE(payload.length+2,2);out.set(payload,4);return out;}
function tiffOrientation(value){const tiff=Buffer.from('49492a0008000000010012010300010000000100000000000000','hex');tiff.writeUInt16LE(value,18);return tiff;}
async function fixture(type='png',profile='p3'){
 let pipeline=sharp(pixels,{raw:{width:6,height:1,channels:3}});if(profile)pipeline=pipeline.withIccProfile(profile);
 return new Uint8Array(await pipeline[type]().toBuffer());
}
function expectReject(promise,pattern){return assert.rejects(promise,error=>pattern.test(`${error.reason??''} ${error.message??''}`));}

test('extracts real P3 PNG/JPEG ICC profiles and removes ICC/EXIF only from decoder copy',async()=>{
 for(const type of ['png','jpeg']){
  const source=await fixture(type),original=source.slice(),result=await readWorkerSourceMetadata(source);
  assert.ok(result.profile instanceof Uint8Array);assert.deepEqual(Buffer.from(result.profile),(await sharp(source).metadata()).icc);assert.equal(result.colorStatus,'embedded_rgb_profile');assert.equal(result.type,type);assert.equal(result.width,6);assert.equal(result.height,1);assert.deepEqual(source,original);
  if(type==='png')assert.equal(pngChunks(Buffer.from(result.decoderBytes)).some(c=>c.type==='iCCP'),false);
  else assert.equal(jpegSegments(Buffer.from(result.decoderBytes)).some(s=>s.marker===0xe2&&s.payload?.subarray(0,11).toString()==='ICC_PROFILE'),false);
  const metadata=await sharp(result.decoderBytes).metadata();assert.equal(metadata.width,6);assert.equal(metadata.height,1);assert.equal(metadata.icc,undefined);
 }
});

test('PNG CRC, duplicate/conflicting/late declarations and expansion are rejected',async()=>{
 const source=Buffer.from(await fixture('png')),{data:icc}=pngChunks(source).find(c=>c.type==='iCCP');
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='iCCP');chunks.splice(i+1,0,{type:'iCCP',bytes:pngChunk('iCCP',icc),data:icc});return chunks;})),/duplicate PNG iCCP/);
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IHDR');chunks.splice(i+1,0,{type:'sRGB',bytes:pngChunk('sRGB',Buffer.from([0]))});return chunks;})),/conflicting PNG ICC and sRGB/);
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IEND');chunks.splice(i,0,{type:'iCCP',bytes:pngChunk('iCCP',icc)});return chunks;})),/late PNG iCCP/);
 const badCrc=rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='iCCP'),copy=Buffer.from(chunks[i].bytes);copy[copy.length-1]^=1;chunks[i]={type:'iCCP',bytes:copy};return chunks;});
 await expectReject(readWorkerSourceMetadata(badCrc),/CRC/);
 const oversized=pngChunk('iCCP',Buffer.concat([Buffer.from('profile\0\0'),deflateSync(Buffer.alloc(65*1024))]));
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='iCCP');chunks[i]={type:'iCCP',bytes:oversized};return chunks;})),/exceeds 64 KiB/);
});

test('PNG rejects bad keyword/compression, unsupported color declarations, and damaged framing',async()=>{
 const source=Buffer.from(await fixture('png'));
 const replaceICC=data=>rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='iCCP');chunks[i]={type:'iCCP',bytes:pngChunk('iCCP',data)};return chunks;});
 await expectReject(readWorkerSourceMetadata(replaceICC(Buffer.concat([Buffer.from(' bad\0\0'),deflateSync(Buffer.alloc(132))]))),/keyword spacing/);
 await expectReject(readWorkerSourceMetadata(replaceICC(Buffer.concat([Buffer.from('ok\0'),Buffer.from([1]),deflateSync(Buffer.alloc(132))]))),/compression method/);
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IDAT');chunks.splice(i,0,{type:'cICP',bytes:pngChunk('cICP',Buffer.alloc(4))});return chunks;})),/hdr_or_animated_png/);
 const damaged=Buffer.from(source),where=damaged.indexOf(Buffer.from('IDAT'));damaged[where+4]^=1;
 await expectReject(readWorkerSourceMetadata(damaged),/CRC/);
});

test('PNG and JPEG report all eight source orientations and strip EXIF only in decoder bytes',async()=>{
 for(const type of ['png','jpeg'])for(let orientation=1;orientation<=8;orientation++){
  let source=Buffer.from(await fixture(type,null));
  if(type==='png')source=rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IDAT');chunks.splice(i,0,{type:'eXIf',bytes:pngChunk('eXIf',tiffOrientation(orientation))});return chunks;});
  else source=rewriteJpeg(source,segments=>[ {marker:0xe1,bytes:jpegSegment(0xe1,Buffer.concat([Buffer.from('Exif\0\0'),tiffOrientation(orientation)]))},...segments ]);
  const original=source.slice(),result=await readWorkerSourceMetadata(new Uint8Array(source));
  assert.equal(result.orientation,orientation,`${type} ${orientation}`);assert.deepEqual(source,original);
  const metadata=await sharp(result.decoderBytes).metadata();assert.equal(metadata.orientation,undefined);assert.equal(metadata.width,6);assert.equal(metadata.height,1);
 }
});

test('JPEG assembles ICC segments, rejects duplicate/incomplete sequences, and keeps XMP refusal',async()=>{
 const source=Buffer.from(await fixture('jpeg')),
  segments=jpegSegments(source),icc=segments.filter(s=>s.marker===0xe2&&s.payload?.subarray(0,11).toString()==='ICC_PROFILE');
 assert.ok(icc.length>0);
 const duplicate=rewriteJpeg(source,parts=>{parts.splice(parts.findIndex(s=>s.marker===0xe2)+1,0,icc[0]);return parts;});
 await expectReject(readWorkerSourceMetadata(duplicate),/JPEG ICC sequence/);
 const incomplete=rewriteJpeg(source,parts=>{const s=parts.find(s=>s.marker===0xe2);s.bytes=jpegSegment(0xe2,Buffer.concat([s.payload.subarray(0,12),Buffer.from([2,2]),s.payload.subarray(14)]));s.payload=s.bytes.subarray(4);return parts;});
 await expectReject(readWorkerSourceMetadata(incomplete),/incomplete JPEG ICC sequence/);
 const xmp=rewriteJpeg(source,parts=>{parts.unshift({marker:0xe1,bytes:jpegSegment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0xmp'))});return parts;});
 await expectReject(readWorkerSourceMetadata(xmp),/unsupported_jpeg_application_metadata/);
});

test('unsupported gamma/chromaticity and late PNG declarations remain refused by existing admission',async()=>{
 const source=Buffer.from(await fixture('png',null));
 const gamma=Buffer.alloc(4);gamma.writeUInt32BE(100000);
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IDAT');chunks.splice(i,0,{type:'gAMA',bytes:pngChunk('gAMA',gamma)});return chunks;})),/nonstandard_png_gamma/);
 const chroma=Buffer.alloc(32);chroma.writeUInt32BE(10000,0);
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IDAT');chunks.splice(i,0,{type:'cHRM',bytes:pngChunk('cHRM',chroma)});return chunks;})),/nonstandard_png_chromaticities/);
 const srgb=pngChunk('sRGB',Buffer.from([0]));
 await expectReject(readWorkerSourceMetadata(rewritePng(source,chunks=>{const i=chunks.findIndex(c=>c.type==='IEND');chunks.splice(i,0,{type:'sRGB',bytes:srgb});return chunks;})),/sRGB declaration/);
});
