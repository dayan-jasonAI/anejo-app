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
  const media = await loadPostMedia(env, post.id);
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
