// GET /api/social/media/<token> — the ONE public window onto a staged social image.
//
// PUBLIC ON PURPOSE, AND AS NARROW AS IT CAN BE.
// Instagram does not accept image bytes: you hand it an `image_url` and its servers fetch that URL
// anonymously. Our normal media route (/api/hub/media/*) is behind requireRole, so Instagram gets
// a 401 from it. The obvious fix — making the R2 bucket public — would also publish delivery PROOF
// PHOTOS and RECEIPTS, i.e. customers' doorsteps and addresses, to anyone who guessed a key.
//
// So the window is per-object and opt-in:
//   · the token is unguessable and belongs to ONE social_posts row
//   · it only ever serves that row's media_key — the caller cannot name a different object
//   · a row only exists because a human staged that image for publication
//   · once published, the window CLOSES (see below)
//
// Nothing else in the bucket becomes reachable, and there is no path from this route to a proof
// photo even with a valid token.
import { getMedia, contentTypeForKey } from '../../../_lib/media.js';

const notFound = () => new Response('Not found', { status: 404 });

export const onRequestGet = async ({ env, params }) => {
  const token = String((params && params.token) || '').trim();
  // Length floor as well as presence: a one-character token is not a token, and treating it as one
  // would turn a typo into a scan of the table.
  if (!token || token.length < 16 || !env.DB || !env.MEDIA) return notFound();

  // Tokens live per-SLIDE since carousels: Instagram fetches every slide separately and
  // anonymously, so each has its own token. The join carries the post's status, which is what
  // decides whether the window is still open. Migration 0063 backfilled every legacy token into
  // this table, so one query covers old posts too.
  let post = null;
  try {
    post = await env.DB.prepare(
      `SELECT m.media_key, p.status FROM social_post_media m
         JOIN social_posts p ON p.id = m.post_id
        WHERE m.public_token = ? LIMIT 1`
    ).bind(token).first();
  } catch { return notFound(); }
  if (!post || !post.media_key) return notFound();

  // The window is open only while the post needs it. Instagram fetches during 'publishing'; a
  // draft is staged and about to. Once PUBLISHED, Instagram hosts its own copy and has no reason
  // to come back — so the URL stops working and a leaked token ages into uselessness.
  if (post.status === 'published' || post.status === 'failed') return notFound();

  const obj = await getMedia(env, post.media_key);
  if (!obj) return notFound();

  return new Response(obj.body, {
    headers: {
      'Content-Type': (obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeForKey(post.media_key),
      // Instagram may fetch more than once while the container processes; a short cache is fine.
      // No long-lived caching: the window is meant to close.
      'Cache-Control': 'public, max-age=300',
      // This is a marketing image being handed to Meta — never let it be framed or sniffed.
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
