// GET/POST /api/hub/owner/social — draft, schedule and publish Instagram posts. Owner-only.
//
// Creative Studio already writes the caption and generates the plate image; this is the missing
// path from "generated" to "on the profile". Six posts on the account is what happens when that
// path is a human copying files.
import { json, bad, id, now, randToken } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { igConfigured, accountInfo, JPEG_ONLY, VIDEO_ONLY, CAROUSEL_MAX } from '../../../_lib/instagram.js';
import { publishSocialPost, loadPostMedia, coverStatus } from '../../../_lib/social_publish.js';
import { ensureFoodPhoto } from '../../../_lib/food_photo.js';
// The owner's own complaint: "I don't see generate image of a single prompt." generate_cover
// below already wires the provider chain to a POST'S OWN caption/image_brief; a typed prompt is
// the same chain called directly, so it is pulled in here rather than duplicated. See the
// `generate_cover` op's `prompt` branch.
import { generatePlateImageDetailed } from '../../../_lib/plate_image.js';
import { generateCarouselSlides } from '../../../_lib/carousel_gen.js';
import { generateReferenceVariant, REFERENCE_BOWL_KEYS, BOWL_DISPLAY } from '../../../_lib/reference_variant.js';
import { noteTrustApproval } from '../../../_lib/trust_ledger.js';
import { loadTokenExpiry, saveTokenExpiry, tokenExpiryStatus } from '../../../_lib/instagram_token_expiry.js';
import { stampPostProvenance } from '../../../_lib/post_provenance.js';

// Instagram's own cap. Worth knowing locally so a scheduled batch cannot quietly burn it.
const DAILY_CAP = 25;


