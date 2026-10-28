// Staff-only recipe standards. Drafts never replace the operational recipe; owner approval
// binds an exact version, verified source and explicit catalog unit conversions.
import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {putMedia} from '../../../_lib/media.js';
import {recipeAuthorityMatrix,recipeRevisionView,createRecipeIdentity,saveRecipeRevision,submitRecipeRevision,approveRecipeRevision} from '../../../_lib/recipe_authority.js';
import {requestedReadingLocale,legacyRecipeReadingEdition,recipeListReadingNames} from '../../../_lib/localized_operating_content.js';
export const onRequestGet=async({request,env})=>{
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 try{
  const url=new URL(request.url),recipeId=url.searchParams.get('id'),locale=requestedReadingLocale(request);
  if(recipeId){const view=await recipeRevisionView(env,recipeId);if(!view)return bad('Recipe not found.',404);const reading_edition_es=locale==='es'?await legacyRecipeReadingEdition(env,recipeId,locale):undefined;return json({ok:true,actor_role:ctx.role,...view,...(reading_edition_es?{reading_edition_es}:{})});}
  return json({ok:true,actor_role:ctx.role,...await recipeAuthorityMatrix(env),...(locale==='es'?{recipe_name_editions_es:await recipeListReadingNames(env)}:{})});
 }catch{return bad('Recipe records unavailable. No empty or approved state can be inferred.',503);}
};
export const onRequestPost=async({request,env})=>{
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 let b;try{b=await request.json();}catch{return bad('Invalid JSON.');}
 if(!b||typeof b!=='object'||Array.isArray(b))return bad('Invalid recipe action.');
 if(b.op==='approve'&&ctx.role!=='owner')return bad('Only Dayan may approve a recipe.',403);
 try{
  if(b.op==='photo'){
   if(!/^data:image\/(?:jpeg|png|webp);base64,/.test(String(b.data_url||'')))return bad('Use a JPEG, PNG or WebP image, up to 5 MB.');
   const result=await putMedia(env,{kind:'kitchen',dataUrl:b.data_url});
   return result.stored?json({ok:true,url:result.url}):bad('Photo was not stored. Keep your original and try again.',503);
  }
  let recipeId=b.recipe_id;
  if(b.op==='create'){recipeId=await createRecipeIdentity(env,b.spec,ctx);await saveRecipeRevision(env,{recipe_id:recipeId,spec:b.spec,expected_revision_id:null},ctx);}
  else if(b.op==='save')await saveRecipeRevision(env,b,ctx);
  else if(b.op==='submit'){const revision=await submitRecipeRevision(env,b.revision_id,ctx);recipeId=revision.recipe_id;}
  else if(b.op==='approve'){const approved=await approveRecipeRevision(env,b,ctx);recipeId=approved.recipe_id;}
  else return bad('Unknown recipe action.');
  return json({ok:true,actor_role:ctx.role,...await recipeRevisionView(env,recipeId)});
 }catch(error){return bad(String(error?.message||'Recipe action failed.'),409);}
};
