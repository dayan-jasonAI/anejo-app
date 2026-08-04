// Generate the REST of a carousel for a draft — the missing half of "the Studio makes ONE image".
//
// WHY THIS EXISTS. food_photo.js's ensureFoodPhoto gives a draft its first (and only) generated
// photo — one call, one slide, done. A carousel needs several images that read as ONE SET: same
// light, same surface, same palette, same lens feel, differing only in dish/angle/detail. That is
// a different job — "make N more that belong together" — and nothing in the building did it.
//
// HOW THE SET STAYS COHESIVE WITHOUT A REFERENCE IMAGE. None of the three providers in
// plate_image.js's chain take a reference photo as input (OpenAI's call here is text-to-image,
// not its /edits or /variations endpoint; Gemini and Workers AI are the same). So "same set" is
// achieved the only way available: every slide is expanded from the SAME base dish prompt through
// the SAME grounding (buildImagePrompt -> the owner's training, then BRAND_PHOTO_STANDARD,
// _lib/image_prompt.js) — that shared grounding is what fixes the surface, the light, and the
// palette identically on every call. Only a short FRAMING clause differs per slide (see
// ANGLE_VARIANTS below), so the difference between slides is angle/detail, exactly as asked, not
// an unrelated re-roll of "a bowl". This is honestly weaker than true reference-image conditioning
// would be, but reference conditioning does not exist in this provider chain today — noting that
// here rather than quietly implying a stronger guarantee than the chain can back up.
//
// NEVER OVERWRITES. This module only INSERTS new social_post_media rows at the END of the existing
// order — an owner-uploaded slide (or a previously generated one) is never touched, moved out of
// place, or replaced. The food-first guard (social_publish.js) still runs at publish time and will
// promote a generated photo over a leading text card exactly as it already does; this module does
// not need to reimplement that.
//
// COSTS MONEY, ON PURPOSE ONLY WHEN ASKED. Every slide is a real provider call against the SAME
// $50/week ceiling every other AI surface shares (ai_budget.js) — this is never run automatically
// by the planner or any background job, only by the owner's own button in the HUB (see
// functions/api/hub/owner/social.js's `generate_carousel` op). A partial batch (budget ran out
// halfway) is not a failure: whatever slides DID get made are kept, and the caller reports how many
// of what was asked for actually landed.
//
// Files under functions/_lib are NOT routed.
import { id, now, randToken } from './util.js';
import { loadPostMedia } from './social_publish.js';
import { generatePlateImageDetailed } from './plate_image.js';
import { budgetGate } from './ai_budget.js';
import { dishPromptFor, ORIGIN_AI } from './food_photo.js';
import { CAROUSEL_MAX } from './instagram.js';

// Framing/detail-only variation — the plating style, lighting and palette come from the SHARED
// grounding every call goes through (see file header), so these clauses deliberately say nothing
// about light, surface, or color: adding that here would let a slide drift from the set instead of
// varying only what the ask actually wants varied (dish/angle/detail).
export const ANGLE_VARIANTS = [
  'shot from a three-quarter angle, slightly closer than a straight-on view',
  'a true overhead flat-lay of the same bowl',
  'a close-up detail shot of the hero protein and its sear or char',
  'a side profile shot showing the sectional layers stacked in the bowl',
  'a slightly wider angle, showing a bit more of the counter around the bowl',
  'a close-up on the sauce being drizzled over the bowl',
  'a low angle shot from table height, the bowl looking substantial',
  'an overhead shot rotated roughly 90 degrees from a straight-on view',
  'a tight macro crop on the freshest garnish or microgreens',
  'a three-quarter angle shot from the opposite side of the bowl',
];

/**
 * Give `postId` however many MORE food-photo slides it needs to reach `targetCount` total,
 * appended after whatever is already there. Never throws — this is a HUB button, not a background
 * job, and every caller needs a named reason to show, never an unhandled rejection.
 *
 *   missing_args      · no env/DB/postId
 *   bad_count         · targetCount is not a sane 2-CAROUSEL_MAX number
 *   carousel_full     · the post is already at Instagram's ceiling — no room for anything more
 *   already_at_target · the post already has targetCount slides or more; nothing to generate
 *   no_prompt         · no image_brief and no usable caption — nothing to generate FROM
 *   generation_failed · every attempted slide failed (budget closed, providers unreachable/slow)
 *
 * On a partial or full success: { ok:true, added, requested, slides, media_keys }. `added` may be
 * LESS than `requested` — the weekly budget or a flaky provider can stop a batch partway through,
 * and that is reported honestly rather than padded or silently retried into a stuck request.
 */
export async function generateCarouselSlides(env, { postId, caption, imageBrief, targetCount } = {}) {
  if (!env || !env.DB || !postId) return { ok: false, reason: 'missing_args' };

  const target = Math.floor(Number(targetCount));
  if (!Number.isFinite(target) || target < 2 || target > CAROUSEL_MAX) return { ok: false, reason: 'bad_count' };

  const existing = await loadPostMedia(env, postId);
  if (existing.length >= CAROUSEL_MAX) return { ok: false, reason: 'carousel_full', slides: existing.length };
  if (existing.length >= target) return { ok: false, reason: 'already_at_target', slides: existing.length };

  const prompt = dishPromptFor({ imageBrief, caption });
  if (!prompt) return { ok: false, reason: 'no_prompt' };

  const toAdd = Math.min(target - existing.length, CAROUSEL_MAX - existing.length);
  let seq = existing.length;
  let added = 0;
  const madeKeys = [];

  for (let i = 0; i < toAdd; i++) {
    const variant = ANGLE_VARIANTS[i % ANGLE_VARIANTS.length];
    const slidePrompt = `${prompt} — ${variant}`.slice(0, 500);

    // Same as ensureFoodPhoto: requireJpeg because Instagram accepts JPEG only and this Worker has
    // no image binding to transcode with; role 'photo' because the filename suffix IS how the
    // food-first guard recognises what this generated (see media.js's `role` comment).
    let made;
    try {
      made = await generatePlateImageDetailed(env, slidePrompt, { requireJpeg: true, role: 'photo' });
    } catch { made = null; }

    if (!made || !made.key) {
      // A flaky single call is worth retrying on the next slide; a closed budget is not — every
      // remaining attempt would fail for the identical reason, so stop rather than burning more
      // wall-clock time on calls that cannot possibly succeed.
      const gate = await budgetGate(env);
      if (!gate.ok) break;
      continue;
    }

    const t = now();
    try {
      try {
        await env.DB.prepare(
          'INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at, origin) VALUES (?,?,?,?,?,?,?)'
        ).bind(id('spm'), postId, seq, made.key, randToken(24), t, ORIGIN_AI).run();
      } catch {
        // Pre-0076 schema (deploy window) — the slide matters more than the badge on it.
        await env.DB.prepare(
          'INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,?,?,?,?)'
        ).bind(id('spm'), postId, seq, made.key, randToken(24), t).run();
      }
      seq += 1;
      added += 1;
      madeKeys.push(made.key);
    } catch {
      // The image was made and stored (it is real spend, already recorded by
      // generatePlateImageDetailed) but the slide row would not write — move on to the next slide
      // rather than losing the whole batch over one D1 hiccup.
    }
  }

  if (added > 0) {
    await env.DB.prepare('UPDATE social_posts SET updated_at=? WHERE id=?').bind(now(), postId).run().catch(() => {});
  }

  if (!added) return { ok: false, reason: 'generation_failed', slides: existing.length };
  return { ok: true, added, requested: toAdd, slides: existing.length + added, media_keys: madeKeys };
}
