import {json} from '../_lib/util.js';
import {renderEventBands} from '../_lib/catering_event_labels.js';
const headers={'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src https://anejocateringco.com; font-src https://anejocateringco.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"};
const error=(message,status=400)=>json({ok:false,error:message},status,headers);
export async function onRequestPost({request}){
 const origin=request.headers.get('Origin');
 if(origin){try{if(new URL(origin).origin!==new URL(request.url).origin)return error('Origin not allowed.',403);}catch{return error('Origin not allowed.',403);}}
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return error('JSON required.',415);
 let body;
 try{const reader=request.body?.getReader();if(!reader)return error('Request body required.');const chunks=[];let total=0;while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>4096){await reader.cancel();return error('Preview request too large.',413);}chunks.push(part.value);}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return error('Invalid preview request.');}
 if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['theme','title','lines'].includes(k)))return error('Only template style, wording and dish names may be previewed.');
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!Array.from(v).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127);
 if(!['ivory','blush','signature'].includes(body.theme)||!text(body.title,48)||!Array.isArray(body.lines)||body.lines.length<1||body.lines.length>3||!body.lines.every(n=>text(n,80)))return error('Choose a template, wording up to 48 characters and one to three dish names up to 80 characters.');
 const html=renderEventBands({snapshot:{theme:body.theme,title:body.title.trim(),phone:'561-778-7474',lines:body.lines.map(name=>({name:name.trim()}))}});
 return json({ok:true,html,preview_only:true,approved:false,custom_artwork_included:false},200,headers);
}
export const onRequestGet=()=>error('Use the template preview controls.',405);
