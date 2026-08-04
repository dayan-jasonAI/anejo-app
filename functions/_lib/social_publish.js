// The ONE way a social post gets published. Files under _lib are NOT routed.
//
// The owner's Publish button and the every-minute tick used to each carry their own copy of this
// block. With carousels the branch (one image vs many) would have had to be written twice, and
// two copies of "what publishing means" is how the timer and the button eventually disagree —
// the same drift sendCampaignBatch was extracted to prevent. The CLAIM stays with the callers,
// because what states they may claim FROM genuinely differs (a click may retry a failure; the
// timer only ever takes a scheduled post). Everything after the claim lives here.
import { now } from './hub.js';
import { publishImage, publishCarousel, publishReel, publishStory, VIDEO_ONLY } from './instagram.js';
import { BOWL_ART } from './bowl_art.js';

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
// claiming certainty it does not have would be worse than the bug it replaces.
//
// FIRST DRAFT OF THIS GUARD MATCHED ON THE `series/` FOLDER AND WAS WRONG: in production the
// `series/` folder holds text cards AND the real food photos together (e.g.
// studio/2026-07/series/p6_photo.jpg lives right next to p6_cover.jpg). Matching the folder made
// every slide of every affected carousel "look like a text card", including the photos — so the
// guard found no photo to promote on posts that had one, reordered nothing, and raised a false
// "no photo" warning exactly where the feature needed to work. Caught in review before it shipped
// against real keys.
//
// The corrected signal ignores the folder entirely and reads the filename's ROLE SUFFIX — the
// token after the last underscore, which is how tools/cardgen names each slide of a series:
//   · PHOTO  (positive match) — suffix `_photo`, OR the whole filename (no suffix) is one of the
//     eight bowl names `_lib/bowl_art.js` stages at `studio/bowls/<bowl>.jpg`, OR the suffix IS one
//     of those bowl names (a bowl photo reused inside a series/ carousel, e.g. `p1_vida.jpg`).
//   · TEXT CARD (positive match) — suffix is one of the known card roles series_cards.py produces:
//     `cover`, `cta`, `hook`, `rule`, `facts`, `why`.
//   · ANYTHING ELSE — UNKNOWN. Not a photo, not a card. Never promoted, never counted toward "no
//     photo found", never treated as the cover to warn about. This is deliberate: a slide named
//     `p3_inside.jpg` is real content we do not have a rule for, and guessing which side of the
//     line it falls on is exactly the certainty this guard is not allowed to claim.
// Limits, honestly:
//   · FALSE NEGATIVE — a text card or a photo that does not carry one of these exact role suffixes
//     (renamed, hand-uploaded, a future generator with different naming — including the owner's
//     own phone photos, which upload as studio/<yyyy-mm>/up_<id>.jpg with no role at all) is
//     UNKNOWN and left exactly where it was. It will never be auto-promoted to slide 1 even if it
//     is plainly a photo to a human.
//   · FALSE POSITIVE — a real photo an owner happens to name "*_cover.jpg" would be misjudged as a
//     text card; a graphic named "*_photo.jpg" would be misjudged as food.
// Both directions are the CONSERVATIVE side for a food business: nothing is invented, and an
// unrecognized slide is never reordered on a guess.
const BOWL_NAMES = new Set(Object.keys(BOWL_ART));
const CARD_ROLES = new Set(['cover', 'cta', 'hook', 'rule', 'facts', 'why']);

/** The role suffix of one slide's filename, or null when it matches neither known bucket. */
function slideRole(mediaKey) {
  const base = String(mediaKey || '').split('/').pop() || '';
  const stem = base.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  if (!stem) return null;
  // studio/bowls/<bowl>.jpg — the WHOLE filename IS the bowl name, no role suffix to split off.
  if (BOWL_NAMES.has(stem)) return 'photo';
  // Everything else names its role after the last underscore: p6_photo, p1_vida, p6_cover.
  // Bowl names never contain an underscore, so this also catches a bowl photo reused inside a
  // series/ carousel (p1_vida.jpg) the same way it catches p6_photo.jpg.
  const m = /_([a-z0-9]+)$/.exec(stem);
  if (!m) return null;
  const role = m[1];
  if (role === 'photo' || BOWL_NAMES.has(role)) return 'photo';
  if (CARD_ROLES.has(role)) return 'card';
  return null;
}

