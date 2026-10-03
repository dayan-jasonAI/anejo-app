import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import sharp from 'sharp';
import {createWorkerNormalizer} from './worker-source-normalize.mjs';
const module=path=>WebAssembly.compile(readFileSync(new URL(path,import.meta.url)));
const normalizer=await createWorkerNormalizer(await module('./node_modules/@resvg/resvg-wasm/index_bg.wasm'),await module('./node_modules/lcms-wasm/dist/lcms.wasm'));
const width=40,height=20,colors=[[190,80,45],[45,155,80],[40,90,180],[230,210,170]];
function raw(alpha=false){const data=Buffer.alloc(width*height*(alpha?4:3));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*(alpha?4:3);data.set(colors[(y>=height/2?2:0)+(x>=width/2?1:0)],at);if(alpha)data[at+3]=x<width/2?120:255;}return {data,options:{raw:{width,height,channels:alpha?4:3}}};}
async function fixture(format,orientation=1,profile=null,alpha=false){const {data,options}=raw(alpha);let p=sharp(data,options);if(profile)p=p.withIccProfile(profile);if(orientation!==1)p=p.withMetadata({orientation});return new Uint8Array(await p[format](format==='jpeg'?{quality:100,chromaSubsampling:'4:4:4'}:{palette:false}).toBuffer());}
test('actual photo P3 conversion agrees with native reference and keeps original unchanged',async()=>{
 for(const format of ['png','jpeg']){const source=await fixture(format,1,'p3'),copy=source.slice(),a=await normalizer.normalize(source),b=await normalizer.normalize(source),actual=await sharp(a.bytes).raw().toBuffer(),expected=await sharp(source).withIccProfile('srgb').ensureAlpha().raw().toBuffer();assert.deepEqual(source,copy);assert.deepEqual(a.bytes,b.bytes);assert.equal(a.receipt.conversionPerformed,true);assert.equal(a.receipt.outputColor,'declared_srgb');assert.ok(a.receipt.sourceProfileSha256);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=3,`${format} ${i}: ${actual[i]} versus ${expected[i]}`);const meta=await sharp(a.bytes).metadata();assert.equal(meta.orientation,undefined);assert.equal(meta.icc,undefined);assert.equal(meta.exif,undefined);}
});
test('all JPEG/PNG orientations apply exactly once with full source geometry',async()=>{
 const corners=[[0,1,2,3],[1,0,3,2],[3,2,1,0],[2,3,0,1],[0,2,1,3],[2,0,3,1],[3,1,2,0],[1,3,0,2]];
 for(const format of ['png','jpeg'])for(let orientation=1;orientation<=8;orientation++){const source=await fixture(format,orientation,'p3'),result=await normalizer.normalize(source),out=await sharp(result.bytes).raw().toBuffer({resolveWithObject:true}),W=out.info.width,H=out.info.height;assert.equal(W,orientation>=5?height:width);assert.equal(H,orientation>=5?width:height);assert.equal(result.receipt.originalOrientation,orientation);for(let corner=0;corner<4;corner++){const x=Math.floor(W*(corner%2?.75:.25)),y=Math.floor(H*(corner>=2?.75:.25)),at=(y*W+x)*4;for(let c=0;c<3;c++)assert.ok(Math.abs(out.data[at+c]-colors[corners[orientation-1][corner]][c])<=4,`${format} ${orientation} ${corner}`);}}
});
test('translucent RGBA keeps straight color and alpha through real decoder/conversion/encoder',async()=>{const source=await fixture('png',6,'p3',true),result=await normalizer.normalize(source),actual=await sharp(result.bytes).raw().toBuffer(),expected=await sharp(source).autoOrient().withIccProfile('srgb').raw().toBuffer();for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<=(i%4===3?0:3),`${i}: ${actual[i]} versus ${expected[i]}`);});
test('untagged RGB remains explicitly assumed, with no fabricated ICC conversion',async()=>{const source=await fixture('png'),result=await normalizer.normalize(source);assert.equal(result.receipt.sourceColorStatus,'assumed_srgb');assert.equal(result.receipt.conversionPerformed,false);assert.equal(result.receipt.sourceProfileSha256,null);assert.equal(result.receipt.visualReviewRequired,true);assert.equal(result.receipt.resourceReadiness,'unverified');});
test('wide source is resized without enlargement, preserves aspect and opaque patches',async()=>{const source=new Uint8Array(await sharp({create:{width:2300,height:20,channels:4,background:{r:190,g:80,b:45,alpha:1}}}).png().toBuffer()),result=await normalizer.normalize(source),out=await sharp(result.bytes).raw().toBuffer({resolveWithObject:true});assert.equal(out.info.width,2000);assert.equal(out.info.height,17);assert.equal(result.receipt.resized,true);assert.equal(result.receipt.originalWidth,2300);for(let i=0;i<out.data.length;i+=4)assert.deepEqual(Array.from(out.data.subarray(i,i+4)),[190,80,45,255]);});
test('source above current four-million-pixel guard refuses before normalization',async()=>{const source=new Uint8Array(await sharp({create:{width:3000,height:2000,channels:3,background:'#aa8844'}}).png().toBuffer());await assert.rejects(normalizer.normalize(source),/4000000 pixels/);});

test('oversized compressed input refuses preflight and following valid normalization succeeds',async()=>{await assert.rejects(normalizer.normalize(new Uint8Array(5*1024*1024+1)),/5 MiB/);const valid=await fixture('png');assert.equal((await normalizer.normalize(valid)).receipt.outputColor,'declared_srgb');});

test('owned deadline stops normalization before dispatch and at awaited compression or hashing boundaries',async()=>{
 const source=await fixture('png',1,'p3'),original=source.slice();
 for(const stop of ['normalize_preflight','normalize_metadata','normalize_encode_read','normalize_original_hash','normalize_derivative_hash','normalize_profile_hash']){
  const stages=[];let expired=false;
  const deadline={check(stage){stages.push(stage);if(expired)throw Error('latched test expiry');if(stage===stop){expired=true;throw Error('latched test expiry');}}};
  await assert.rejects(normalizer.normalize(source,{deadline}),/latched test expiry/);
  assert.equal(stages.at(-1),stop);assert.deepEqual(source,original);
 }
 assert.equal((await normalizer.normalize(source)).receipt.outputColor,'declared_srgb');
});
