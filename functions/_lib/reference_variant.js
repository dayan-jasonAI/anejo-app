// Reference-conditioned bowl photos — the owner's own words: "teach [the image models] to use
// the original bowl images and just change the positions, background, themes as we work in
// different campaigns." An ON-DEMAND tool the owner reaches for from the HUB, never a default
// path. Files under functions/_lib are NOT routed.
//
// SCOPE, ON PURPOSE. The owner's own next sentence — "moving forward there is not that many
// posts that require replicating the original bowl images" — is a constraint, not an aside. This
// module is never called by socialPlan (the weekly planner), ensureFoodPhoto (the food-first
// repair), or generateCarouselSlides (the "make more like this" tool). All three keep doing
// exactly what they did before this file existed: ordinary text-to-image through
// generatePlateImageDetailed. The ONLY caller is the HUB's own button — see the `generate_
// reference_variant` op in api/hub/owner/social.js — which only ever runs when the owner picks a
// bowl and types a campaign look and taps Generate.
//
// WHY A REFERENCE IMAGE INSTEAD OF A BETTER TEXT PROMPT. public/assets/img/bowl_*.jpg (staged in
// R2 as studio/bowls/<bowl>.jpg — see bowl_art.js) are REAL PHOTOGRAPHS of food a customer is
// actually served. A text-only render of "the COCO bowl" is the model's guess at what that dish
// looks like — plausible, appetizing, and NOT what Añejo serves. Sending the real photo in as an
// input image (OpenAI's /v1/images/edits, Gemini's inlineData part — see plate_image.js) lets the
// model start from the truth and change only what was asked. THE BOWL STAYS FAITHFUL is a real
// constraint, encoded directly in the prompt text below, not a hope that the model infers it.
//
// WHAT HAPPENS WHEN A PROVIDER CANNOT CARRY A REFERENCE. Workers AI's Leonardo Phoenix (the
// third link in plate_image.js's chain) is TEXT-TO-IMAGE ONLY — checked against Cloudflare's own
// model schema, no image-input parameter exists at all. Handing it a reference it cannot use
// would force a choice between two dishonest outcomes: silently render text-only (the WORST
// outcome named in this feature's own build brief — a "styled variant" that is quietly a
// different dish) or fail opaquely. plate_image.js's provider loop instead SKIPS Workers AI
// outright, before ever calling it, with the honest reason 'img2img_unsupported' — see
// providerSupportsReference() there. OpenAI (OPENAI_API_KEY is live in production) is the one
// provider that can actually run this today; Gemini's path is built and feature-detected the same
// way, ready the moment GEMINI_API_KEY is added, and its absence never blocks OpenAI.
//
// THE JUDGEMENT CALL THE BUILD BRIEF ASKED FOR, MADE EXPLICIT HERE. A photo run through an image
// model and regenerated LOOKS like a photo of the real dish but is not one. Keeping the bowl
// faithful and varying only the surroundings is defensible; letting the model reinterpret the
// food is not. So this module (a) never lets an image ship without the reference actually having
// been sent to a provider that can use it, and (b) the HUB surfaces, in one line, that the result
// is a styled variant of a real photo — see marketing.html's referenceVariantTool(). Never buried.
import { BOWL_ART } from './bowl_art.js';
import { BOWL_BY_NAME, BOWL_LABEL } from './bowlspec.js';
import { getMedia } from './media.js';
import { generatePlateImageDetailed } from './plate_image.js';
import { NEGATIVE_PROMPT } from './image_prompt.js';

// bowl_art.js's keys are lowercase R2-path fragments ('coco'); bowlspec.js's keys are uppercase
// display names ('COCO', with BOWL_LABEL fixing up 'RAIZ' -> 'RAÍZ'). One lookup here so every
// caller (the API route, the HUB) only ever has to know the lowercase form.
export const REFERENCE_BOWL_KEYS = Object.keys(BOWL_ART);

export const BOWL_DISPLAY = Object.fromEntries(
  REFERENCE_BOWL_KEYS.map((key) => [key, BOWL_LABEL[key.toUpperCase()] || key.toUpperCase()])
);

function bowlSpecFor(key) {
  return BOWL_BY_NAME[String(key || '').toUpperCase()] || null;
}

/**
 * The prompt for a reference-conditioned generation — { positive, negative }.
 *
 * Deliberately NOT run through image_prompt.js's buildImagePrompt()/Haiku expansion. That path is
 * grounded in the owner's general photography training, which teaches how a NEW dish should be
 * plated and lit — it has no reason to know, and every reason to eventually drift from, the one
 * rule that matters here: THE FOOD IN THE REFERENCE PHOTO MUST NOT CHANGE. A deterministic
 * template — not a second AI call whose output could vary — is what lets that constraint be
 * pinned by a test instead of hoped for from an expansion model.
 *
 * `bowlKey` grounds the prompt in the ACTUAL recipe (bowlspec.js's description — real ingredients,
 * real build) as a second, independent statement of what must stay unchanged, alongside the
 * reference image itself. Belt-and-suspenders: if a provider ever weighted the text over the
 * pixels, the text still says the true dish, not a generic "a bowl."
 */
