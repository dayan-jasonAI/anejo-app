// Synthetic owner review fixture. No real recipe, temperature or operating guidance.
import {saveRecipeRevision,submitRecipeRevision,approveRecipeRevision,getApprovedRecipeAuthority} from '../../functions/_lib/recipe_authority.js';
export async function approveSyntheticRecipe(env,recipeId,menuItemId){
 const existing=await getApprovedRecipeAuthority(env,{menuItemId});if(existing?.recipe_id===recipeId)return existing;
 const recipe=await env.DB.prepare('SELECT name FROM recipes WHERE id=?').bind(recipeId).first();
 const latest=await env.DB.prepare('SELECT id FROM recipe_revisions WHERE recipe_id=? ORDER BY version DESC LIMIT 1').bind(recipeId).first();
 const spec={name:recipe.name,portion:'Synthetic test portion',yield_count:1,yield_unit:'portion',prep_minutes:0,cook_minutes:0,ingredients:[{item:'Synthetic test ingredient',quantity:1,unit:'lb',basis:'raw'}],steps:[{text:'Synthetic test action'}],equipment:['Synthetic test equipment'],cook_temperature:'Synthetic verified cooking fact',holding:'Synthetic verified holding',cooling_reheating:'Synthetic verified cooling',storage:'Synthetic verified storage',shelf_life:'Synthetic verified shelf life',allergens:'Synthetic verified allergens',packaging:'Synthetic package',photos:['/assets/img/synthetic.jpg'],source_reference:'Synthetic owner test source',unknowns:[],menu_links:[{menu_item_id:menuItemId,portions_per_sale_unit:1}]};
 const ctx={role:'owner',distinct_id:'stf_owner'},revision=await saveRecipeRevision(env,{recipe_id:recipeId,expected_revision_id:latest?.id||null,spec},ctx);await submitRecipeRevision(env,revision.id,ctx);await approveRecipeRevision(env,{revision_id:revision.id,content_hash:revision.content_hash,owner_reviewed:true,source_verified:true},ctx);return getApprovedRecipeAuthority(env,{menuItemId});
}
