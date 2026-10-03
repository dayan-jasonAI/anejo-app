// LOCAL prototype. Not connected to app routes, source versions or private jobs.
import {Resvg} from '@resvg/resvg-wasm';
import {initialize,dimensions} from './core.mjs';
import {encodeBase64} from './base64.mjs';
import {createColorKernel} from './color-kernel.mjs';
import {readWorkerSourceMetadata} from './worker-source-metadata.mjs';
import {admitSourceColor} from './source-color-admission.mjs';
const MAX_BYTES=5*1024*1024;
const {crc32}=globalThis.AnejoImageOrientation;
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
function decode(bytes,type,W,H){let engine,image;try{
 const xml=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><image width="${W}" height="${H}" preserveAspectRatio="none" xlink:href="data:image/${type};base64,${encodeBase64(bytes)}"/></svg>`;
 engine=new Resvg(xml);image=engine.render();if(image.width!==W||image.height!==H||image.pixels.length!==W*H*4)throw Error('Unexpected source raster');return new Uint8Array(image.pixels);
 }finally{image?.free();engine?.free();}}
export function orientRGBA(input,W,H,orientation){
 if(!(input instanceof Uint8Array)||input.length!==W*H*4||!Number.isInteger(orientation)||orientation<1||orientation>8)throw Error('Invalid orientation raster');
 const width=orientation>=5?H:W,height=orientation>=5?W:H,output=new Uint8Array(input.length);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const [dx,dy]=orientation===1?[x,y]:orientation===2?[W-1-x,y]:orientation===3?[W-1-x,H-1-y]:orientation===4?[x,H-1-y]:orientation===5?[y,x]:orientation===6?[H-1-y,x]:orientation===7?[H-1-y,W-1-x]:[y,W-1-x];
  output.set(input.subarray((y*W+x)*4,(y*W+x)*4+4),(dy*width+dx)*4);
 }return {pixels:output,width,height};
}
export function resizeRGBA(pixels,W,H){
 const scale=Math.min(1,2000/W,2000/H),width=Math.max(1,Math.round(W*scale)),height=Math.max(1,Math.round(H*scale));
 if(scale===1)return {pixels,width,height,resized:false};
 const output=new Uint8Array(width*height*4);
 // Bilinear resampling in premultiplied-alpha space avoids transparent color fringes.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=Math.max(0,Math.min(W-1,(x+.5)*W/width-.5)),sy=Math.max(0,Math.min(H-1,(y+.5)*H/height-.5)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1),fx=sx-x0,fy=sy-y0;
  const samples=[[x0,y0,(1-fx)*(1-fy)],[x1,y0,fx*(1-fy)],[x0,y1,(1-fx)*fy],[x1,y1,fx*fy]],at=(y*width+x)*4;let alpha=0;const rgb=[0,0,0];
  for(const [px,py,weight] of samples){const p=(py*W+px)*4,a=pixels[p+3]/255;alpha+=a*weight;for(let c=0;c<3;c++)rgb[c]+=pixels[p+c]*a*weight;}
  output[at+3]=Math.round(alpha*255);for(let c=0;c<3;c++)output[at+c]=alpha?Math.round(rgb[c]/alpha):0;
 }return {pixels:output,width,height,resized:true};
}
function chunk(type,payload){const output=new Uint8Array(payload.length+12),view=new DataView(output.buffer);view.setUint32(0,payload.length);output.set(Array.from(type,c=>c.charCodeAt(0)),4);output.set(payload,8);view.setUint32(output.length-4,crc32(output.subarray(4,output.length-4)));return output;}
async function encodePNG(pixels,W,H){
 const raw=new Uint8Array(H*(W*4+1));for(let y=0;y<H;y++)raw.set(pixels.subarray(y*W*4,(y+1)*W*4),y*(W*4+1)+1);
 const reader=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')).getReader(),parts=[];let size=0;
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>MAX_BYTES-100)throw Error('Derivative exceeds 5 MiB');parts.push(r.value);}}finally{reader.releaseLock();}
 const compressed=new Uint8Array(size);let at=0;for(const part of parts){compressed.set(part,at);at+=part.length;}
 const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,W);view.setUint32(4,H);header.set([8,6,0,0,0],8);
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',new Uint8Array([1])),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())];
 const output=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));at=0;for(const c of chunks){output.set(c,at);at+=c.length;}return output;
}
export async function createWorkerNormalizer(resvgModule,colorModule){
 await initialize(resvgModule);const kernel=await createColorKernel(colorModule);
 return Object.freeze({async normalize(source){
  if(!(source instanceof Uint8Array))throw Error('Uint8Array source required');const original=new Uint8Array(source),metadata=await readWorkerSourceMetadata(original),{width:W,height:H}=metadata;
  let pixels=decode(metadata.decoderBytes,metadata.type,W,H);if(metadata.profile)pixels=kernel.transformRGBA(pixels,metadata.profile);
  const upright=orientRGBA(pixels,W,H,metadata.orientation),resized=resizeRGBA(upright.pixels,upright.width,upright.height),bytes=await encodePNG(resized.pixels,resized.width,resized.height),admission=admitSourceColor(bytes),shape=dimensions(bytes);
  if(admission.colorStatus!=='declared_srgb'||admission.orientation!==1||shape.width!==resized.width||shape.height!==resized.height)throw Error('Derivative metadata contract failed');
  return {bytes,receipt:{schema:'anejo-worker-source-normalization-v1',runtime:'local-worker-prototype',normalizerVersion:'resvg-lcms-rgba-1',kernelVersion:kernel.version,originalSha256:await sha(original),derivativeSha256:await sha(bytes),sourceProfileSha256:metadata.profile?await sha(metadata.profile):null,sourceColorStatus:metadata.colorStatus,outputColor:'declared_srgb',conversionPerformed:Boolean(metadata.profile),originalOrientation:metadata.orientation,originalWidth:W,originalHeight:H,width:shape.width,height:shape.height,resized:resized.resized,resizePolicy:'inside-2000x2000-no-enlargement-bilinear-premultiplied-alpha',bytes:bytes.length,format:'png',visualReviewRequired:true,resourceReadiness:'unverified'}};
 },observation:()=>kernel.observation()});
}
