import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {normalizeSource} from './normalize-source.mjs';
const width=40,height=20,colors=[[230,30,20],[20,220,40],[30,40,230],[210,210,20]];
function raw(alpha=false){const data=Buffer.alloc(width*height*(alpha?4:3));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*(alpha?4:3);data.set(colors[(y>=height/2?2:0)+(x>=width/2?1:0)],at);if(alpha)data[at+3]=x<width/2?120:255;}return {data,options:{raw:{width,height,channels:alpha?4:3}}};}
async function fixture(format,orientation=1,profile=null,alpha=false){const {data,options}=raw(alpha);let pipeline=sharp(data,options);if(profile)pipeline=pipeline.withIccProfile(profile);if(orientation!==1)pipeline=pipeline.withMetadata({orientation});return new Uint8Array(await pipeline[format](format==='png'?{palette:false}:{quality:100,chromaSubsampling:'4:4:4'}).toBuffer());}
async function sample(bytes){return sharp(bytes).raw().toBuffer({resolveWithObject:true});}
test('untagged RGB is explicitly assumed sRGB; originals preserved and deterministic derivative has only sRGB metadata',async()=>{
 const source=await fixture('png'),copy=source.slice(),a=await normalizeSource(source),b=await normalizeSource(source);
 assert.deepEqual(source,copy);assert.deepEqual(a.bytes,b.bytes);assert.equal(a.receipt.sourceColorStatus,'assumed_srgb');assert.equal(a.receipt.runtime,'node-reference-only');assert.equal(a.receipt.visualReviewRequired,true);
 const meta=await sharp(a.bytes).metadata();assert.ok(meta.icc);assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);assert.equal(meta.xmp,undefined);assert.deepEqual((await sample(source)).data,(await sample(a.bytes)).data);
});
test('actual embedded P3 conversion restores known sRGB patches rather than merely stripping the profile',async()=>{
 const source=await fixture('png',1,'p3'),result=await normalizeSource(source),converted=await sample(result.bytes),reference=raw().data;
 assert.equal(result.receipt.sourceColorStatus,'embedded_rgb_profile');assert.ok(result.receipt.sourceProfileSha256);assert.notEqual(result.receipt.sourceProfileSha256,result.receipt.outputProfileSha256);
 for(let i=0;i<reference.length;i++)assert.ok(Math.abs(reference[i]-converted.data[i])<=3,`sample ${i}: ${reference[i]} vs ${converted.data[i]}`);
});
test('all eight JPEG and PNG EXIF orientations normalize once to upright corner geometry',async()=>{
 const expected=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]];
 for(const format of ['jpeg','png'])for(let orientation=1;orientation<=8;orientation++){
  const original=await fixture(format,orientation),copy=original.slice(),result=await normalizeSource(original),out=await sample(result.bytes),W=out.info.width,H=out.info.height;
  assert.equal(result.receipt.originalOrientation,orientation);assert.equal(W,orientation>=5?height:width);assert.equal(H,orientation>=5?width:height);assert.deepEqual(original,copy);
  for(let corner=0;corner<4;corner++){const x=Math.floor(W*(corner%2?.75:.25)),y=Math.floor(H*(corner>=2?.75:.25)),at=(y*W+x)*out.info.channels;for(let channel=0;channel<3;channel++)assert.ok(Math.abs(out.data[at+channel]-colors[expected[orientation-1][corner]][channel])<=3,`${format} orientation ${orientation} corner ${corner}`);}
 }
});
test('RGBA alpha survives normalization and original metadata does not propagate',async()=>{
 const source=await fixture('png',6,'srgb',true),result=await normalizeSource(source),out=await sample(result.bytes);assert.equal(result.receipt.hasAlpha,true);assert.equal(out.info.channels,4);
 for(let y=0;y<out.info.height;y++)for(let x=0;x<out.info.width;x++)assert.equal(out.data[(y*out.info.width+x)*4+3],y<20?120:255);assert.equal((await sharp(result.bytes).metadata()).exif,undefined);
});
test('malformed inputs and oversized compressed data reject without output',async()=>{
 await assert.rejects(normalizeSource([]),/Uint8Array/);await assert.rejects(normalizeSource(new Uint8Array(5*1024*1024+1)),/5 MiB/);await assert.rejects(normalizeSource(new Uint8Array([255,216])),/Unsupported/);
 const source=await fixture('png');await assert.rejects(normalizeSource(source.subarray(0,-5)),/Invalid PNG/);
});

