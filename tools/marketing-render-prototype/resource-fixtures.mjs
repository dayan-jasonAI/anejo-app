// Synthetic, local-only stress fixtures. Does not read or edit customer images.
// Usage: node resource-fixtures.mjs [NEW_OUTPUT_DIRECTORY]; default: unique /tmp directory.
import {mkdirSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import jpeg from 'jpeg-js';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function chunk(type,data){const label=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);label.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function png(data,width,height){
 const rows=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(data.buffer,data.byteOffset+y*width*4,width*4).copy(rows,y*(width*4+1)+1);
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const requested=process.argv[2];
if(process.argv.length>3)throw Error('Usage: node resource-fixtures.mjs [NEW_OUTPUT_DIRECTORY]');
if(requested&&existsSync(resolve(requested)))throw Error('Output directory already exists; use a new path to avoid overwriting files');
const output=requested?resolve(requested):mkdtempSync(join(tmpdir(),'anejo-resource-fixtures-'));if(requested)mkdirSync(output,{recursive:true});
const fixtures=[];
function save(name,bytes,metadata){writeFileSync(join(output,name),bytes,{flag:'wx'});fixtures.push({file:name,bytes:bytes.length,sha256:sha256(bytes),...metadata});}
for(const [shape,width,height] of [['square',2000,2000],['landscape',2304,1728],['portrait',1728,2304],['ultrawide',4000,1000],['ultratall',1000,4000]]){
 const data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4,bx=x>>>2,by=y>>>2;data[at]=(bx*13+by*7+(bx>>>5)*31)&255;data[at+1]=(bx*3+by*11+(by>>>5)*19)&255;data[at+2]=((bx^by)*5)&255;data[at+3]=255;}
 for(const format of ['jpeg','png']){const bytes=format==='jpeg'?jpeg.encode({data,width,height},80).data:png(data,width,height);if(bytes.length>5*1024*1024)throw Error(`${shape} ${format} exceeds intended 5 MiB accepted fixture limit`);save(`${shape}.${format==='jpeg'?'jpg':'png'}`,bytes,{shape,width,height,pixels:width*height,mime:`image/${format}`,expected:'accepted'});
  if(shape==='square'&&format==='png'){
   // A valid ignored ancillary PNG text chunk fills compressed request size exactly.
   // This stresses the byte guard without increasing decoded image dimensions.
   const payload=Buffer.alloc(5*1024*1024-bytes.length-12,0x41);Buffer.from('Synthetic\0').copy(payload);
   const padded=Buffer.concat([bytes.subarray(0,-12),chunk('tEXt',payload),bytes.subarray(-12)]);
   save('square-exact-5mib.png',padded,{shape,width,height,pixels:width*height,mime:'image/png',expected:'accepted',note:'Valid synthetic PNG with ignored tEXt ancillary chunk; exactly 5 MiB.'});
  }
 }
}
save('oversize.bin',Buffer.alloc(5*1024*1024+1,0x41),{expected:'413 before raster',mime:'image/jpeg'});
save('unsupported.bin',Buffer.from('synthetic unsupported image'),{expected:'422 before raster',mime:'image/jpeg'});
const badDimensions=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(badDimensions);badDimensions.writeUInt32BE(4096,16);badDimensions.writeUInt32BE(4096,20);
save('over-pixel-limit.png',badDimensions,{expected:'422 before raster',mime:'image/png',width:4096,height:4096,pixels:4096*4096});
save('empty.bin',Buffer.alloc(0),{expected:'400 before raster',mime:'image/jpeg'});
writeFileSync(join(output,'manifest.json'),JSON.stringify({generatedAt:new Date().toISOString(),provenance:'Deterministic synthetic pixel arrays only; no customer assets or network calls.',fixtures},null,2)+'\n',{flag:'wx'});
console.log(output);
