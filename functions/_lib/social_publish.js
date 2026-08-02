// The ONE way a social post gets published. Files under _lib are NOT routed.
//
// The owner's Publish button and the every-minute tick used to each carry their own copy of this
// block. With carousels the branch (one image vs many) would have had to be written twice, and
// two copies of "what publishing means" is how the timer and the button eventually disagree —
// the same drift sendCampaignBatch was extracted to prevent. The CLAIM stays with the callers,
// because what states they may claim FROM genuinely differs (a click may retry a failure; the
// timer only ever takes a scheduled post). Everything after the claim lives here.
import { now } from './hub.js';
import { publishImage, publishCarousel } from './instagram.js';

/** A post's slides, in order. The child table is authoritative — social_posts.media_key is legacy. */
export async function loadPostMedia(env, postId) {
  try {
    const r = await env.DB.prepare(
      'SELECT id, seq, media_key, public_token FROM social_post_media WHERE post_id=? ORDER BY seq, created_at'
    ).bind(postId).all();
    return (r && r.results) || [];
  } catch { return []; }
}

const publicUrlFor = (request, token) => `${new URL(request.url).origin}/api/social/media/${token}`;

// ---------------------------------------------------------------------------
// FOOD-FIRST GUARD — the whole reason this app exists is a food business, and Instagram's grid
// shows ONLY the first slide of a carousel. tools/cardgen/series_cards.py renders text cards on
// BG=(9,20,10) — near-black forest green — and when one of those leads a carousel the grid shows
// typography instead of food (verified in production: studio/2026-07/series/p1_cover.jpg,
// p2_cover.jpg, p5_cover.jpg, p6_cover.jpg all lead posts averaging 48 peak reach against 125 for
// the rest of the account — n=2 vs n=6, directional, not proof, but it matches the owner's own
// read of the grid).
//
// DETECTION IS A FILENAME CONVENTION, NOT IMAGE ANALYSIS — this stack has no image classifier, and
// claiming certainty it does not have would be worse than the bug it replaces. The signal is the
// generator's own layout, documented in tools/cardgen/README.md: series_cards.py's output lives
// under a `series/` folder, and `_cover` names the title slide within it. Both are cheap and
// knowable from the R2 key alone.
//   · FALSE NEGATIVE: a text card produced some other way (renamed, hand-made, a future generator
//     with different naming) is invisible to this check and is left exactly where it was.
//   · FALSE POSITIVE: a real photo an owner happens to name "*_cover.jpg" or drops in a folder
//     called "series/" would be misjudged as a text card.
// Both directions are the CONSERVATIVE side for a food business: we never invent an image, and an
// unmatched key is always treated as a photo rather than flagged and possibly reordered away from
// where a human put it.
const TEXT_CARD_HINT = /(^|\/)series\/|_cover(?:\.[a-z0-9]+)?$/i;

export function looksLikeTextCard(mediaKey) {
  return TEXT_CARD_HINT.test(String(mediaKey || ''));
}

/**
 * If slide 1 looks like a text card and a later slide looks like a real photo, move that photo to
 * the front. Nothing is invented or dropped — reordering `seq` is the only lever (see
 * migrations/0063_social_carousel.sql: "slide ORDER is real data ... not the accident of array
 * position"), and every other slide keeps its relative order.
 *
 * Deliberately does NOT touch a post where every slide matches the text-card convention: with no
 * photo to promote, reordering would just move which text card leads, and publishing should not
 * silently paper over "this post has no food photo at all" — that is a human decision
 * (`no_photo_found: true` tells the caller to warn, not block; see coverStatus below).
 */
export function foodFirstOrder(media) {
  if (!Array.isArray(media) || media.length < 2) return { media, reordered: false, no_photo_found: false };
  if (!looksLikeTextCard(media[0].media_key)) return { media, reordered: false, no_photo_found: false };
  const photoIdx = media.findIndex((m) => !looksLikeTextCard(m.media_key));
  if (photoIdx === -1) return { media, reordered: false, no_photo_found: true };
  const reordered = [media[photoIdx], ...media.slice(0, photoIdx), ...media.slice(photoIdx + 1)];
  return { media: reordered, reordered: true, no_photo_found: false };
}