function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);out.set(data,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function replaceICC(source,transform){const chunks=[];let at=8;while(at<source.length){const v=new DataView(source.buffer,source.byteOffset,source.length),n=v.getUint32(at),type=Buffer.from(source.subarray(at+4,at+8)).toString(),end=at+n+12;if(type==='iCCP')chunks.push(...transform(source.subarray(at+8,end-4)));else chunks.push(source.subarray(at,end));at=end;}return new Uint8Array(Buffer.concat([source.subarray(0,8),...chunks]));}
test('malformed, duplicate and conflicting ICC declarations cannot silently fall back to sRGB',async()=>{
 const {inflateSync,deflateSync}=await import('node:zlib'),source=await fixture('png',1,'p3');
 const badHeader=replaceICC(source,payload=>{const at=payload.indexOf(0)+2,profile=inflateSync(payload.subarray(at));profile[36]=0;return [chunk('iCCP',Buffer.concat([payload.subarray(0,at),deflateSync(profile)]))];});
 await assert.rejects(normalizeSource(badHeader),/invalid ICC header/);
 const duplicate=replaceICC(source,payload=>[chunk('iCCP',payload),chunk('iCCP',payload)]);await assert.rejects(normalizeSource(duplicate),/duplicate/);
 const conflict=replaceICC(source,payload=>[chunk('iCCP',payload),chunk('sRGB',Buffer.from([0]))]);await assert.rejects(normalizeSource(conflict),/conflicting/);
 const invalidTags=replaceICC(source,payload=>{const at=payload.indexOf(0)+2,profile=inflateSync(payload.subarray(at));profile.writeUInt32BE(0xffffffff,136);return [chunk('iCCP',Buffer.concat([payload.subarray(0,at),deflateSync(profile)]))];});await assert.rejects(normalizeSource(invalidTags),/ICC tag outside/);
 // A syntactically valid table with invalid tag data must fail during decode/conversion.
 const semanticBad=replaceICC(source,payload=>{const at=payload.indexOf(0)+2,profile=inflateSync(payload.subarray(at)),count=profile.readUInt32BE(128);let offset=null;for(let i=0;i<count;i++){const tagAt=132+i*12;if(profile.subarray(tagAt,tagAt+4).toString()==='rTRC')offset=profile.readUInt32BE(tagAt+4);}assert.notEqual(offset,null);profile.fill(0,offset,offset+4);return [chunk('iCCP',Buffer.concat([payload.subarray(0,at),deflateSync(profile)]))];});await assert.rejects(normalizeSource(semanticBad));
});
test('CMYK and high-depth sources remain explicit unsupported inputs',async()=>{
 const {data,options}=raw();const cmyk=new Uint8Array(await sharp(data,options).toColourspace('cmyk').jpeg().toBuffer());await assert.rejects(normalizeSource(cmyk),/RGB ICC|unsupported input/);
 const high=new Uint8Array(await sharp(data,options).toColourspace('rgb16').png().toBuffer());await assert.rejects(normalizeSource(high),/8-bit/);
});
test('normalized PNG has its own byte ceiling even when original JPEG is within bounds',async()=>{
 const W=1600,H=1200,data=Buffer.alloc(W*H*3);let seed=421;for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed&255;}
 const source=new Uint8Array(await sharp(data,{raw:{width:W,height:H,channels:3}}).jpeg({quality:60}).toBuffer());assert.ok(source.length<5*1024*1024);await assert.rejects(normalizeSource(source),/derivative exceeds/);
});


test('WASM consumes normalized P3 derivative with reference colors instead of raw wide-gamut samples',async()=>{
 const {Resvg}=await import('@resvg/resvg-wasm'),{initialize}=await import('./core.mjs'),{readFileSync}=await import('node:fs');
 await initialize(new Uint8Array(readFileSync(new URL('./node_modules/@resvg/resvg-wasm/index_bg.wasm',import.meta.url))));
 function raster(bytes){let renderer,image;try{renderer=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="20"><image xlink:href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}" width="40" height="20"/></svg>`);image=renderer.render();return image.pixels.slice();}finally{image?.free();renderer?.free();}}
 const source=await fixture('png',1,'p3'),normalized=await normalizeSource(source),before=raster(source),after=raster(normalized.bytes);let rawMismatch=0;
 for(let corner=0;corner<4;corner++){const at=((corner>=2?15:5)*40+(corner%2?30:10))*4;for(let c=0;c<3;c++){assert.ok(Math.abs(after[at+c]-colors[corner][c])<=3);if(Math.abs(before[at+c]-colors[corner][c])>5)rawMismatch++;}}
 assert.ok(rawMismatch>0,'Raw P3 samples must demonstrate the conversion gap for this fixture');
});


test('Buffer input is snapshotted before awaits so concurrent caller mutation cannot change provenance',async()=>{
 const {createHash}=await import('node:crypto'),source=Buffer.from(await fixture('png')),hash=createHash('sha256').update(source).digest('hex');
 const job=normalizeSource(source);source.fill(0);const result=await job;assert.equal(result.receipt.originalSha256,hash);assert.equal(result.receipt.width,40);assert.equal(result.receipt.height,20);
});


test('explicit PNG sRGB declaration is distinguished from unknown-color assumptions',async()=>{
 const source=await fixture('png'),tagged=new Uint8Array(Buffer.concat([source.subarray(0,-12),chunk('sRGB',Buffer.from([0])),source.subarray(-12)]));
 const result=await normalizeSource(tagged);assert.equal(result.receipt.sourceColorStatus,'declared_srgb');assert.equal(result.receipt.sourceProfileSha256,null);
});


test('phone-resolution photo becomes a bounded upright derivative without cropping or enlarging',async()=>{
 const original=new Uint8Array(await sharp({create:{width:4000,height:3000,channels:3,background:'#548866'}}).withMetadata({orientation:6}).jpeg().toBuffer());
 const result=await normalizeSource(original);assert.equal(result.receipt.originalWidth,4000);assert.equal(result.receipt.originalHeight,3000);assert.equal(result.receipt.width,1500);assert.equal(result.receipt.height,2000);assert.equal(result.receipt.resized,true);assert.equal(result.receipt.originalOrientation,6);
 const {dimensions}=await import('./core.mjs');assert.equal(dimensions(result.bytes).rgbaBytes,1500*2000*4);
});
