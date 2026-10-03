// Bounded worker metadata extraction only. This does not decode or convert pixels.
import {dimensions} from './core.mjs';
import {jpegOrientation,pngSourceOrientation} from './source-orientation.mjs';
import {admitSourceColor} from './source-color-admission.mjs';
import {validateRGBProfile} from './color-kernel.mjs';

const MAX_PROFILE=64*1024;
const {crc32}=globalThis.AnejoImageOrientation;
const text=b=>String.fromCharCode(...b);
const invalid=reason=>{throw Error(`Source metadata invalid: ${reason}`);};
const refuse=reason=>{throw Error(`Source metadata unsupported: ${reason}`);};

async function inflateProfile(compressed){
 if(typeof DecompressionStream!=='function')refuse('deflate decompressor unavailable');
 const input=new ReadableStream({start(controller){controller.enqueue(compressed);controller.close();}});
 const reader=input.pipeThrough(new DecompressionStream('deflate')).getReader();
 const chunks=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   // This caps accumulated output. A DecompressionStream may produce one large
   // chunk before read() resolves, so a strict peak-chunk memory cap is unproven.
   if(!(value instanceof Uint8Array)||value.byteLength>MAX_PROFILE-total){await reader.cancel();invalid('ICC decompressed profile exceeds 64 KiB');}
   chunks.push(value.slice());total+=value.byteLength;
  }
 }finally{reader.releaseLock();}
 const profile=new Uint8Array(total);let at=0;for(const chunk of chunks){profile.set(chunk,at);at+=chunk.length;}
 try{return validateRGBProfile(profile);}catch(error){invalid(`ICC profile rejected: ${error.message}`);}
}

function validateKeyword(keyword){
 if(keyword.length<1||keyword.length>79)invalid('PNG iCCP keyword length');
 for(const byte of keyword)if(!(byte===0x20||(byte>=0x21&&byte<=0x7e)||(byte>=0xa1&&byte<=0xff)))invalid('PNG iCCP keyword character');
 if(keyword[0]===0x20||keyword[keyword.length-1]===0x20)invalid('PNG iCCP keyword spacing');
 for(let i=1;i<keyword.length;i++)if(keyword[i]===0x20&&keyword[i-1]===0x20)invalid('PNG iCCP keyword spacing');
}
function parsePng(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),drop=[];
 let at=8,seenData=false,profileChunk=null,srgb=false;
 while(at<bytes.length){
  if(bytes.length-at<12)invalid('truncated PNG chunk');
  const length=v.getUint32(at);if(length>0x7fffffff||length>bytes.length-at-12)invalid('PNG chunk length');
  const end=at+length+12,type=text(bytes.subarray(at+4,at+8));
  if(crc32(bytes.subarray(at+4,end-4))!==v.getUint32(end-4))invalid(`PNG ${type} CRC`);
  if(at===8&&(type!=='IHDR'||length!==13))invalid('PNG IHDR framing');
  if(type==='IHDR'&&at!==8)invalid('duplicate PNG IHDR');
  if(type==='IDAT')seenData=true;
  if(type==='iCCP'){
   if(seenData)invalid('late PNG iCCP');
   if(profileChunk)invalid('duplicate PNG iCCP');
   const payload=bytes.subarray(at+8,end-4),zero=payload.indexOf(0);
   if(zero<1||zero>79||zero+2>=payload.length)invalid('PNG iCCP framing');
   validateKeyword(payload.subarray(0,zero));
   if(payload[zero+1]!==0)refuse('unsupported PNG iCCP compression method');
   profileChunk=payload.subarray(zero+2);drop.push([at,end]);
  }
  if(type==='sRGB'){
   if(seenData||srgb||length!==1||bytes[at+8]>3)invalid('PNG sRGB declaration');
   srgb=true;
  }
  if(type==='eXIf')drop.push([at,end]);
  at=end;
 }
 if(profileChunk&&srgb)refuse('conflicting PNG ICC and sRGB declarations');
 const orientation=pngSourceOrientation(bytes).orientation;
 let decoderBytes=bytes;
 if(drop.length){const out=new Uint8Array(bytes.length-drop.reduce((n,[a,b])=>n+b-a,0));let sourceAt=0,targetAt=0;for(const [start,end] of drop){out.set(bytes.subarray(sourceAt,start),targetAt);targetAt+=start-sourceAt;sourceAt=end;}out.set(bytes.subarray(sourceAt),targetAt);decoderBytes=out;}
 return {decoderBytes,profileChunk,orientation};
}

