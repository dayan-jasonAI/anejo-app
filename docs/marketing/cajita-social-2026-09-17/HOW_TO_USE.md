# Añejo photo-to-post workflow

Open https://anejocateringco.com/hub/owner/marketing#photos while signed in as owner or marketing staff.

1. Enter an event name and choose several photos. JPEG, PNG and WebP are supported, up to 5 MB each. Export HEIC as JPEG first. Video intake is not supported by this Photos library yet. Original files are preserved.
2. Find the photo by filename or event. Search covers loaded pages; load more to include older photos. Choose Create post. PNG/WebP creates a separate JPEG copy for Instagram.
3. Write the caption, or open Help me write, choose the service/language and supply factual notes. A preview is not automatically saved. Verify that every named dish was actually at the event; the model cannot see the photo. Choose Use caption only after review.
4. Save without a date to keep a draft. Review the image, visible names/people, caption and quote/order destination. Approve a future time only when the exact post is ready for public release. Editing a scheduled caption returns it to draft for review.
5. Check the result in Today and Create. A saved schedule is not proof of publication; a live post should have an Instagram link. Failed or uncertain publishing needs review before retrying. Connection expiry is a recorded warning, not automatic renewal.

The three prepared first-event campaign drafts are listed in WORK_LOG.md. They remain unscheduled until Dayan reviews their rendered images/captions, including visible personalized birthday tags. Suggested review: preview.html.

Measure inquiries and paid orders separately from reach, followers and clicks. Existing tracked-link attribution is partial; zero attributed orders does not prove zero sales. No revenue outcome has yet been established for these new drafts.

Current boundaries: full camera-original archive not yet supplied; live marketing-staff browser session acceptance remains pending; social network support is currently Instagram, with existing separate email workflow. Paid ads, customer messages, credential renewal and additional social-channel activation require scoped authorization.

## Shared picker and photo polish

Today has **Use a library photo**. Create & Schedule has **Choose from library** next to the local upload button; eligible saved drafts have the same choice. Picking a photo keeps the current caption and suggested time. Local JPEG uploads from Create now also save into the shared Photos library. These files live in Cloudflare R2 (`MEDIA`, `marketing-library/`), not Google Drive or only on your computer.

Choose **Enhance photo** (or **Enhance a copy** inside the picker). The default **Photo polish** adjusts original pixels for Natural, Bright, or Warm exposure/contrast/color, preserving composition and using no AI credits. It saves a separate JPEG (longest edge capped at 4096 pixels). Optional **AI retouch** supplies the original as a mandatory reference but may reconstruct details or change framing; it is experimental. Both preserve the original and label the copy. Compare both images, including food counts, ingredients, packaging, logos and printed text, before choosing Use this copy. AI retouch additionally requires the review checkbox. AI can change details; a prompt is not proof of faithful reproduction. AI copies remain labeled AI-enhanced; photographic copies are labeled separately. This flow does not publish or schedule a post. Only optional AI retouch uses the existing AI budget. Camera RAW/DNG and HEIC need exporting to JPEG first.
