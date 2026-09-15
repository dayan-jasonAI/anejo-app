import { createRecipe, publishRecipe, type RecipeDraft } from './api';

// Retain the saved ID across a failed publication so retries do not create duplicate recipes.
export async function publishRecipeDraft(sessionId: string, draft: RecipeDraft, savedId: string | null) {
  let recipeId = savedId;
  if (!recipeId) {
    const created = await createRecipe(sessionId, draft);
    recipeId = created?.recipe?.id || null;
  }
  if (!recipeId) return { ok: false, recipeId: null };
  const ok = await publishRecipe(recipeId);
  return { ok, recipeId };
}