export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let posts = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, platform, caption, media_key, media_type, status, scheduled_at, published_at, permalink, error, image_brief, source, ig_media_id, audit_score, audit_flags, audit_at, audit_status, created_at FROM social_posts ORDER BY created_at DESC LIMIT 60'
    ).all();
    posts = (r && r.results) || [];
  } catch {
    // A database that predates migrations/0080 has no media_type column at all — fall back to the
    // pre-0080 SELECT rather than showing an empty page over one missing column. Every post reads
    // as media_type=null (the correct, honest value: "not declared"), same as it would once 0080
    // has actually run.
    try {
      const r2 = await env.DB.prepare(
        'SELECT id, platform, caption, media_key, status, scheduled_at, published_at, permalink, error, image_brief, source, ig_media_id, audit_score, audit_flags, audit_at, audit_status, created_at FROM social_posts ORDER BY created_at DESC LIMIT 60'
      ).all();
      posts = ((r2 && r2.results) || []).map((p) => ({ ...p, media_type: null }));
    } catch { posts = []; }
  }

  // Slides, per post, in order. One query for the page, grouped here — social_post_media is the
  // authority; the legacy media_key column is display-only history.
  // `origin` (migrations/0076) is what lets the slide strip badge an AI-generated cover, so the
  // owner can tell a generated placeholder from food Anejo actually cooked. Selected in its own
  // try so a pre-0076 database still renders the page with slides, just without the badge —
  // losing a label must never cost the carousel.
  try {
    const m = await env.DB.prepare(
      `SELECT id, post_id, seq, media_key, origin FROM social_post_media
        WHERE post_id IN (SELECT id FROM social_posts ORDER BY created_at DESC LIMIT 60)
        ORDER BY seq, created_at`
    ).all();
    const bySlide = {};
    for (const row of (m && m.results) || []) (bySlide[row.post_id] = bySlide[row.post_id] || []).push({ id: row.id, seq: row.seq, media_key: row.media_key, origin: row.origin || null });
    for (const post of posts) post.media = bySlide[post.id] || [];
  } catch {
    try {
      const m = await env.DB.prepare(
        `SELECT id, post_id, seq, media_key FROM social_post_media
          WHERE post_id IN (SELECT id FROM social_posts ORDER BY created_at DESC LIMIT 60)
          ORDER BY seq, created_at`
      ).all();
      const bySlide = {};
      for (const row of (m && m.results) || []) (bySlide[row.post_id] = bySlide[row.post_id] || []).push({ id: row.id, seq: row.seq, media_key: row.media_key, origin: null });
      for (const post of posts) post.media = bySlide[post.id] || [];
    } catch { for (const post of posts) post.media = []; }
  }

  // Food-first indicator (see functions/_lib/social_publish.js coverStatus): computed straight
  // from the stored order so this is honest whether or not the post has ever been published — a
  // draft shows what publishing WILL fix or warn about; a published post shows what actually went
  // out, because publishSocialPost persists its own reorder before calling Instagram.
  for (const post of posts) post.cover_status = coverStatus(post.media);

  // Latest performance snapshot per media id, attached to our published posts. NULL until the
  // daily sweep has run — the page says "no data yet", never fake zeros.
  try {
    const mr = await env.DB.prepare(
      `SELECT media_id, likes, comments, reach, saved, capture_date FROM ig_media_metrics
        WHERE capture_date = (SELECT MAX(capture_date) FROM ig_media_metrics)`
    ).all();
    const byMedia = {};
    for (const row of (mr && mr.results) || []) byMedia[row.media_id] = row;
    for (const post of posts) if (post.ig_media_id && byMedia[post.ig_media_id]) post.metrics = byMedia[post.ig_media_id];
  } catch { /* metrics are additive; the page works without them */ }

  // Provenance (migrations/0076 + intel_id 0081): what CAUSED each draft — the campaign brief that
  // directed it, the market-intel finding that gave it its angle, its category/format, and how many
  // training rules were active. post_provenance.js owns the storage contract (stampPostProvenance /
  // getPostProvenance, the latter single-post); this reads the whole page in ONE batched join, then
  // resolves brief_id/intel_id to their human titles so the card shows a name, not an opaque id. A
  // post with no row reads as UNKNOWN (attribute absent) — never as "recorded zero", exactly the
  // distinction the migration draws. Its own try so a pre-0076 database still renders every post.
  try {
    const pr = await env.DB.prepare(
      `SELECT pp.post_id, pp.rule_ids, pp.brief_id, pp.intel_id, pp.category, pp.format, pp.slide_count,
              tb.title AS brief_title, mi.title AS intel_title, mi.kind AS intel_kind
         FROM post_provenance pp
         LEFT JOIN team_briefs tb ON tb.id = pp.brief_id
         LEFT JOIN market_intel mi ON mi.id = pp.intel_id
        WHERE pp.post_id IN (SELECT id FROM social_posts ORDER BY created_at DESC LIMIT 60)`
    ).all();
    const byProv = {};
    for (const row of (pr && pr.results) || []) {
      let rulesCount = 0;
      if (row.rule_ids) { try { const a = JSON.parse(row.rule_ids); if (Array.isArray(a)) rulesCount = a.length; } catch { rulesCount = 0; } }
      byProv[row.post_id] = {
        recorded: true,
        category: row.category || null,
        format: row.format || null,
        slide_count: row.slide_count != null ? row.slide_count : null,
        rules_count: rulesCount,
        brief_id: row.brief_id || null,
        brief_title: row.brief_title || null,
        intel_id: row.intel_id || null,
        intel_title: row.intel_title || null,
        intel_kind: row.intel_kind || null,
      };
    }
    for (const post of posts) post.provenance = byProv[post.id] || { recorded: false };
  } catch { /* provenance is additive; the page works without it (pre-0076 schema) */ }

  let publishedToday = 0;
  try {
    const since = now() - 24 * 3600 * 1000;
    const r = await env.DB.prepare("SELECT COUNT(*) n FROM social_posts WHERE status='published' AND published_at >= ?").bind(since).first();
    publishedToday = (r && r.n) || 0;
  } catch { publishedToday = 0; }

  // Say WHICH of the three states this is in — they need three different actions: add credentials,
  // fix a broken token, or nothing.
  const configured = igConfigured(env);
  const account = configured ? await accountInfo(env) : null;

  // The expiry banner reads from app_settings, not from Meta — see instagram_token_expiry.js for
  // why. `at` is null (and status 'unknown') until an owner has recorded it once.
  const recordedExpiry = await loadTokenExpiry(env);
  const expiry = tokenExpiryStatus(recordedExpiry.at);

  return json({
    ok: true,
    configured,
    connected: !!(account && account.ok),
    account: account && account.ok ? { username: account.username, followers: account.followers_count, media_count: account.media_count } : null,
    account_error: account && !account.ok ? account.error : null,
    daily_cap: DAILY_CAP,
    published_24h: publishedToday,
    remaining_today: Math.max(0, DAILY_CAP - publishedToday),
    setup: configured ? null : 'Set IG_ACCESS_TOKEN (a Cloudflare Pages secret) from a Meta Business app — Instagram → API setup with Instagram business login → Generate token. IG_USER_ID is only needed on the older Facebook Login path.',
    // Which of the two Instagram APIs the token turned out to belong to. Worth surfacing: it
    // decides where the token gets renewed in 60 days.
    host: account && account.ok ? account.host : null,
    token_expiry: {
      at: recordedExpiry.at,
      status: expiry.status,           // 'unknown' | 'ok' | 'warning' | 'urgent' | 'expired'
      days_left: expiry.days_left,
      swap_doc: 'docs/INSTAGRAM_TOKEN_SWAP.md',
    },
    // For the "reference variant" tool's bowl picker (see marketing.html's referenceVariantTool)
    // — sourced from bowl_art.js/bowlspec.js server-side so the client never has to keep its own
    // copy of the 8 bowl names/display labels in sync with the menu.
    reference_bowls: REFERENCE_BOWL_KEYS.map((key) => ({ key, label: BOWL_DISPLAY[key] })),
    // Surfaced so the HUB can say plainly that Gemini's leg of the reference-variant tool is not
    // live yet, rather than the owner discovering it only when a generation silently used OpenAI
    // every time. OPENAI_API_KEY is live in production, so the tool still works without this.
    reference_gemini_configured: !!env.GEMINI_API_KEY,
    posts,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';

  // Stage a post from a Studio image + caption. Nothing leaves the building yet.
  if (op === 'draft') {
    const mediaKey = String(b.media_key || '').trim();
    const caption = String(b.caption || '').trim().slice(0, 2200);
    if (!mediaKey) return bad('Pick an image first.');
    if (mediaKey.includes('..')) return bad('Invalid image.');

    // media_type (migrations/0080): NULL/omitted is the historic default and behaves exactly as
    // before — image or carousel, decided later by slide count. REELS/STORIES are the only values
    // a caller may declare up front, because those two are the ones publishSocialPost cannot infer
    // from slide count (a Reel is one video; so is a photo post — the count alone cannot tell them
    // apart). 'IMAGE'/'CAROUSEL' are valid per the migration's CHECK but pointless to pass here:
    // this app still decides those two the same way it always has.
    const mediaType = String(b.media_type || '').trim().toUpperCase() || null;
    if (mediaType && !['IMAGE', 'CAROUSEL', 'REELS', 'STORIES'].includes(mediaType)) {
      return bad('Unknown post type.');
    }
    const isVideoType = mediaType === 'REELS' || mediaType === 'STORIES';
    // Refuse here rather than at publish time: telling someone their post failed 20 seconds after
    // they hit publish, for a reason knowable now, is a worse experience than refusing the draft.
    // REELS is video-only. STORIES may be a photo OR a video (isVideo is decided by the file
    // extension actually uploaded, same as social_publish.js does at publish time). Everything
    // else (NULL/IMAGE/CAROUSEL) keeps the JPEG-only rule this app has always enforced.
    if (mediaType === 'REELS' && !VIDEO_ONLY.test(mediaKey)) {
      return bad('Reels only accept MP4 or MOV video. Re-export this one and try again.');
    } else if (mediaType === 'STORIES' && !VIDEO_ONLY.test(mediaKey) && !JPEG_ONLY.test(mediaKey)) {
      return bad('Stories only accept a JPEG photo or an MP4/MOV video. Re-export this one and try again.');
    } else if (!isVideoType && !JPEG_ONLY.test(mediaKey)) {
      return bad('Instagram only accepts JPEG images. Re-export this one as .jpg.');
    }

    const postId = id('sp');
    const t = now();
    const scheduledAt = Number(b.scheduled_at) > 0 ? Math.floor(Number(b.scheduled_at)) : null;
    try {
      await env.DB.prepare(
        `INSERT INTO social_posts (id, platform, caption, media_key, media_type, public_token, status, scheduled_at, created_by, created_at, updated_at)
         VALUES (?,'instagram',?,?,?,?,?,?,?,?,?)`
      ).bind(postId, caption || null, mediaKey, mediaType, randToken(24), scheduledAt ? 'scheduled' : 'draft', scheduledAt, ctx.distinct_id || null, t, t).run();
      // The slide row is what publishing actually reads; the legacy column above is write-through
      // for the deploy window only.
      await env.DB.prepare(
        `INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,0,?,?,?)`
      ).bind(id('spm'), postId, mediaKey, randToken(24), t).run();
    } catch (e) {
      return bad('Could not save the post. ' + String((e && e.message) || '').slice(0, 120), 500);
    }
    await capture(env, {
      event: 'social.post_drafted',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { scheduled: !!scheduledAt, has_caption: !!caption, media_type: mediaType },
    });
    return json({ ok: true, id: postId, status: scheduledAt ? 'scheduled' : 'draft' });
  }

  // Edit the words before approving them. An approval step you cannot correct is not an approval
  // step — it is a yes/no on someone else's draft, and the first planner run produced a caption
  // that invented an ordering deadline. Fixing one line has to be cheaper than deleting and
  // re-running.
  if (op === 'edit') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    // A published caption lives on Instagram; changing our copy would make the record disagree
    // with what people actually read.
    if (row.status === 'published') return bad('That is already live — edit the caption in the Instagram app.', 409);
    const caption = String(b.caption == null ? '' : b.caption).slice(0, 2200);
    await env.DB.prepare('UPDATE social_posts SET caption=?, updated_at=? WHERE id=?').bind(caption, now(), postId).run();
    return json({ ok: true, id: postId });
  }

  // Attach an image (or, for a REELS/STORIES post, a video) to a planned post.
  if (op === 'attach') {
    const postId = String(b.id || '').trim();
    const mediaKey = String(b.media_key || '').trim();
    if (!postId) return bad('Missing id.');
    if (!mediaKey) return bad('Pick an image first.');
    if (mediaKey.includes('..')) return bad('Invalid image.');
    const row = await env.DB.prepare('SELECT status, media_type FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That one is already live.', 409);
    if (row.status === 'publishing') return bad('That post is being published right now.', 409);
    const mediaType = row.media_type || null;
    // Format rule matches the post's declared type, not a blanket JPEG check — a REELS/STORIES
    // draft is allowed a video key. See the 'draft' op above for why each type accepts what it does.
    if (mediaType === 'REELS' && !VIDEO_ONLY.test(mediaKey)) {
      return bad('Reels only accept MP4 or MOV video. Re-export this one and try again.');
    } else if (mediaType === 'STORIES' && !VIDEO_ONLY.test(mediaKey) && !JPEG_ONLY.test(mediaKey)) {
      return bad('Stories only accept a JPEG photo or an MP4/MOV video. Re-export this one and try again.');
    } else if (mediaType !== 'REELS' && mediaType !== 'STORIES' && !JPEG_ONLY.test(mediaKey)) {
      return bad('Instagram only accepts JPEG images. Re-export this one as .jpg.');
    }
    const existing = await loadPostMedia(env, postId);
    // A Reel is ONE video; a Story is ONE photo or video — Meta's Stories/Reels containers have no
    // carousel equivalent at all (see the STORIES section of _lib/instagram.js), so a second slide
    // is refused outright rather than silently becoming a carousel Instagram would reject.
    if ((mediaType === 'REELS' || mediaType === 'STORIES') && existing.length >= 1) {
      return bad(mediaType === 'REELS' ? 'A Reel is one video — this post already has one.' : 'A Story is one photo or video — this post already has one.', 409);
    }
    // Meta's carousel ceiling. Refused at attach — the moment the 11th photo is picked — rather
    // than 20 seconds into a publish that was always going to fail.
    if (existing.length >= CAROUSEL_MAX) return bad(`Instagram allows at most ${CAROUSEL_MAX} photos in one post.`, 409);
    const t2 = now();
    await env.DB.prepare(
      `INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,?,?,?,?)`
    ).bind(id('spm'), postId, existing.length, mediaKey, randToken(24), t2).run();
    await env.DB.prepare('UPDATE social_posts SET updated_at=? WHERE id=?').bind(t2, postId).run();
    return json({ ok: true, id: postId, media_key: mediaKey, slides: existing.length + 1 });
  }

  // THE REPAIR the food-first warning offers. coverStatus tells the owner "this post has no food
  // photo — add a real photo before it goes out", and until now that was the whole feature: a
  // finding, handed back to the person the team is supposed to be working for. This turns the
  // warning into a button. Everything about HOW lives in _lib/food_photo.js, shared with the
  // planner and the Team Lead so all three doors mean the same thing by "a food photo".
  //
  // OWNER-TRIGGERED, and it stays a draft. Attaching an image is not approval — nothing here
  // touches status, so a generated bowl photo can never schedule itself onto the grid.
  if (op === 'generate_cover') {
    // FIRST-CLASS "generate an image from a prompt" — the owner's own complaint: Creative Studio
    // could do this once, then the pipeline moved to captions and it quietly disappeared. This
    // branch is deliberately checked BEFORE the postId is required below: it is not the food-first
    // REPAIR flow (which renders from a POST'S OWN caption/image_brief and auto-attaches as slide
    // 1 — see the header comment on this op and on _lib/food_photo.js). A typed prompt runs the
    // SAME chain (generatePlateImageDetailed -> OpenAI -> Gemini -> Workers AI, the same $50/week
    // budget gate, the same owner-training grounding in _lib/image_prompt.js) but is NEVER
    // attached automatically — it is generated and stored, then handed back for the owner to
    // preview. The caller (marketing.html) either has no post yet (the Create > Instagram
    // composer — the returned key becomes the picked photo for the draft about to be saved) or an
    // existing draft (the caller then taps "Use this", which is the ordinary 'attach' op below,
    // same two-step posture as generate_reference_variant). `id`, if present, is simply unused
    // here — the image itself has no post to belong to yet.
    const promptText = String(b.prompt || '').trim();
    if (promptText) {
      // ASPECT IS THE CALLER'S TO CHOOSE, and it is not cosmetic. A Reel or Story is a 9:16
      // surface: a square render there gets pillarboxed with dead bars. A FEED post is the
      // opposite trap — Instagram's tallest supported feed ratio is 4:5, and portrait here is
      // 2:3 (the tallest gpt-image-2 renders natively, see IMAGE_SIZES), so a portrait image on a
      // feed post would be CROPPED by Instagram, not letterboxed. Neither default is right for
      // both, so the composer says which surface it is building for and this only validates.
      const aspect = b.aspect === 'portrait' ? 'portrait' : 'square';
      const out = await generatePlateImageDetailed(env, promptText.slice(0, 400), { requireJpeg: true, role: 'photo', aspect });
      if (!out || !out.key) {
        return bad('No image provider was able to make a JPEG right now — the weekly AI budget may be spent, or the providers are unreachable. Try again later.', 502);
      }
      await capture(env, {
        event: 'social.image_generated_from_prompt',
        distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
        properties: { provider: out.provider },
      });
      return json({ ok: true, media_key: out.key, provider: out.provider });
    }

    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status, caption, image_brief FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That one is already live — its slides are the public record of what went out.', 409);
    if (row.status === 'publishing') return bad('That post is being published right now.', 409);

    const out = await ensureFoodPhoto(env, { postId, caption: row.caption, imageBrief: row.image_brief });
    if (!out.ok) {
      // Each reason gets its own sentence, because each has a different next move and "could not
      // generate an image" would send the owner to the wrong one.
      const WHY = {
        already_has_photo: 'This post already has a food photo — publishing moves it to the front on its own.',
        no_prompt: 'There is no art direction or usable caption on this post to generate from. Write the caption first, or upload a photo with 📷.',
        carousel_full: `This post already has Instagram's maximum of ${CAROUSEL_MAX} slides. Remove one to make room for a food cover.`,
        generation_failed: 'No image provider was able to make a JPEG right now — the weekly AI budget may be spent, or the providers are unreachable. Upload a real photo with 📷, or try again later.',
        db_failed: 'The image was made but could not be attached. Try again.',
      };
      return bad(WHY[out.reason] || 'Could not generate a food photo.', out.reason === 'already_has_photo' ? 409 : 502);
    }
    await capture(env, {
      event: 'social.cover_generated',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { provider: out.provider, slides: out.slides, from_brief: !!row.image_brief },
    });
    return json({ ok: true, id: postId, media_key: out.media_key, provider: out.provider, slides: out.slides });
  }

  // Generate the REST of a carousel — several MORE photos that look like one set (same light,
  // surface, palette; different dish/angle/detail), not automatically, only when the owner picks a
  // size and taps this. See _lib/carousel_gen.js for how the set stays cohesive without a reference
  // image, and why a partial batch (budget ran out midway) is reported honestly, not padded.
  //
  // OWNER-TRIGGERED, and it stays a draft — same posture as generate_cover above. This only ADDS
  // slides after whatever is already on the post; an owner-uploaded photo is never touched, moved,
  // or replaced by anything this generates.
  if (op === 'generate_carousel') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status, caption, image_brief FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That one is already live — its slides are the public record of what went out.', 409);
    if (row.status === 'publishing') return bad('That post is being published right now.', 409);

    const out = await generateCarouselSlides(env, {
      postId, caption: row.caption, imageBrief: row.image_brief, targetCount: b.count,
    });
    if (!out.ok) {
      // Each reason gets its own sentence — see generate_cover's WHY table above for why a shared
      // "could not generate" message would send the owner to the wrong next move.
      const WHY = {
        bad_count: `Pick a carousel size between 2 and ${CAROUSEL_MAX}.`,
        no_prompt: 'There is no art direction or usable caption on this post to generate from. Write the caption first, or upload photos with 📷.',
        carousel_full: `This post is already at Instagram's maximum of ${CAROUSEL_MAX} slides.`,
        already_at_target: `This post already has ${out.slides} slides — that is at or past what you asked for.`,
        generation_failed: 'No image provider could make any of the extra slides right now — the weekly AI budget may be spent, or the providers are unreachable. Try again later, or add photos with 📷.',
      };
      return bad(WHY[out.reason] || 'Could not generate the carousel.', out.reason === 'bad_count' ? 400 : (out.reason === 'already_at_target' ? 409 : 502));
    }
    // Best-effort — the post is already saved regardless of whether this write lands.
    await stampPostProvenance(env, { postId, format: 'carousel', slideCount: out.slides });
    await capture(env, {
      event: 'social.carousel_generated',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, added: out.added, requested: out.requested, slides: out.slides },
    });
    const message = out.added < out.requested
      ? `Added ${out.added} of ${out.requested} — the rest hit the weekly AI budget or a provider issue. Try again later for the remainder.`
      : `Added ${out.added} photo${out.added === 1 ? '' : 's'} — ${out.slides} slides total.`;
    return json({ ok: true, id: postId, added: out.added, requested: out.requested, slides: out.slides, message });
  }

  // Reference-conditioned variant: the SAME real bowl photo, restyled surroundings only — the
  // owner's own request ("teach [the model] to use the original bowl images and just change the
  // positions, background, themes"), never wired into the planner or any repair button. This op
  // only runs when the owner picks a bowl, types a campaign look, and taps Generate in the Create
  // > Instagram tab. See _lib/reference_variant.js for how the faithfulness boundary is enforced
  // in the prompt and which providers can even attempt it.
  //
  // MATCHES THE BRANDING TOOL'S OWN POSTURE, not generate_cover/generate_carousel's: this
  // GENERATES AND STORES the image (via generatePlateImageDetailed -> putMedia) but does NOT
  // attach it to the post. The owner previews it client-side and taps "Use this", which calls the
  // ordinary 'attach' op below — the same op the branding tool's own preview uses. An image nobody
  // asked to keep is a click to discard, never a slide someone has to notice and remove.
  if (op === 'generate_reference_variant') {
    const postId = String(b.id || '').trim();
    const bowl = String(b.bowl || '').trim().toLowerCase();
    const lookBrief = String(b.look || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That one is already live — its slides are the public record of what went out.', 409);
    if (row.status === 'publishing') return bad('That post is being published right now.', 409);

    // Refused here, before spending anything, for the same reason 'attach' refuses an 11th photo
    // at the moment it's picked rather than after generating one that could never be added.
    const existing = await loadPostMedia(env, postId);
    if (existing.length >= CAROUSEL_MAX) return bad(`Instagram allows at most ${CAROUSEL_MAX} photos in one post.`, 409);

    const out = await generateReferenceVariant(env, { bowl, lookBrief });
    if (!out.ok) {
      // Each reason gets its own sentence — see generate_cover's WHY table above for why a shared
      // "could not generate" message would send the owner to the wrong next move.
      const WHY = {
        bad_bowl: 'Pick one of the eight Añejo bowls.',
        no_look: 'Describe the campaign look first — background, surface, camera, lighting, theme.',
        reference_missing: 'That bowl’s real photo is not staged yet — there is nothing to base a styled variant on.',
        generation_failed: 'OpenAI and Gemini could not make this right now — Gemini may not be configured yet, the weekly AI budget may be spent, or both are unreachable. Try again later.',
      };
      const status = (out.reason === 'bad_bowl' || out.reason === 'no_look') ? 400 : (out.reason === 'reference_missing' ? 404 : 502);
      return bad(WHY[out.reason] || 'Could not generate a variant.', status);
    }
    await capture(env, {
      event: 'social.reference_variant_generated',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, bowl, provider: out.provider },
    });
    // NOT attached — see header note above. The caller (marketing.html's referenceVariantTool)
    // previews media_key and calls 'attach' itself once the owner accepts it.
    return json({ ok: true, media_key: out.media_key, provider: out.provider, source_bowl: out.source_bowl });
  }

  // Remove one slide. Reversible curation, so no confirm theatre — but never on a live post,
  // whose slides are a public record of what went out.
  if (op === 'detach') {
    const postId = String(b.id || '').trim();
    const slideId = String(b.media_id || '').trim();
    if (!postId || !slideId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published' || row.status === 'publishing') return bad('That post is already on its way out.', 409);
    const r = await env.DB.prepare('DELETE FROM social_post_media WHERE id=? AND post_id=?').bind(slideId, postId).run();
    if (!r.meta || r.meta.changes !== 1) return bad('That photo is not on this post.', 404);
    // Reseal the order so seq stays 0..n-1 — slide order is editorial data, not an accident.
    const left = await loadPostMedia(env, postId);
    for (let i = 0; i < left.length; i++) {
      if (left[i].seq !== i) await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=?').bind(i, left[i].id).run();
    }
    return json({ ok: true, id: postId, slides: left.length });
  }

  // Reorder slides: the array IS the new order. Ignores ids that are not on the post rather than
  // failing the whole reorder over a stale page.
  if (op === 'reorder') {
    const postId = String(b.id || '').trim();
    const order = Array.isArray(b.media_ids) ? b.media_ids.map(String) : [];
    if (!postId || !order.length) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published' || row.status === 'publishing') return bad('That post is already on its way out.', 409);
    const existing = await loadPostMedia(env, postId);
    const mine = new Set(existing.map((m) => m.id));
    let seq = 0;
    for (const mid of order) {
      if (!mine.has(mid)) continue;
      await env.DB.prepare('UPDATE social_post_media SET seq=? WHERE id=? AND post_id=?').bind(seq++, mid, postId).run();
    }
    return json({ ok: true, id: postId });
  }

  // Build the real containers at Meta and STOP — nothing reaches the profile. How a carousel is
  // verified live before anyone trusts it with a real post.
  if (op === 'dry_run') {
    if (!igConfigured(env)) return bad('Instagram is not set up yet.', 400);
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const post = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!post) return bad('That post no longer exists.', 404);
    // Deliberately NO claim: a dry run must not move the post's status, and the shared path
    // writes nothing in dry mode.
    const res = await publishSocialPost(env, request, post, { publish: false });
    return res.ok ? json({ ok: true, dry_run: true, container_id: res.container_id, slides: (res.children || []).length }) : bad(res.error || 'Dry run failed.', 502);
  }

  // Approve a draft onto the schedule. THIS is the human gate: the planner writes, a person says
  // yes, and only then does the tick have anything to publish.
  if (op === 'schedule') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status !== 'draft' && row.status !== 'scheduled' && row.status !== 'failed') {
      return bad('That post is already on its way out.', 409);
    }
    // A post with no picture cannot go on the schedule, or the tick would have to decide what to
    // do about it at 11am on a Tuesday — and the only honest answer then is "nothing".
    if (!(await loadPostMedia(env, postId)).length) return bad('Add a photo before scheduling it.', 409);
    const when = Number(b.scheduled_at);
    if (!Number.isFinite(when) || when <= 0) return bad('Pick a date and time.');
    if (when < now() - 60000) return bad('That time has already passed.');
    await env.DB.prepare("UPDATE social_posts SET status='scheduled', scheduled_at=?, error=NULL, updated_at=? WHERE id=?")
      .bind(when, now(), postId).run();
    // Trust ledger (0072): the FIRST human yes on a planner draft is the datum — untouched
    // caption extends the category's clean streak, an edited one resets it. Only counted on
    // draft → scheduled so re-scheduling (or retrying a failure) cannot inflate the streak.
    if (row.status === 'draft') await noteTrustApproval(env, postId);
    await capture(env, {
      event: 'social.post_scheduled',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, lead_minutes: Math.round((when - now()) / 60000) },
    });
    return json({ ok: true, id: postId, status: 'scheduled', scheduled_at: when });
  }

  if (op === 'unschedule') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    const r = await env.DB.prepare("UPDATE social_posts SET status='draft', scheduled_at=NULL, updated_at=? WHERE id=? AND status='scheduled'")
      .bind(now(), postId).run();
    if (!r.meta || r.meta.changes !== 1) return bad('That post is not scheduled.', 409);
    return json({ ok: true, id: postId, status: 'draft' });
  }

  if (op === 'delete') {
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');
    // A published post is a real thing on a real profile — deleting our row would just lose the
    // record of it while the post stays up. Refuse and say so.
    const row = await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!row) return bad('That post no longer exists.', 404);
    if (row.status === 'published') return bad('That is already live on Instagram — delete it in the app, not here.', 409);
    await env.DB.prepare('DELETE FROM social_posts WHERE id=?').bind(postId).run();
    return json({ ok: true, deleted: postId });
  }

  if (op === 'publish') {
    if (!igConfigured(env)) return bad('Instagram is not set up yet — add IG_ACCESS_TOKEN and IG_USER_ID first.', 400);
    const postId = String(b.id || '').trim();
    if (!postId) return bad('Missing id.');

    const post = await env.DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(postId).first().catch(() => null);
    if (!post) return bad('That post no longer exists.', 404);
    if (post.status === 'published') return json({ ok: true, already: true, permalink: post.permalink, media_id: post.ig_media_id });
    // A planned post has its words and its timing but no picture yet. Refuse clearly rather than
    // letting Instagram fetch a 404 and reporting that back as a publish failure.


    // CLAIM IT FIRST. The publish flow takes ~20s (Instagram fetches the image, we poll), and a
    // second click — or the scheduler firing mid-click — would otherwise post the same photo twice.
    // The status guard in the UPDATE is the lock: only one caller can move it out of draft.
    const claim = await env.DB.prepare(
      "UPDATE social_posts SET status='publishing', error=NULL, updated_at=? WHERE id=? AND status IN ('draft','scheduled','failed')"
    ).bind(now(), postId).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) {
      return bad('That post is already being published.', 409);
    }

    // Trust ledger (0072): publishing straight from draft IS the approval, so count it here;
    // a scheduled post was already counted when the owner approved it onto the schedule.
    if (post.status === 'draft') await noteTrustApproval(env, postId);

    // Single image or carousel — decided inside the ONE shared path the tick also uses, which
    // writes the outcome rows itself so a failure can never strand the post in 'publishing'.
    const res = await publishSocialPost(env, request, post);
    if (!res.ok) return bad(res.error || 'Could not publish to Instagram.', 502);

    await capture(env, {
      event: 'social.post_published',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { post_id: postId, has_permalink: !!res.permalink },
    });
    return json({ ok: true, id: postId, media_id: res.media_id, permalink: res.permalink });
  }

  // Record what Meta's own dashboard says the token expires on — never fetched, never guessed.
  // Blank/omitted clears it back to 'unknown' rather than leaving a stale date behind, because a
  // stale-but-present date is worse than none: it reads as current and can lull past a real one.
  if (op === 'set_token_expiry') {
    let at = null;
    if (b.expires_at !== null && b.expires_at !== undefined && b.expires_at !== '') {
      at = Number(b.expires_at);
      if (!Number.isFinite(at) || at <= 0) return bad('That is not a valid date.');
    }
    const r = await saveTokenExpiry(env, at, ctx.distinct_id || null);
    if (!r.ok) return bad('Could not save that.', 500);
    await capture(env, {
      event: 'social.ig_token_expiry_set',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { cleared: at === null },
    });
    return json({ ok: true, at: r.at });
  }

  return bad('Unknown action.');
};