export function isFoodPhoto(mediaKey) { return slideRole(mediaKey) === 'photo'; }
export function isTextCard(mediaKey) { return slideRole(mediaKey) === 'card'; }

/**
 * If slide 1 is a known text card and some later slide is a known food photo, move that photo to
 * the front. Nothing is invented or dropped — reordering `seq` is the only lever (see
 * migrations/0063_social_carousel.sql: "slide ORDER is real data ... not the accident of array
 * position"), and every other slide (including unknowns) keeps its relative order.
 *
 * Deliberately does NOT touch a post where no slide is a recognized photo: with nothing to
 * promote, publishing should not silently paper over "this post has no food photo at all" — that
 * is a human decision (`no_photo_found: true` tells the caller to warn, not block; see
 * coverStatus below). An UNKNOWN slide never counts as the photo being promoted, even if it sits
 * right where a photo would make sense — only a recognized role does.
 */
export function foodFirstOrder(media) {
  if (!Array.isArray(media) || media.length < 2) return { media, reordered: false, no_photo_found: false };
  if (!isTextCard(media[0].media_key)) return { media, reordered: false, no_photo_found: false };
  const photoIdx = media.findIndex((m) => isFoodPhoto(m.media_key));
  if (photoIdx === -1) return { media, reordered: false, no_photo_found: true };
  const reordered = [media[photoIdx], ...media.slice(0, photoIdx), ...media.slice(photoIdx + 1)];
  return { media: reordered, reordered: true, no_photo_found: false };
}

/**
 * Read-only status for the HUB list view (functions/api/hub/owner/social.js GET) — computed from
 * whatever order the slides are CURRENTLY stored in, so it stays honest even for a draft that has
 * not been through publishSocialPost yet.
 *   · null           → slide 1 is not a recognized text card; nothing to say.
 *   · level 'info'    → slide 1 is a text card, but a recognized food photo exists later —
 *                       publishing will reorder it automatically (foodFirstOrder above).
 *                       Informational: the owner should still SEE the underlying problem, per the
 *                       owner's own read that the grid problem was invisible to him until it was
 *                       pointed out.
 *   · level 'warn'    → NO recognized food photo anywhere on the post (or it is a single text-card
 *                       slide). This is a true finding, not a "publishing will handle it" — say so
 *                       plainly: the post has no food photo and needs one before it goes out.
 */
export function coverStatus(media) {
  if (!Array.isArray(media) || !media.length) return null;
  if (!isTextCard(media[0].media_key)) return null;
  const order = foodFirstOrder(media);
  if (order.reordered) {
    return { level: 'info', message: 'Cover looks like a text card — a food photo later in this carousel will lead instead once this publishes.' };
  }
  return {
    level: 'warn',
    message: media.length > 1
      ? 'This post has no food photo — every slide is a text card. Add a real photo before it goes out.'
      : 'This is a single text card with no food photo. Add one if this post should lead with food.',
  };
}

/**
 * Publish a claimed post — routed by the post's DECLARED media type (migrations/0080), falling
 * back to today's slide-count inference (1 slide -> image, 2-10 -> carousel) when that column is
 * NULL. NULL is not a bug to fix here: it is every post that existed before 0080, and the whole
 * point of that migration was that those posts must keep behaving exactly as they did — see its
 * comment for why nothing was backfilled.
 *
 * `media_type` decides the whole shape of what happens, not just which Instagram function gets
 * called: a REEL or a STORY is a single asset with no carousel concept, so the food-first guard
 * (which reorders MULTIPLE slides) and the "single vs carousel" slide-count branch both belong
 * only to the legacy/IMAGE/CAROUSEL path.
 *
 * The caller has already moved the post to status='publishing'; this function finishes the job and
 * writes the outcome, so a failure can never strand a post mid-state.
 *
 * `opts.publish=false` runs the whole container flow at Meta and stops short of media_publish —
 * the dry run. The caller must NOT have claimed the post for a dry run; nothing is written here
 * when dry-running. Reels and Stories have no dry-run mode (see below) — same posture as a single
 * image, which never had one either.
 */
