import {MAX_JPEG,sha256,sourceKey,sourceMagicValid} from './marketing_render_receipt.js';
const receiptKey = key => /^studio\/render-receipts\//.test(key);
export async function readPhotoObject(env,key){
 if(!sourceKey(key))throw Error('invalid_source_key');
 const object=await env.MEDIA.get(key);
 if(!object||!Number.isFinite(object.size)||object.size<1||object.size>MAX_JPEG)throw Error('preserved_photo_unavailable');
 const bytes=new Uint8Array(await object.arrayBuffer());
 if(bytes.length!==object.size||!sourceMagicValid(key,bytes))throw Error('preserved_photo_invalid');
 return {key,bytes,hash:await sha256(bytes),metadata:object.customMetadata||{}};
}
// Only server byte associations may connect editorial derivatives to their parents.
// An arbitrary metadata source_key is never a lineage authority.
export async function resolvePreEditorialSource(env,currentKey){
 const seen=new Set();let key=currentKey,expected=null,currentHash=null,depth=0,photo;
 while(true){
  if(seen.has(key))throw Error('editorial_history_cycle');seen.add(key);
  photo=await readPhotoObject(env,key);
  if(currentHash===null)currentHash=photo.hash;
  if(expected&&photo.hash!==expected)throw Error('preserved_photo_changed');
  if(!receiptKey(key)){
   if(photo.metadata.enhancement_method==='editorial_overlay')throw Error('editorial_history_unverified');
   break;
  }
  if(depth>=8)throw Error('editorial_history_limit');
  const receipt=await env.DB.prepare('SELECT source_key,source_sha256,output_sha256,state FROM marketing_render_receipts WHERE output_key=?').bind(key).first();
  if(!receipt||receipt.state!=='attached'||receipt.output_sha256!==photo.hash||!sourceKey(receipt.source_key)||!(/^[a-f0-9]{64}$/.test(receipt.source_sha256)))throw Error('editorial_history_unverified');
  if(photo.metadata.enhancement_method!=='editorial_overlay'||photo.metadata.source_key!==receipt.source_key){
   const error=Error('editorial_history_metadata_changed');
   // Only bounded diagnostic states, never arbitrary object metadata or invented lineage.
   error.historyDiagnostic={key,depth,
    method_state:!Object.hasOwn(photo.metadata,'enhancement_method')?'missing':photo.metadata.enhancement_method==='editorial_overlay'?'matching':'mismatched',
    parent_state:!Object.hasOwn(photo.metadata,'source_key')?'missing':photo.metadata.source_key===receipt.source_key?'matching':'mismatched'};
   throw error;
  }
  key=receipt.source_key;expected=receipt.source_sha256;depth++;
 }
 return {...photo,currentKey,currentHash,depth};
}
export function recoveryDeclaration(source){return {current_key:source.currentKey,current_sha256:source.currentHash,depth:source.depth};}
export function recoveryMatches(declaration,source){return declaration&&typeof declaration==='object'&&!Array.isArray(declaration)&&Object.keys(declaration).length===3&&Object.keys(recoveryDeclaration(source)).every(key=>declaration[key]===recoveryDeclaration(source)[key]);}
