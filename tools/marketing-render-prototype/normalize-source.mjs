// Node reference preprocessor. Native Sharp is NOT a Cloudflare Worker dependency.
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {dimensions} from './core.mjs';
import {jpegOrientation,pngSourceOrientation} from './source-orientation.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw Error('Photo normalization: '+message);};
const MAX_PROFILE=64*1024;
function validateICC(profile){
 if(profile.length<132||profile.length>MAX_PROFILE)fail('invalid ICC size');
 const v=new DataView(profile.buffer,profile.byteOffset,profile.length);
 if(v.getUint32(0)!==profile.length||Buffer.from(profile.subarray(36,40)).toString()!=='acsp')fail('invalid ICC header');
 if(Buffer.from(profile.subarray(16,20)).toString()!=='RGB ')fail('only RGB ICC input supported');
 const count=v.getUint32(128);if(count>256||132+count*12>profile.length)fail('invalid ICC tag table');
 for(let i=0;i<count;i++){const at=132+i*12,offset=v.getUint32(at+4),size=v.getUint32(at+8);if(offset<128||size>profile.length-offset)fail('ICC tag outside profile');}
 return profile;
}
function profileFromPNG(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length);let profile=null,at=8,srgb=false;
 // pngSourceOrientation already checked chunk framing and original EXIF.
 if(bytes[24]!==8||![2,6].includes(bytes[25]))fail('only 8-bit RGB/RGBA PNG input supported');
 while(at<bytes.length){const length=v.getUint32(at),type=Buffer.from(bytes.subarray(at+4,at+8)).toString();
  if(['cICP','mDCv','cLLi','acTL'].includes(type))fail('HDR or animated PNG needs a separately validated pipeline');
  if(type==='sRGB'){if(srgb||length!==1||bytes[at+8]>3)fail('invalid PNG sRGB declaration');srgb=true;}
  if(type==='iCCP'){
   if(profile)fail('duplicate PNG ICC profile');
   const payload=bytes.subarray(at+8,at+8+length),zero=payload.indexOf(0);
   if(zero<1||zero>79||payload[zero+1]!==0)fail('invalid PNG ICC framing');
   try{profile=validateICC(new Uint8Array(inflateSync(payload.subarray(zero+2),{maxOutputLength:MAX_PROFILE})));}catch(error){fail('invalid PNG ICC: '+error.message);}
  }
  // Nonstandard gamma/chromaticity require proof rather than silent reinterpretation.
  if(type==='gAMA'&&(length!==4||v.getUint32(at+8)!==45455))fail('unsupported PNG gamma');
  if(type==='cHRM'){
   const srgb=[31270,32900,64000,33000,30000,60000,15000,6000];
   if(length!==32||srgb.some((n,i)=>v.getUint32(at+8+i*4)!==n))fail('unsupported PNG chromaticities');
  }
  at+=length+12;
 }
 if(profile&&srgb)fail('conflicting PNG ICC and sRGB declarations');
 return {profile,declaredSRGB:srgb};
}
function profileFromJPEG(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.length),chunks=new Map();let at=2,count=null;
 while(at<bytes.length){at++;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
  const length=v.getUint16(at),payload=bytes.subarray(at+2,at+length);
  if(marker===226&&Buffer.from(payload.subarray(0,11)).toString()==='ICC_PROFILE'){
   if(payload.length<14||payload[11]!==0)fail('invalid JPEG ICC framing');
   const seq=payload[12],total=payload[13];if(!seq||!total||seq>total||chunks.has(seq)||(count!==null&&count!==total))fail('invalid JPEG ICC sequence');
   count=total;chunks.set(seq,payload.subarray(14));
  }
  at+=length;
 }
 if(count===null)return null;
 if(chunks.size!==count)fail('incomplete JPEG ICC sequence');
 const total=Array.from(chunks.values()).reduce((n,b)=>n+b.length,0);if(total>MAX_PROFILE)fail('ICC exceeds 64 KiB');
 const out=new Uint8Array(total);let offset=0;for(let i=1;i<=count;i++){out.set(chunks.get(i),offset);offset+=chunks.get(i).length;}return validateICC(out);
}
export async function normalizeSource(source){
 if(!(source instanceof Uint8Array))fail('Uint8Array input required');
 const original=new Uint8Array(source),info=dimensions(original,{maxEdge:8192,maxPixels:24_000_000});
 const orientation=info.type==='jpeg'?jpegOrientation(original):pngSourceOrientation(original).orientation;
 const color=info.type==='png'?profileFromPNG(original):{profile:profileFromJPEG(original),declaredSRGB:false},profile=color.profile;
 const warnings=[];
 const input=Buffer.from(original),options={failOn:'warning',limitInputPixels:24_000_000,animated:false};
 const reader=sharp(input,options).on('warning',message=>warnings.push(message));
 const meta=await reader.metadata();
 if(warnings.length)fail('decoder warning: '+warnings.join('; '));
 if(!['srgb','rgb'].includes(meta.space)||meta.depth!=='uchar'||(meta.pages??1)!==1)fail('unsupported input color/depth/pages');
 if((meta.orientation??1)!==orientation)fail('decoder and bounded EXIF reader disagree');
 if(Boolean(meta.icc)!==Boolean(profile)||(profile&&hash(meta.icc)!==hash(profile)))fail('decoder and bounded ICC reader disagree');
 const pipeline=sharp(input,options).on('warning',message=>warnings.push(message));
 // Explicit sRGB conversion; default metadata removal omits EXIF/XMP/GPS.
 const {data,info:output}=await pipeline.autoOrient().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').png({compressionLevel:9,adaptiveFiltering:false,palette:false}).toBuffer({resolveWithObject:true});
 if(warnings.length)fail('conversion warning: '+warnings.join('; '));
 if(data.length>5*1024*1024)fail('normalized derivative exceeds renderer 5 MiB limit');
 const derivative=new Uint8Array(data),verified=await sharp(data,options).metadata();
 if(verified.orientation||verified.exif||verified.xmp||verified.space!=='srgb'||verified.depth!=='uchar'||!verified.icc)fail('normalized metadata contract failed');
 const uprightWidth=orientation>=5?info.height:info.width,uprightHeight=orientation>=5?info.width:info.height;
 if(output.width>2000||output.height>2000||Math.abs(output.width/output.height-uprightWidth/uprightHeight)>2/output.height)fail('normalized orientation/aspect dimensions failed');
 if(uprightWidth<=2000&&uprightHeight<=2000&&(output.width!==uprightWidth||output.height!==uprightHeight))fail('unexpected source resizing');
 return {bytes:derivative,receipt:{schema:'anejo-source-normalization-v1',originalSha256:hash(original),derivativeSha256:hash(derivative),originalOrientation:orientation,originalWidth:info.width,originalHeight:info.height,resized:output.width!==uprightWidth||output.height!==uprightHeight,resizePolicy:'inside-2000x2000-no-enlargement',sourceProfileSha256:profile?hash(profile):null,sourceColorStatus:profile?'embedded_rgb_profile':color.declaredSRGB?'declared_srgb':'assumed_srgb',outputProfileSha256:hash(verified.icc),width:output.width,height:output.height,bytes:derivative.length,hasAlpha:verified.hasAlpha,format:'png',outputColor:'srgb',versions:{sharp:sharp.versions.sharp,vips:sharp.versions.vips,lcms:sharp.versions.lcms},visualReviewRequired:true,runtime:'node-reference-only'}};
}
