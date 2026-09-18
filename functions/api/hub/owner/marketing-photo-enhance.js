// Reference-conditioned preview derivatives. Originals and posts are never modified.
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { generatePlateImageDetailed } from '../../../_lib/plate_image.js';
import { budgetGate } from '../../../_lib/ai_budget.js';
const PRESETS = {
  natural: 'Subtle neutral white balance, gentle exposure correction, and restrained clarity.',
  bright: 'Gently lift shadows and improve exposure while retaining natural food colors and highlights.',
  warm: 'Add only a subtle warm white balance and gentle contrast; retain truthful ingredient colors.',
};
const MAX_BYTES=5*1024*1024;
export const onRequestPost=async({request,env})=>{
 const ctx=await requireRole(request,env,MARKETING_DESK);if(ctx instanceof Response)return ctx;
 if(!env.MEDIA)return bad('Photo storage is unavailable.',503);
 let b;try{b=await request.json();}catch{return bad('Invalid request.');}
 const key=typeof b?.media_key==='string'?b.media_key:'';
 if(key.length>300||!/^marketing-library\/[A-Za-z0-9_/-]+\.(jpg|jpeg|png|webp)$/.test(key)||key.includes('..')||key.includes('//'))return bad('Choose a photo from the library.');
 if(!Object.hasOwn(PRESETS,b.preset))return bad('Choose natural, bright or warm polish.');
 let source;try{source=await env.MEDIA.get(key);}catch{return bad('Could not read the source photo.',503);}
 if(!source)return bad('Source photo not found.',404);
 if(source.customMetadata?.ai_enhanced === 'true' || source.customMetadata?.source_key) return bad('Choose the original photo for polish, not an AI-enhanced copy.',409);
 if(source.size>MAX_BYTES)return bad('Source photo exceeds the 5MB limit.',413);
 let bytes;try{bytes=new Uint8Array(await source.arrayBuffer());}catch{return bad('Could not read the source photo.',503);}
 if(!bytes.length||bytes.length>MAX_BYTES)return bad('Source photo is empty or too large.',413);
 const contentType=source.httpMetadata?.contentType;
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!(contentType==='image/jpeg'?jpeg:contentType==='image/png'?png:contentType==='image/webp'?webp:false))return bad('Source is not a supported photo.');
 const gate=await budgetGate(env);if(!gate.ok)return bad(gate.reason === 'budget_unavailable' ? 'AI budget ledger unavailable. Your original photo is still available.' : 'Weekly AI budget reached. Your original photo is still available.',gate.reason === 'budget_unavailable' ? 503 : 429);
 const positive=`Retouch the mandatory REFERENCE PHOTO conservatively. ${PRESETS[b.preset]} Preserve the exact actual food, ingredients, portion sizes, counts, plating, containers, packaging, logos, labels, written text, camera viewpoint and composition. Do not invent or remove objects. Do not redesign branding or replace the background. Only photographic polish. If a detail cannot be preserved, leave it unchanged.`;
 let made;
 try{made=await generatePlateImageDetailed(env,'Library photo polish: '+b.preset,{requireJpeg:true,role:'photo',referenceImage:{bytes,contentType},core:{positive,negative:'invented food, changed food, changed count, changed packaging, altered logo, altered text, new props, changed background, synthetic plastic food',source:'library_photo_polish',cached:false},provenance:{referenceKey:key}});}catch{made=null;}
 if(!made?.key)return bad('Reference-based polish is unavailable or did not finish. Your original is unchanged.',503);
 let derivative;try{derivative=await env.MEDIA.get(made.key);}catch{return bad('Polish finished but its preview is unavailable. Your original is unchanged.',503);}
 if(!derivative)return bad('Polish preview is unavailable. Your original is unchanged.',503);
 let output;try{output=new Uint8Array(await derivative.arrayBuffer());}catch{return bad('Could not read the polished preview.',503);}
 if(output.length>MAX_BYTES||output[0]!==255||output[1]!==216||output[2]!==255)return bad('Polish did not produce a usable JPEG.',503);
 const uploaded_at=new Date().toISOString();const derivativeKey='marketing-library/'+uploaded_at.slice(0,7)+'/'+id('polished')+'_photo.jpg';
 const name=(source.customMetadata?.name||'Photo').slice(0,130)+' — '+b.preset;
 let tags=[];try{tags=JSON.parse(source.customMetadata?.tags||'[]');}catch{tags=[];}
 if(!Array.isArray(tags))tags=[];
 const metadata={name,folder:source.customMetadata?.folder||'',tags:JSON.stringify(tags),content_type:'image/jpeg',uploaded_at,source_key:key,preset:b.preset,provider:made.provider,model:made.model,ai_enhanced:'true'};
 try{await env.MEDIA.put(derivativeKey,output,{httpMetadata:{contentType:'image/jpeg'},customMetadata:metadata});}catch{return bad('Could not save the polished preview. Your original is unchanged.',503);}
 return json({ok:true,source_key:key,provider:made.provider,model:made.model,review_required:true,photo:{media_key:derivativeKey,name,folder:metadata.folder,tags:JSON.parse(metadata.tags),content_type:'image/jpeg',uploaded_at,source_key:key,preset:b.preset,provider:made.provider,model:made.model,ai_enhanced:true,url:'/api/hub/media/'+derivativeKey}});
};