export async function publishSocialPost(env, request, post, opts = {}) {
  let media = await loadPostMedia(env, post.id);
  const dry = opts.publish === false;
  // NULL/absent = not declared by 0080 -> the legacy inference this app has always used. Any other
  // value is an explicit instruction and is trusted over the slide count.
  const mediaType = post.media_type || null;
  const isReel = mediaType === 'REELS';
  const isStory = mediaType === 'STORIES';

  if (!media.length) {
    // A planner draft with no picture, or a Reel/Story draft with no video/photo attached yet. The
    // tick filters these out with EXISTS; this guard is for the direct callers, and it must not
    // leave the post stuck in 'publishing'.
    if (!dry) {
      await env.DB.prepare("UPDATE social_posts SET status='failed', error=?, updated_at=? WHERE id=?")
        .bind('This post has no photo or video yet — add one before publishing.', now(), post.id).run();
    }
    return { ok: false, error: 'This post has no photo or video yet — add one before publishing.' };
  }

  // FOOD-FIRST GUARD (see foodFirstOrder/coverStatus above) only means anything for a MULTI-SLIDE
  // feed carousel — it exists to stop a text card leading the grid over a real food photo. A Reel
  // is one video; a Story is one photo or video. Neither has a "later slide" to promote, so running
  // this against them would not be a narrower version of the guard, it would be image-carousel
  // logic pointed at a video for no reason. In practice slideRole() (above) already returns null
  // for a video filename — it matches neither the photo nor the text-card suffix set — so
  // coverStatus/foodFirstOrder are inert on a video today even without this guard; the explicit
  // skip is what keeps that true on purpose rather than by the accident of a filename convention.
  if (!isReel && !isStory) {
    const order = foodFirstOrder(media);
    if (order.reordered) {
      media = order.media;
      if (!dry) {
        for (let i = 0; i < media.length; i++) {
          await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=?').bind(i, media[i].id).run();
        }
      }
    }
    // order.no_photo_found is NOT handled here: no image is invented, and publishing is not
    // blocked over it (a real, human-approved text-only post is a legitimate thing to post). The
    // HUB warns via coverStatus BEFORE this ever runs, which is where a human gets the chance to
    // add a photo.
  }

  // publishImage/publishReel/publishStory have NO dry mode — falling through would publish for
  // real, which is the exact accident a dry run exists to prevent. Refuse before the branch, not
  // after. A Reel or a Story is always media.length===1 (Stories cannot even hold a second slide,
  // see the 'attach' guard in functions/api/hub/owner/social.js), so this same check already covers
  // them — no separate refusal needed.
  if (dry && media.length < 2) {
    return { ok: false, error: 'Dry run is for carousels (2+ photos) — a single item has nothing new to verify.' };
  }

  let res;
  if (isReel) {
    res = await publishReel(env, {
      videoUrl: publicUrlFor(request, media[0].public_token),
      caption: post.caption,
      mediaKey: media[0].media_key,
    });
  } else if (isStory) {
    res = await publishStory(env, {
      mediaUrl: publicUrlFor(request, media[0].public_token),
      mediaKey: media[0].media_key,
      isVideo: VIDEO_ONLY.test(media[0].media_key || ''),
    });
  } else {
    // The legacy path, unchanged: single image or carousel decided by slide count, exactly as
    // before migrations/0080 existed.
    res = media.length === 1
      ? await publishImage(env, {
          imageUrl: publicUrlFor(request, media[0].public_token),
          caption: post.caption,
          mediaKey: media[0].media_key,
        })
      : await publishCarousel(env, {
          items: media.map((m) => ({ imageUrl: publicUrlFor(request, m.public_token), mediaKey: m.media_key })),
          caption: post.caption,
        }, { publish: !dry });
  }

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