/**
 * Read-only status for the HUB list view (functions/api/hub/owner/social.js GET) — computed from
 * whatever order the slides are CURRENTLY stored in, so it stays honest even for a draft that has
 * not been through publishSocialPost yet.
 *   · null            → slide 1 does not match the text-card convention; nothing to say.
 *   · level 'info'     → slide 1 looks like a text card, but a real photo exists later — publishing
 *                        will reorder it automatically (foodFirstOrder above). Informational: the
 *                        owner should still SEE the underlying problem, per the owner's own read
 *                        that the grid problem was invisible to him until it was pointed out.
 *   · level 'warn'     → no photo anywhere on the post (or it is a single text-card slide) — this
 *                        is the case publishing will NOT fix and NOT block; a human has to add a
 *                        photo or decide the text card is the point.
 */
export function coverStatus(media) {
  if (!Array.isArray(media) || !media.length) return null;
  if (!looksLikeTextCard(media[0].media_key)) return null;
  const order = foodFirstOrder(media);
  if (order.reordered) {
    return { level: 'info', message: 'Cover looks like a text card — a photo later in this carousel will lead instead once this publishes.' };
  }
  return {
    level: 'warn',
    message: media.length > 1
      ? "Every slide here looks like a text card — Instagram's grid will show typography, not food. Add a real photo before this goes out."
      : 'This is a single text card — the grid will show it as-is, no food. Add a photo if this post should lead with one.',
  };
}

/**
 * Publish a claimed post — single image or carousel decided by how many slides it actually has,
 * in exactly one place. The caller has already moved it to status='publishing'; this function
 * finishes the job and writes the outcome, so a failure can never strand a post mid-state.
 *
 * `opts.publish=false` runs the whole container flow at Meta and stops short of media_publish —
 * the dry run. The caller must NOT have claimed the post for a dry run; nothing is written here
 * when dry-running.
 */
export async function publishSocialPost(env, request, post, opts = {}) {
  let media = await loadPostMedia(env, post.id);
  const dry = opts.publish === false;

  if (!media.length) {
    // A planner draft with no picture. The tick filters these out with EXISTS; this guard is for
    // the direct callers, and it must not leave the post stuck in 'publishing'.
    if (!dry) {
      await env.DB.prepare("UPDATE social_posts SET status='failed', error=?, updated_at=? WHERE id=?")
        .bind('This post has no image yet — add one before publishing.', now(), post.id).run();
    }
    return { ok: false, error: 'This post has no image yet — add one before publishing.' };
  }

  // FOOD-FIRST GUARD (see foodFirstOrder/coverStatus above). This runs INSIDE the one shared
  // publish path so both the owner's button and the unattended tick get it — the whole point of
  // this function is that neither caller knows how to publish differently from the other. When a
  // photo is found to promote, seq is rewritten so the fix is structural: the next time this post
  // (or a retry of it) is read anywhere — the HUB slide strip, a future publish — it is already
  // food-first, not just food-first for this one call.
  const order = foodFirstOrder(media);
  if (order.reordered) {
    media = order.media;
    if (!dry) {
      for (let i = 0; i < media.length; i++) {
        await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=?').bind(i, media[i].id).run();
      }
    }
  }
  // order.no_photo_found is NOT handled here: no image is invented, and publishing is not blocked
  // over it (a real, human-approved text-only post is a legitimate thing to post). The HUB warns
  // via coverStatus BEFORE this ever runs, which is where a human gets the chance to add a photo.

  // publishImage has NO dry mode — falling through would publish for real, which is the exact
  // accident a dry run exists to prevent. Refuse before the branch, not after.
  if (dry && media.length < 2) {
    return { ok: false, error: 'Dry run is for carousels (2+ photos) — a single-image post has nothing new to verify.' };
  }

  const res = media.length === 1
    ? await publishImage(env, {
        imageUrl: publicUrlFor(request, media[0].public_token),
        caption: post.caption,
        mediaKey: media[0].media_key,
      })
    : await publishCarousel(env, {
        items: media.map((m) => ({ imageUrl: publicUrlFor(request, m.public_token), mediaKey: m.media_key })),
        caption: post.caption,
      }, { publish: !dry });

  if (dry) return res;

  const t = now();
  if (!res.ok) {
    // Back to a retryable state with the reason attached — never left stuck in 'publishing',
    // which nothing would ever pick up again.
    await env.DB.prepare(
      "UPDATE social_posts SET status='failed', error=?, ig_container_id=COALESCE(?,ig_container_id), updated_at=? WHERE id=?"
    ).bind(String(res.error || 'Publish failed').slice(0, 300), res.container_id || null, t, post.id).run();
    return res;
  }

  await env.DB.prepare(
    "UPDATE social_posts SET status='published', ig_container_id=?, ig_media_id=?, permalink=?, published_at=?, error=NULL, updated_at=? WHERE id=?"
  ).bind(res.container_id || null, res.media_id, res.permalink || null, res.published_at || t, t, post.id).run();
  return res;
}
