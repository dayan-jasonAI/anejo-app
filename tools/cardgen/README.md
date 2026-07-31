# Card generators — the visual template library

This folder is the durable home of every programmatic design template Añejo posts with.
It exists because the first generation of cards was built in a session temp folder and
would have evaporated with the session.

## What's here
- `series_cards.py` — the 1080×1080 Instagram card family (dark cellar green `#0A180A`,
  gold `#C8BC6E`, cream `#F5F2EC`, gold frame, emblem, Cormorant + Josefin). Source of the
  26-card series in R2 under `studio/2026-07/series/`.
- `og_calculator.py` — the 1200×630 link-preview card for `/calculator` (macro donut).
  Output ships in the repo at `public/assets/img/og_calculator.png`.
- `bowl_post.py` — the 1080×1350 bowl post image (real photography + gold frame, emblem,
  bowl name, URL). Output is staged in R2 at `studio/bowls/<bowl>.jpg` and auto-attached to
  any Lead draft that names exactly one bowl (`functions/_lib/bowl_art.js`). Re-run and
  re-upload after changing bowl photography:
  `python3 tools/cardgen/bowl_post.py /tmp/bowlposts` then
  `npx wrangler r2 object put anejo-media/studio/bowls/<bowl>.jpg --file /tmp/bowlposts/<bowl>.jpg --content-type image/jpeg`
- `fonts/` — the exact variable TTFs the brand renders with. Do not swap these for
  system fonts; weight axes are set per-text (`set_variation_by_axes`).
- `references/` — **drop new template examples here.** See below.

## Where finished posts live (none of it is in this folder)
| Thing | Where |
|---|---|
| Captions, schedule, audit scores | D1 `social_posts` (status: draft → scheduled → posted) |
| Carousel slides (per-slide media) | D1 `social_post_media` → R2 keys |
| The actual image files | R2 bucket `anejo-media`, e.g. `studio/2026-07/series/p1_cover.jpg` |
| Bowl photography | `public/assets/img/bowl_*.jpg` (repo, deployed) |

Fetch any R2 asset: `npx wrangler r2 object get anejo-media <key> --file out.jpg`

## Adding a template the team learns from
1. Put the example image (yours, a competitor's, a mockup) in `references/` with a
   short spec next to it: `references/<name>.md` — what it is, when to use it, what
   rules it follows or breaks. Commit both.
2. If it should become a reusable generator, add `<name>.py` beside the others,
   following the palette/fonts/frame conventions in `series_cards.py`.
3. **Text/voice learning is a different lever**: the AI team (Team Lead, planner,
   governance, Aña) grounds itself in `docs/brand-standards-brief.md` — Dayan's brief,
   compiled *verbatim* into `functions/_lib/brand_context.js` by
   `node scripts/build-brand-context.mjs`. Edit the brief → run the script → deploy,
   and every model on the team knows it. Summarising the brief is how brands drift;
   the pipeline intentionally ships his exact words.
