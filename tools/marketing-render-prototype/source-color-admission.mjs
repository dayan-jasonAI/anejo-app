// Local header admission, not color conversion or authenticity verification.
import {dimensions} from './core.mjs';
import {jpegOrientation,pngSourceOrientation} from './source-orientation.mjs';
const {crc32}=globalThis.AnejoImageOrientation;
const text=b=>String.fromCharCode(...b);
export class SourceColorError extends Error{constructor(reason,invalid=false){super(invalid?'source_color_invalid':'source_color_normalization_required');this.name='SourceColorError';this.reason=reason;}}
const refuse=r=>{throw new SourceColorError(r);},invalid=r=>{throw new SourceColorError(r,true);};
function pngAdmission(b){
 const orientation=pngSourceOrientation(b).orientation,v=new DataView(b.buffer,b.byteOffset,b.length);
 if(b[24]!==8||![2,6].includes(b[25]))refuse('png_requires_8bit_rgb_or_rgba');
 if(b[26]!==0||b[27]!==0||![0,1].includes(b[28]))invalid('png_encoding_fields');
 let at=8,srgb=false,gamma=false,chroma=false,seenData=false;
 while(at<b.length){const n=v.getUint32(at),type=text(b.subarray(at+4,at+8)),end=at+n+12;
  if(crc32(b.subarray(at+4,end-4))!==v.getUint32(end-4))invalid('png_chunk_crc');
  if(type==='IHDR'&&at!==8)invalid('duplicate_png_header');if(type==='IDAT')seenData=true;
  if(type==='iCCP')refuse('embedded_icc_requires_conversion');
  if(['cICP','mDCv','cLLi','acTL','fcTL','fdAT'].includes(type))refuse('hdr_or_animated_png');
  if(['sRGB','gAMA','cHRM'].includes(type)&&seenData)invalid('late_png_color_declaration');
  if(type==='sRGB'){if(srgb||n!==1||b[at+8]>3)invalid('png_srgb_declaration');srgb=true;}
  if(type==='gAMA'){if(gamma||n!==4)invalid('png_gamma_declaration');gamma=true;if(v.getUint32(at+8)!==45455)refuse('nonstandard_png_gamma');}
  if(type==='cHRM'){if(chroma||n!==32)invalid('png_chromaticity_declaration');chroma=true;if([31270,32900,64000,33000,30000,60000,15000,6000].some((x,i)=>v.getUint32(at+8+i*4)!==x))refuse('nonstandard_png_chromaticities');}
  at=end;
 }return {orientation,colorStatus:srgb?'declared_srgb':'assumed_srgb'};
}
function photoshopResources(p){
 if(p.length<14||text(p.subarray(0,14))!=='Photoshop 3.0\0')refuse('unsupported_jpeg_application_metadata');
 const v=new DataView(p.buffer,p.byteOffset,p.length);let at=14;
 while(at<p.length){
  if(p.length-at<7||text(p.subarray(at,at+4))!=='8BIM')invalid('photoshop_resource_framing');
  const id=v.getUint16(at+4);at+=6;const nameLength=p[at],nameBytes=1+nameLength,paddedName=nameBytes+(nameBytes%2);
  if(paddedName>p.length-at||p.length-at-paddedName<4)invalid('photoshop_resource_name');
  if(nameBytes%2&&p[at+nameBytes]!==0)invalid('photoshop_resource_padding');at+=paddedName;
  const size=v.getUint32(at);at+=4;const paddedSize=size+(size%2);
  if(paddedSize>p.length-at)invalid('photoshop_resource_size');
  if(size%2&&p[at+size]!==0)invalid('photoshop_resource_padding');
  // Only the observed IPTC container and its digest are admitted. This does not
  // interpret their text or establish photo authenticity. ICC/unknown IDs refuse.
  if(![0x0404,0x0425].includes(id))refuse('unsupported_photoshop_resource');
  if(id===0x0425&&size!==16)invalid('photoshop_digest_size');
  at+=paddedSize;
 }
}
function jpegAdmission(b){
 const orientation=jpegOrientation(b),v=new DataView(b.buffer,b.byteOffset,b.length);let at=2,frame=false;
 while(at<b.length){at++;while(b[at]===255)at++;const marker=b[at++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
  const n=v.getUint16(at),p=b.subarray(at+2,at+n);
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(frame||![192,193,194].includes(marker)||p.length<6||p[0]!==8||p[5]!==3)refuse('jpeg_requires_8bit_three_component_frame');if(p.length!==6+3*p[5])invalid('jpeg_frame_length');frame=true;}
  if(marker===226)refuse(text(p.subarray(0,11))==='ICC_PROFILE'?'embedded_icc_requires_conversion':'jpeg_auxiliary_image_metadata');
  // XMP/JUMBF/unknown APP blocks can signal HDR gain maps; not interpreted here.
  if(marker===225&&text(p.subarray(0,6))!=='Exif\0\0')refuse('unsupported_jpeg_application_metadata');
  if(marker===237)photoshopResources(p);
  if(marker>=227&&marker<=239&&![237,238].includes(marker))refuse('unsupported_jpeg_application_metadata');
  if(marker===238&&(p.length!==12||text(p.subarray(0,5))!=='Adobe'||![0,1].includes(p[11])))refuse('unsupported_adobe_color_transform');
  at+=n;
 }if(!frame)invalid('jpeg_frame_missing');return {orientation,colorStatus:'assumed_srgb'};
}
export function admitSourceColor(bytes){
 if(!(bytes instanceof Uint8Array))invalid('uint8array_required');let shape,admission;
 try{shape=dimensions(bytes);admission=shape.type==='png'?pngAdmission(bytes):jpegAdmission(bytes);}catch(e){if(e instanceof SourceColorError)throw e;invalid('source_header_or_orientation');}
 return {schema:'anejo-source-color-admission-v1',format:shape.type,width:shape.width,height:shape.height,...admission,conversionPerformed:false,visualReviewRequired:true,colorVerification:'header_only',authenticity:'unverified'};
}
