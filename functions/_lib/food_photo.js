// The ONE way a post that has no food photo gets one. Files under _lib are NOT routed.
//
// WHY THIS EXISTS. The food-first guard (social_publish.js) shipped as a pure REPORT: it could
// reorder slides so a photo led, and when there was no photo anywhere it warned the owner and
// stopped. That warning was the entire remedy, and the owner's question about it is the right
// one — a quality gate that can only describe the problem hands the work back to the person it
// was supposed to do the work for. Worse, nothing on the automated side could have satisfied the
// gate even in principle:
//   · the weekly planner (socialPlan) writes caption + image_brief and inserts media_key NULL —
//     art direction, never pixels;
//   · the Team Lead attaches one staged bowl image, and only when the caption names exactly one
//     bowl (bowl_art.js) — a caption about "every Anejo bowl" names none, so it attaches nothing.
// So a text-card-only post was a state the team could CREATE and could not FIX.
//
// The capability was already in the building and simply not wired to this surface:
// plate_image.js generates an on-brand plate photo through OpenAI -> Gemini -> Workers AI, under
// the same $50/week ceiling as every other AI call. This module is that wire, and it is shared by
// all three doors (planner, Team Lead, and the owner's repair button) for the same reason
// publishSocialPost is shared — three copies of "what a food photo means" is how they drift.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   · It never changes a post's STATUS. A repaired post stays a draft awaiting the owner's tap.
//     Attaching an image is not approval, and an AI-made bowl photo is the LAST thing that should
//     schedule itself onto the grid.
//   · It never replaces or removes an existing slide. The generated photo is added in FRONT of
//     the text cards, because Instagram's grid shows only slide 1 — the cards keep their order
//     and their place in the carousel.
//   · It never runs on a post that already has a recognised food photo. That post's problem is
//     ordering, which foodFirstOrder already fixes for free, and spending money to solve an
//     already-solved problem is how a budget ceiling gets hit for nothing.
import { id, now, randToken } from './util.js';
import { loadPostMedia, isFoodPhoto } from './social_publish.js';
import { generatePlateImageDetailed } from './plate_image.js';
import { CAROUSEL_MAX } from './instagram.js';

// Marks the slide in social_post_media.origin (migrations/0076). The slide strip badges it so a
// generated placeholder is never mistaken for photography of food Anejo actually cooked.
export const ORIGIN_AI = 'ai_generated';

/**
 * The dish prompt for the generator, from what the post already carries.
 *
 * image_brief FIRST — that is the art direction the planner wrote for exactly this purpose
 * ("one sentence of art direction for a food photo we will generate", automations.js), and it was
 * being thrown away because nothing downstream ever read it. The caption is the fallback for
 * hand-staged posts that predate the brief field, with hashtags, URLs and the link-in-bio call to
 * action stripped: they are audience instructions, not scene description, and a generator handed
 * "#PerformanceFood link in bio" will try to render the words.
 *
 * Returns null when there is nothing to work from — the caller must not invent a subject.
 */
export function dishPromptFor({ imageBrief, caption } = {}) {
  const brief = String(imageBrief || '').trim();
  if (brief) return brief.slice(0, 400);
  const from = String(caption || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/link in bio/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (from.length < 12) return null;
  return from.slice(0, 300);
}

/**
 * Give `postId` a food photo as slide 1, generating one if the post has none.
 *
 * Never throws — every caller is either a background automation or a button, and neither should
 * lose its own work because an image provider was slow. Returns a named reason instead, so the
 * caller can say something true rather than "something went wrong":
 *   already_has_photo · the post has a recognised food photo; nothing to do (not a failure)
 *   no_prompt         · no image_brief and no usable caption — nothing to generate FROM
 *   carousel_full     · 10 slides already; Instagram's ceiling leaves no room for a cover
 *   generation_failed · every provider was unconfigured, disabled, over budget, slow, or non-JPEG
 *   db_failed         · the image was made and stored but the slide row would not write
 */
export async function ensureFoodPhoto(env, { postId, caption, imageBrief } = {}) {
  if (!env || !env.DB || !postId) return { ok: false, reason: 'db_failed' };

  const existing = await loadPostMedia(env, postId);
  if (existing.some((m) => isFoodPhoto(m.media_key))) return { ok: false, reason: 'already_has_photo' };
  if (existing.length >= CAROUSEL_MAX) return { ok: false, reason: 'carousel_full' };

  const prompt = dishPromptFor({ imageBrief, caption });
  if (!prompt) return { ok: false, reason: 'no_prompt' };

  // requireJpeg: Instagram accepts JPEG only and this Worker cannot transcode — a PNG here would
  // be a slide the publish path refuses, i.e. a repair that breaks the post it repaired.
  // role 'photo': the guard reads the filename's role suffix, so without this the image this app
  // just generated AS FOOD would read as UNKNOWN and the warning would survive its own fix.
  const made = await generatePlateImageDetailed(env, prompt, { requireJpeg: true, role: 'photo' });
  if (!made || !made.key) return { ok: false, reason: 'generation_failed' };

  const t = now();
  try {
    // seq -1, then reseal 0..n-1. Inserting "in front" by rewriting every other row first would
    // leave the carousel briefly duplicated or gapped if the insert then failed; one row that
    // sorts ahead of the rest, followed by a renumber, is never in a state that reads wrong.
    try {
      await env.DB.prepare(
        'INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at, origin) VALUES (?,?,-1,?,?,?,?)'
      ).bind(id('spm'), postId, made.key, randToken(24), t, ORIGIN_AI).run();
    } catch {
      // Pre-0076 schema (deploy window): the slide itself matters more than the badge on it.
      await env.DB.prepare(
        'INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,-1,?,?,?)'
      ).bind(id('spm'), postId, made.key, randToken(24), t).run();
    }
    const all = await loadPostMedia(env, postId);
    for (let i = 0; i < all.length; i++) {
      if (all[i].seq !== i) await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=?').bind(i, all[i].id).run();
    }
    // Touch the post so the HUB list re-sorts and any "updated" indicator is honest. The STATUS
    // is deliberately untouched — see the header note.
    await env.DB.prepare('UPDATE social_posts SET updated_at=? WHERE id=?').bind(t, postId).run();
    return { ok: true, media_key: made.key, provider: made.provider, slides: all.length };
  } catch {
    return { ok: false, reason: 'db_failed' };
  }
}
