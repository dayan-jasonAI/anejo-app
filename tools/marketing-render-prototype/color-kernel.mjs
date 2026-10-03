// LOCAL ONLY. RGB pixel color conversion; not an image decoder/normalizer.
import {instantiate,TYPE_RGB_8} from 'lcms-wasm';
const MAX_PROFILE=65536,MAX_PIXELS=4_000_000,CHUNK_PIXELS=4096;
export function validateRGBProfile(profile){
 if(!(profile instanceof Uint8Array)||profile.length<132||profile.length>MAX_PROFILE)throw Error('Invalid RGB profile size');
 const v=new DataView(profile.buffer,profile.byteOffset,profile.length),ascii=(a,b)=>String.fromCharCode(...profile.subarray(a,b));
 if(v.getUint32(0)!==profile.length||ascii(36,40)!=='acsp'||ascii(16,20)!=='RGB ')throw Error('Invalid RGB ICC header');
 const count=v.getUint32(128);if(count>256||132+12*count>profile.length)throw Error('Invalid RGB ICC tag table');
 for(let i=0;i<count;i++){const at=132+i*12,offset=v.getUint32(at+4),size=v.getUint32(at+8);if(offset<132+12*count||offset>profile.length||size>profile.length-offset)throw Error('Invalid RGB ICC tag bounds');}
 return profile;
}
// Explicit ownership avoids the upstream convenience wrapper's exception-path allocations.
export function ownedRGBBatch(runtime,transform,input){
 let source=0,destination=0,failure,output;
 try{
  source=runtime._malloc(input.length);if(!source)throw Error('Color input allocation failed');
  destination=runtime._malloc(input.length);if(!destination)throw Error('Color output allocation failed');
  runtime.HEAPU8.set(input,source);
  runtime._cmsDoTransform(transform,source,destination,input.length/3);
  output=runtime.HEAPU8.slice(destination,destination+input.length);
 }catch(error){failure=error;}finally{
  for(const pointer of [destination,source])if(pointer)try{runtime._free(pointer);}catch{failure=Error('Color batch cleanup failed');}
 }
 if(failure)throw failure;return output;
}
export async function createColorKernel(module){
 if(!(module instanceof WebAssembly.Module))throw Error('Compiled color module required');
 const runtime=await instantiate({locateFile:()=> 'compiled-module:lcms.wasm',instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(module,imports);receive(instance,module);return instance.exports;}});
 let poisoned=false;
 return Object.freeze({
  version:'lcms-wasm-1.0.5-rgb-kernel-1',
  transform(rgb,profile){
   if(poisoned)throw Error('Color kernel unavailable after runtime failure');
   validateRGBProfile(profile);
   if(!(rgb instanceof Uint8Array)||!rgb.length||rgb.length%3||rgb.length/3>MAX_PIXELS)throw Error('Bounded RGB pixels required');
   let source=0,destination=0,transform=0,output,failure;
   try{
    source=runtime.cmsOpenProfileFromMem(profile,profile.length);if(!source||runtime.cmsGetColorSpaceASCII(source)!=='RGB')throw Error('RGB ICC could not be opened');
    destination=runtime.cmsCreate_sRGBProfile();if(!destination)throw Error('sRGB profile unavailable');
    // Explicit relative-colorimetric intent; independent of profile default intent.
    transform=runtime.cmsCreateTransform(source,TYPE_RGB_8,destination,TYPE_RGB_8,1,0);if(!transform)throw Error('RGB ICC transform unavailable');
    output=new Uint8Array(rgb.length);
    for(let at=0;at<rgb.length;at+=CHUNK_PIXELS*3){const end=Math.min(rgb.length,at+CHUNK_PIXELS*3),part=ownedRGBBatch(runtime,transform,rgb.subarray(at,end));if(!(part instanceof Uint8Array)||part.length!==end-at)throw Error('Unexpected color output');output.set(part,at);}
    }catch(error){if(transform||error instanceof WebAssembly.RuntimeError)poisoned=true;failure=error;}
   finally{let cleanupError;for(const [handle,close] of [[transform,runtime.cmsDeleteTransform],[destination,runtime.cmsCloseProfile],[source,runtime.cmsCloseProfile]])if(handle)try{close(handle);}catch(error){cleanupError??=error;}if(cleanupError){poisoned=true;failure=Error('Color profile cleanup failed');}}
   if(failure)throw failure;return output;
  },
  observation(){return {wasmLinearBytes:runtime.HEAPU8.buffer.byteLength,poisoned,scope:'linear allocation only, not peak or total memory'};}
 });
}
