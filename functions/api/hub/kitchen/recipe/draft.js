// GET  /api/hub/kitchen/recipe/draft?id=rcp_… — one recipe, in full, for editing
// POST /api/hub/kitchen/recipe/draft { id, ingredients?, steps?, summary? } — save the edits
//
// Dayan, 2026-09-25, the day before a thirty-guest event with the kitchen already cooking: "I need
// a way for the kitchen to be able to finish those drafts live while it's getting done."
//
// There was no way. A recipe could be created in Studio and published to the library, and between
// those two points it could not be changed by anybody — so seven catering recipes sat at status
// 'draft' with nobody able to finish them, on the morning they were being cooked.
//
// Edits create an immutable draft revision; only an exact owner approval replaces the base recipe. Never save event-scaled quantities as a recipe batch definition.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import {recipeRevisionView,saveRecipeRevision} from '../../../../_lib/recipe_authority.js';



/** Lines in, array out. Blank lines are dropped; everything else is kept verbatim. */
export function lines(value, max) {
  if (Array.isArray(value)) return value.slice(0, max);
  return String(value == null ? '' : value)
    .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, max);
}

/**
 * Ingredients are "3 cups — garlic, mashed" or "3 cups garlic, mashed". The em dash is what the
 * kitchen is shown, so it is what is parsed first; without one the leading quantity is taken and
 * the rest is the item, which is how a cook writing quickly will type it.
 */
export function ingredientsFrom(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => ({ item: String((x && x.item) || '').trim(), qty: String((x && x.qty) || '').trim() }))
      .filter((x) => x.item).slice(0, 120);
  }
  return lines(value, 120).map((l) => {
    const dash = l.split(/\s+[—–-]\s+/);
    if (dash.length >= 2) return { qty: dash[0].trim(), item: dash.slice(1).join(' - ').trim() };
    const m = l.match(/^([\d¼½¾⅓⅔⅛\s./]+(?:[a-zA-Z.]+)?)\s+(.*)$/);
    return m ? { qty: m[1].trim(), item: m[2].trim() } : { qty: '', item: l };
  }).filter((x) => x.item);
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const id = (new URL(request.url).searchParams.get('id') || '').trim();
  if (!id) return bad('Missing recipe id.');
  try {
    const view=await recipeRevisionView(env,id);if(!view)return bad('Recipe not found.',404);
    return json({ok:true,recipe:{...view.recipe,draft:true,...view.spec,ingredients:view.spec.ingredients,steps:view.spec.steps.map(s=>s.text)},revision:view.revision,authority:view.authority,spec:view.spec,gaps:view.gaps});
  }catch{return bad('Recipe versions unavailable.',503);}
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  let b;try{b=await request.json();}catch{return bad('Invalid JSON body.');}
  const id=String(b.id||'').trim();if(!id)return bad('Missing recipe id.');
  try{
    const view=await recipeRevisionView(env,id);if(!view)return bad('Recipe not found.',404);
    const spec={...view.spec};
    if(b.ingredients!==undefined)spec.ingredients=ingredientsFrom(b.ingredients);
    if(b.steps!==undefined)spec.steps=lines(b.steps,80);
    if(b.summary!==undefined)spec.summary=String(b.summary||'');
    const revision=await saveRecipeRevision(env,{recipe_id:id,spec,expected_revision_id:b.expected_revision_id},ctx);
    await capture(env,{event:'recipe.draft_saved',distinct_id:ctx.distinct_id,role:ctx.role,properties:{recipe_id:id,revision_id:revision.id}});
    return json({ok:true,recipe:{...view.recipe,draft:true,...spec},revision,requires_owner_review:true});
  }catch(error){return bad(String(error.message||'Draft could not be saved.'),409);}
};