export function buildReferenceVariantPrompt(bowlKey, lookBrief) {
  const spec = bowlSpecFor(bowlKey);
  const display = BOWL_DISPLAY[bowlKey] || String(bowlKey || '').toUpperCase();
  const dishLine = spec ? `Añejo's ${display} bowl — ${spec.description}` : `Añejo's ${display} bowl`;
  const look = String(lookBrief || '').trim().slice(0, 300) || 'a clean, on-brand studio setting';

  const positive =
    `This is the REFERENCE PHOTO of ${dishLine}. Keep the food EXACTLY as shown in the reference ` +
    'image: the same ingredients, the same portions, the same sectional plating, the same sauce ' +
    'placement, the same bowl. Do not add, remove, substitute, or restyle any food, and do not ' +
    `change the bowl itself. Change ONLY the surroundings, to match this campaign direction: ${look}. ` +
    'Vary the background, surface, camera position, and lighting mood to fit that direction — the ' +
    'dish inside the bowl is the one fixed, unchangeable element of this photo.';

  const negative =
    'different dish, altered ingredients, added or removed food, redesigned plating, a different ' +
    `bowl, reimagined recipe, food that does not match the reference photo, ${NEGATIVE_PROMPT}`;

  return { positive, negative };
}

/**
 * Load `bowl`'s real photo from R2 and generate a reference-conditioned variant styled to
 * `lookBrief` — see the file header for how the faithfulness boundary is enforced and which
 * providers can even attempt this.
 *
 * Never throws — this is a HUB button, not a background job. Named reasons, same pattern as
 * ensureFoodPhoto/generateCarouselSlides:
 *   bad_bowl           · not one of the 8 known bowls (bowl_art.js's BOWL_ART)
 *   no_look             · lookBrief is empty — nothing to vary the surroundings TO
 *   reference_missing   · the bowl's real photo is not staged in R2 (env.MEDIA absent, the key is
 *                         missing, or it read back empty) — nothing to condition on, so this NEVER
 *                         falls back to a plain text-to-image render of "a bowl" instead
 *   generation_failed    · every provider that CAN take a reference image (OpenAI, Gemini today)
 *                          was unconfigured, disabled, over budget, slow, or non-JPEG; Workers AI
 *                          never counts here — see providerSupportsReference in plate_image.js
 *
 * On success: { ok:true, media_key, provider, model, source_bowl, reference_key }. The image is
 * generated and STORED (via generatePlateImageDetailed -> putMedia) but NOT attached to any post —
 * matching the branding tool's own posture, the caller previews it and attaches it explicitly.
 */
export async function generateReferenceVariant(env, { bowl, lookBrief, role } = {}) {
  const key = String(bowl || '').trim().toLowerCase();
  const refKey = BOWL_ART[key];
  if (!refKey) return { ok: false, reason: 'bad_bowl' };

  const look = String(lookBrief || '').trim();
  if (!look) return { ok: false, reason: 'no_look' };

  const obj = await getMedia(env, refKey).catch(() => null);
  if (!obj) return { ok: false, reason: 'reference_missing' };

  let bytes;
  try {
    bytes = new Uint8Array(await obj.arrayBuffer());
  } catch {
    return { ok: false, reason: 'reference_missing' };
  }
  if (!bytes.length) return { ok: false, reason: 'reference_missing' };

  const contentType = (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg';
  const core = { ...buildReferenceVariantPrompt(key, look), source: 'reference_variant', cached: false };

  // requireJpeg: Instagram accepts JPEG only, same as every other social-bound generation in this
  // app. role 'photo': the food-first guard reads the filename's role suffix — without it, a
  // styled variant of REAL food would read as an unrecognised text card. `prompt` (the short-lived
  // string, not `core`) is only used for the truncated debugging column on image_generations.
  const made = await generatePlateImageDetailed(env, `${BOWL_DISPLAY[key] || key} — ${look}`.slice(0, 400), {
    requireJpeg: true,
    role: role || 'photo',
    referenceImage: { bytes, contentType },
    core,
    provenance: { sourceBowl: key, referenceKey: refKey },
  });
  if (!made || !made.key) return { ok: false, reason: 'generation_failed' };

  return { ok: true, media_key: made.key, provider: made.provider, model: made.model, source_bowl: key, reference_key: refKey };
}