function parseJpeg(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),icc=new Map(),drop=[];
 let at=2,total=null,scan=false;
 while(at<bytes.length){
  if(bytes[at++]!==0xff)invalid('JPEG marker framing');
  while(at<bytes.length&&bytes[at]===0xff)at++;
  if(at>=bytes.length)invalid('truncated JPEG marker');
  const marker=bytes[at++];
  if(marker===0xd9)break;
  if(marker===0xda){scan=true;break;}
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(at+2>bytes.length)invalid('truncated JPEG segment length');
  const length=v.getUint16(at);if(length<2||length>bytes.length-at)invalid('JPEG segment length');
  const start=at-2,end=at+length,payload=bytes.subarray(at+2,end);
  if(marker===0xe2&&text(payload.subarray(0,11))==='ICC_PROFILE'){
   if(payload.length<14||payload[11]!==0)invalid('JPEG ICC framing');
   const sequence=payload[12],count=payload[13];
   if(!sequence||!count||sequence>count||(total!==null&&total!==count)||icc.has(sequence))invalid('JPEG ICC sequence');
   total=count;icc.set(sequence,payload.subarray(14));drop.push([start,end]);
  }
  if(marker===0xe1&&text(payload.subarray(0,6))==='Exif\0\0')drop.push([start,end]);
  at=end;
 }
 if(!scan)invalid('JPEG scan missing');
 let profile=null;
 if(total!==null){
  if(icc.size!==total)invalid('incomplete JPEG ICC sequence');
  let size=0;for(const part of icc.values()){size+=part.length;if(size>MAX_PROFILE)invalid('JPEG ICC exceeds 64 KiB');}
  profile=new Uint8Array(size);let offset=0;for(let i=1;i<=total;i++){const part=icc.get(i);if(!part)invalid('incomplete JPEG ICC sequence');profile.set(part,offset);offset+=part.length;}
  try{validateRGBProfile(profile);}catch(error){invalid(`ICC profile rejected: ${error.message}`);}
 }
 const orientation=jpegOrientation(bytes);
 let decoderBytes=bytes;
 if(drop.length){const out=new Uint8Array(bytes.length-drop.reduce((n,[a,b])=>n+b-a,0));let sourceAt=0,targetAt=0;for(const [start,end] of drop){out.set(bytes.subarray(sourceAt,start),targetAt);targetAt+=start-sourceAt;sourceAt=end;}out.set(bytes.subarray(sourceAt),targetAt);decoderBytes=out;}
 return {decoderBytes,profile,orientation};
}

/** Read bounded ICC/orientation metadata, leaving the supplied original untouched. */
export async function readWorkerSourceMetadata(source){
 if(!(source instanceof Uint8Array))invalid('Uint8Array required');
 const shape=dimensions(source),original=new Uint8Array(source);
 const parsed=shape.type==='png'?parsePng(original):shape.type==='jpeg'?parseJpeg(original):invalid('unsupported image type');
 const profile=shape.type==='png'&&parsed.profileChunk?await inflateProfile(parsed.profileChunk):parsed.profile??null;
 if(profile&&shape.type==='png'){
  try{validateRGBProfile(profile);}catch(error){invalid(`ICC profile rejected: ${error.message}`);}
 }
 const admission=admitSourceColor(parsed.decoderBytes);
 if(admission.width!==shape.width||admission.height!==shape.height)invalid('decoder dimensions changed');
 return {decoderBytes:parsed.decoderBytes,profile,width:shape.width,height:shape.height,type:shape.type,orientation:parsed.orientation,colorStatus:profile?'embedded_rgb_profile':admission.colorStatus};
}
