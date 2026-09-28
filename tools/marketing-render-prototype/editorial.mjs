// Isolated WASM editorial adapter. No application imports this file.
import {Resvg} from '@resvg/resvg-wasm';
import geometry from '../../public/hub/owner/assets/marketing-editorial-plan.js';
import {dimensions} from './core.mjs';
import {encode} from './jpeg-encoder.mjs';
export const INKS=Object.freeze({parchment:'#E8E2CA',deep:'#0A180C',black:'#000000',gold:'#C8BC6E'});
const escape=s=>s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const svg=(body,w,h)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">${body}</svg>`;
function uri(bytes,type){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return `data:image/${type};base64,${btoa(value)}`;}
function raster(xml,fonts){let engine,image;try{engine=new Resvg(xml,{font:{fontBuffers:fonts,defaultFontFamily:'Cormorant Garamond'}});image=engine.render();return {pixels:new Uint8Array(image.pixels),width:image.width,height:image.height};}finally{image?.free();engine?.free();}}
function measure(text,px,family,weight,fonts){let engine,box;try{engine=new Resvg(svg(`<text x="200" y="200" font-family="${family}" font-weight="${weight}" font-size="${px}">${escape(text)}</text>`,2048,512),{font:{fontBuffers:fonts,defaultFontFamily:family}});box=engine.innerBBox();if(!box||box.width<=0||box.height<=0)throw Error('Text has no measurable glyphs');return {x:box.x-200,y:box.y-200,w:box.width,h:box.height};}finally{box?.free();engine?.free();}}
const luminance=rgb=>rgb.map(n=>{n/=255;return n<=.03928?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function stats(pixels,W,H,r){const x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y)),w=Math.min(W-x,Math.max(1,Math.round(r.w))),h=Math.min(H-y,Math.max(1,Math.round(r.h)));let sum=0,sq=0,n=0;for(let i=0;i<w*h;i+=Math.max(1,Math.floor(w*h/1500))){const at=((y+Math.floor(i/w))*W+x+i%w)*4,l=luminance(Array.from(pixels.subarray(at,at+3)));sum+=l;sq+=l*l;n++;}const lum=sum/n;return {lum,busy:Math.sqrt(Math.max(0,sq/n-lum*lum))};}
const ratio=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
function chooseInk(background){function score(color){const l=luminance(rgb(color));return Math.min(ratio(l,Math.max(0,background.lum-background.busy)),ratio(l,Math.min(1,background.lum+background.busy)));}let color=score(INKS.parchment)>=score(INKS.deep)?INKS.parchment:INKS.deep;if(score(color)<4.5&&score(INKS.black)>score(color))color=INKS.black;return {color,estimatedContrast:score(color),background};}
function fittedText(title,kicker,region,fonts,S){
 const cache=new Map();function m(text,px,family='Cormorant Garamond',weight=600){const key=[text,px,family,weight].join('|');if(!cache.has(key))cache.set(key,measure(text,px,family,weight,fonts));return cache.get(key);}
 let kp=Math.max(14,Math.round(S*.018)),kb=null;if(kicker){while(kp>=14){kb=m(kicker,kp,'Josefin Sans',500);if(kb.w<=region.w)break;kp--;}if(kp<14)throw Error('The kicker does not fit');}
 const gap=kicker?S*.012:0,min=Math.round(S*.026);
 for(let px=Math.round(S*.064);px>=min;px--){
  const lines=[];let line='';for(const word of title.split(' ')){const next=line?line+' '+word:word;if(line&&m(next,px).w>region.w){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
  const boxes=lines.map(text=>m(text,px));const height=(kicker?kp:0)+gap+px*1.16*lines.length+px*.2;
  if(lines.length>2||boxes.some(b=>b.w>region.w)||height>region.h)continue;
  let top=region.y;const runs=[];if(kicker){runs.push({role:'kicker',text:kicker,px:kp,family:'Josefin Sans',weight:500,bounds:{x:region.x,y:top,w:kb.w,h:kb.h},origin:{x:region.x-kb.x,y:top-kb.y}});top+=kp+gap;}
  lines.forEach((text,i)=>{const b=boxes[i];runs.push({role:'headline',text,px,family:'Cormorant Garamond',weight:600,bounds:{x:region.x,y:top,w:b.w,h:b.h},origin:{x:region.x-b.x,y:top-b.y}});top+=px*1.16;});
  if(runs.some(r=>r.bounds.y+r.bounds.h>region.y+region.h))continue;
  return runs;
 }
 throw Error('The headline does not fit the clear space');
}
function background(sourceUri,layout,fonts){
 const probe=raster(svg(`<image xlink:href="${sourceUri}" width="32" height="32" preserveAspectRatio="none"/>`,32,32),fonts).pixels;
 const color=(x,y)=>'rgb('+Array.from(probe.subarray((y*32+x)*4,(y*32+x)*4+3)).join(',')+')';
 const {width:W,height:H,photo:p}=layout;let defs='',edges='';
 function edge(id,rect,stops,vertical){defs+=`<linearGradient id="${id}" x1="0" y1="0" x2="${vertical?0:1}" y2="${vertical?1:0}">${stops.map((c,i)=>`<stop offset="${i/2}" stop-color="${c}"/>`).join('')}</linearGradient>`;edges+=`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="url(#${id})"/>`;}
 if(p.y>0){edge('top',{x:0,y:0,w:W,h:p.y+1},[color(1,0),color(16,0),color(30,0)],false);edge('bottom',{x:0,y:p.y+p.h-1,w:W,h:H-p.y-p.h+1},[color(1,31),color(16,31),color(30,31)],false);}
 if(p.x>0){edge('left',{x:0,y:0,w:p.x+1,h:H},[color(0,1),color(0,16),color(0,30)],true);edge('right',{x:p.x+p.w-1,y:0,w:W-p.x-p.w+1,h:H},[color(31,1),color(31,16),color(31,30)],true);}
 return `<rect width="${W}" height="${H}" fill="${INKS.deep}"/><defs>${defs}</defs>${edges}<image id="source-photo" xlink:href="${sourceUri}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" preserveAspectRatio="xMidYMid meet"/>`;
}
export function renderEditorial({source,emblem,font,kickerFont,title,kicker='',templateId,protectedRegions}){
 if(!['reposado-wide','reposado-cajita'].includes(templateId))throw Error('Unsupported editorial profile; vertical and other layouts are not implemented');
 if(typeof title!=='string'||!title.trim()||title.length>80||typeof kicker!=='string'||kicker.length>50||/[\u0000-\u001f]/.test(title+kicker))throw Error('Invalid short editorial wording');
 if(!(font instanceof Uint8Array)||!font.length||(kicker&&(!(kickerFont instanceof Uint8Array)||!kickerFont.length)))throw Error('Pinned headline and kicker font bytes are required');
 const sourceInfo=dimensions(source),emblemInfo=dimensions(emblem),fonts=kicker?[font,kickerFont]:[font];
 const layout=geometry.plan({sourceWidth:sourceInfo.width,sourceHeight:sourceInfo.height,templateId,protectedRegions});
 const runs=fittedText(title.trim().replace(/\s+/g,' '),kicker.trim().toUpperCase(),layout.textRegion,fonts,Math.min(layout.width,layout.height));
 const base=background(uri(source,sourceInfo.type),layout,fonts),surface=raster(svg(base,layout.width,layout.height),fonts);
 const textInk=chooseInk(stats(surface.pixels,layout.width,layout.height,layout.textRegion));
 const region=layout.emblemRegion,aspect=emblemInfo.width/emblemInfo.height,mw=Math.min(region.w,region.h*aspect),mh=mw/aspect,mark={x:region.x+(region.w-mw)/2,y:region.y+(region.h-mh)/2,w:mw,h:mh};
 const emblemInk=chooseInk(stats(surface.pixels,layout.width,layout.height,mark));
 const words=runs.map(r=>`<text x="${r.origin.x}" y="${r.origin.y}" font-family="${r.family}" font-weight="${r.weight}" font-size="${r.px}" fill="${textInk.color}">${escape(r.text)}</text>`).join('');
 const markSvg=`<defs><filter id="brand-tint" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feFlood flood-color="${emblemInk.color}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><image id="brand-emblem" xlink:href="${uri(emblem,emblemInfo.type)}" x="${mark.x}" y="${mark.y}" width="${mark.w}" height="${mark.h}" filter="url(#brand-tint)"/>`;
 const xml=svg(base+words+markSvg,layout.width,layout.height),out=raster(xml,fonts);
 return {jpg:encode({data:out.pixels,width:out.width,height:out.height},94).data,svg:xml,source:sourceInfo,layout,ink:{text:textInk,emblem:emblemInk},measurements:{runs,emblem:mark},visualReviewRequired:true,deviations:['Experimental kicker uses 1.8% of short edge with a 14px floor, larger than Canvas 1.3%/10px floor.','Glyph-outline top placement differs from Canvas textBaseline top.','Canvas shadow halo is not implemented.','Edge sampling and glyph rasterization use resvg, not browser Canvas.','Font bytes are caller supplied; exact font axes and missing glyph coverage are unverified.','No EXIF orientation or ICC normalization.'],pixelVerification:'unverified',resourceReadiness:'unverified'};
}
