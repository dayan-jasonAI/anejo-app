import {Resvg,initWasm} from '@resvg/resvg-wasm';
import {encode} from './jpeg-encoder.mjs';
// Mirror only the fixed prototype's required browser BRAND_INK tokens.
// test.mjs checks these against the browser source; this is not full Canvas parity.
export const TEMPLATE_TOKENS=Object.freeze({titleInk:'#E8E2CA',background:'#0A180C',fontFamily:'Cormorant Garamond',fontWeight:600});
let ready;
export const initialize=module=>ready||(ready=initWasm(module));
export function dimensions(b) {
 if(b.byteLength>5*1024*1024)throw Error('Compressed image exceeds 5 MiB');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let width,height,type;
 if(b.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)) {width=v.getUint32(16);height=v.getUint32(20);type='png';}
 else if(b[0]===255&&b[1]===216){type='jpeg';let p=2;while(p+4<=b.length){if(b[p++]!==255)throw Error('Invalid JPEG marker');while(b[p]===255)p++;const marker=b[p++];if(marker===217||marker===218)break;const len=v.getUint16(p);if(len<2||p+len>b.length)throw Error('Invalid JPEG segment');if([192,193,194].includes(marker)){if(len<8)throw Error('Invalid JPEG frame');height=v.getUint16(p+3);width=v.getUint16(p+5);break;}p+=len;}}
 if(!width||!height||width>4096||height>4096||width*height>4_000_000)throw Error('Unsupported image or decoded dimensions exceed 4 MP / 4096 edge');
 return {width,height,type,rgbaBytes:width*height*4};
}
const escape=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function template(d,title='Little box. Big occasion.') {
 if(typeof title!=='string'||title.length>40||/[\r\n]/.test(title))throw Error('Headline must fit one short line');
 const scale=Math.min(1080/d.width,810/d.height),w=d.width*scale,h=d.height*scale;
 return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="810"><rect width="1080" height="810" fill="${TEMPLATE_TOKENS.background}"/><image xlink:href="source.jpg" x="${(1080-w)/2}" y="${(810-h)/2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/><text x="107" y="757" font-family="${TEMPLATE_TOKENS.fontFamily}" font-size="29" font-weight="${TEMPLATE_TOKENS.fontWeight}" fill="${TEMPLATE_TOKENS.titleInk}">${escape(title)}</text><image xlink:href="emblem.png" x="43" y="717" width="45" height="43" preserveAspectRatio="xMidYMid meet"/></svg>`;
}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
export function render({source,emblem,font,title}) {
 const d=dimensions(source);dimensions(emblem);const svg=template(d,title).replace('source.jpg','data:image/'+d.type+';base64,'+base64(source)).replace('emblem.png','data:image/png;base64,'+base64(emblem));let renderer,image;
 try {renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Cormorant Garamond'},background:TEMPLATE_TOKENS.background});image=renderer.render();const pixels=image.pixels;if(pixels.length!==1080*810*4)throw Error('Unexpected raster dimensions');const jpg=encode({data:pixels,width:image.width,height:image.height},92).data;return{jpg,svg,source:d,width:image.width,height:image.height};}
 finally{image?.free();renderer?.free();}
}
