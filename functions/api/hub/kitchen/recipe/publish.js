// Compatibility endpoint: Studio/kitchen submit for owner review. No staff publication bypass.
import {json,bad} from '../../../../_lib/util.js';
import {requireRole} from '../../../../_lib/roles.js';
import {recipeRevisionView,saveRecipeRevision,submitRecipeRevision} from '../../../../_lib/recipe_authority.js';
export const onRequestPost=async({request,env})=>{
 const ctx=await requireRole(request,env,['kitchen','owner']);if(ctx instanceof Response)return ctx;
 let b;try{b=await request.json();}catch{return bad('Invalid JSON.');}
 try{
  const view=await recipeRevisionView(env,String(b.id||''));if(!view)return bad('Recipe not found.',404);
  if(view.spec.summary?.startsWith('Demo draft —'))return bad('Demo drafts cannot be submitted.');
  const revision=view.revision||await saveRecipeRevision(env,{recipe_id:view.recipe.id,spec:view.spec,expected_revision_id:null},ctx);
  const submitted=await submitRecipeRevision(env,revision.id,ctx);
  return json({ok:true,recipe_id:view.recipe.id,revision_id:submitted.id,status:submitted.status,requires_owner_review:true,review_url:'/hub/kitchen/recipes.html?recipe_id='+encodeURIComponent(view.recipe.id)});
 }catch(error){return bad(String(error.message||'Submission failed.'),409);}
};
