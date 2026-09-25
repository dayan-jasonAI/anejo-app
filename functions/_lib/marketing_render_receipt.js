export const MAX_JPEG=5*1024*1024;
export const MAX_BODY=Math.ceil(MAX_JPEG/3)*4+32768;
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export const textBytes=value=>new TextEncoder().encode(value);
export const sourceKey=key=>typeof key==='string'&&key.length<=400&&/^(studio|marketing-library)\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(key)&&!key.includes('..');
export function declarationValid(d){
 if(!d||Array.isArray(d)||typeof d!=='object'||Object.keys(d).length!==4||!['renderer_version','template_id','options','layout'].every(k=>Object.hasOwn(d,k)))return false;
 if(typeof d.renderer_version!=='string'||!d.renderer_version||d.renderer_version.length>100||typeof d.template_id!=='string'||!d.template_id||d.template_id.length>100)return false;
 const forbidden=new Set(['actor','actor_id','approved','verified','evidence_tier','trust_level','__proto__','constructor','prototype']);
 const valid=(v,depth)=>{if(depth>6)return false;if(v===null)return true;if(typeof v==='string')return v.length<=2000;if(typeof v==='number')return Number.isFinite(v);if(typeof v==='boolean')return true;if(Array.isArray(v))return v.length<=100&&v.every(x=>valid(x,depth+1));if(typeof v==='object')return Object.keys(v).length<=100&&Object.entries(v).every(([k,x])=>k.length<=80&&!forbidden.has(k.toLowerCase())&&valid(x,depth+1));return false;};
 return typeof d.options==='object'&&d.options!==null&&!Array.isArray(d.options)&&typeof d.layout==='object'&&d.layout!==null&&!Array.isArray(d.layout)&&valid(d,0)&&textBytes(JSON.stringify(d)).length<=12288;
}
export function jpegDimensions(bytes){
 if(bytes.length<20||bytes.length>MAX_JPEG||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('invalid_jpeg');
 let i=2,shape=null;while(i+4<=bytes.length){if(bytes[i++]!==255)throw Error('invalid_jpeg');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===218||marker===217)break;const n=(bytes[i]<<8)|bytes[i+1];if(n<2||i+n>bytes.length)throw Error('invalid_jpeg');if([192,193,194].includes(marker)){if(n<8)throw Error('invalid_jpeg');shape={width:(bytes[i+5]<<8)|bytes[i+6],height:(bytes[i+3]<<8)|bytes[i+4]};}i+=n;}
 if(!shape||shape.width<1||shape.height<1||shape.width>8192||shape.height>8192||shape.width*shape.height>24000000)throw Error('invalid_jpeg_dimensions');return shape;
}
export async function readBoundedJson(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))throw Error('json_required');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_json');const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();throw Error('request_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}

export function sourceMagicValid(key,bytes){
 if(/\.jpe?g$/i.test(key))return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(/\.png$/i.test(key))return [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
 if(/\.webp$/i.test(key))return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 return false;
}
