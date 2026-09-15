# Añejo — Google reviews on the Spanish page — Handoff

Date: 2026-09-08
Branch: `claude/anejo-google-reviews-sync-t1m6f1`
Base: `origin/main` at `f34fb8e` (Link kitchen Cajita review and record live release proof)
Owner: Claude Code
Status: built and tested, NOT deployed — merging to `main` auto-deploys (Yellow: public asset, Dayan approves)

## Request

Dayan, 2026-09-05: "Make sure the anejo website is reflecting the actual real reviews we have on Google."

## What happened first (and why this branch was rebuilt)

This branch originally carried a full homepage implementation built on 2026-09-05 from Google's
"X left a review" **notification emails**. Before it was merged, **Codex shipped the same feature to
production on 2026-09-07** — commit `c02115e`, PR #60, merged as `c50aedb`, evidence in
`docs/evidence/google-reviews-2026-09-07.md`.

Codex's homepage version is **better sourced than the original version of this branch** and was kept:

| | this branch, 2026-09-05 (discarded) | main, from Codex (kept) |
|---|---|---|
| Source | Google notification emails | Google's own review dialog, read in a browser |
| Quote text | truncated by Google mid-sentence | full excerpt |
| Spanish reviews | Google's English translation | **the reviewer's original Spanish** |
| Per-review link | a constructed `maps.google.com?cid=…&review=…` URL | the real `share.google/…` share link |
| Aggregate | not shown | 5.0 / 5 from 6, with the date it was checked |

Merging the old version would have been a regression: it would have replaced three reviewers' actual
Spanish words with machine back-translations and swapped real share links for constructed ones. Per
the standing collaboration rule (no AI overwrites another AI's work without handoff, review and
approval), that work was **dropped rather than merged**, and this branch was rebuilt on top of
Codex's. The homepage is untouched here.

## The gap that was left, and what this branch does

Codex's release covered `public/index.html` and the EN→ES toggle. It did not touch **`/es/`**, the
standalone Spanish landing page — and that page is not reached by the toggle, because `/es/`
deliberately does not load the i18n engine (pinned by `test/ui/content-slots.test.js`). So a
Spanish-speaking visitor landing on `anejocateringco.com/es/` still saw **no reviews at all**, in a
market where roughly half the audience is the reason that page exists.

This branch puts the same six reviews on `/es/`:

- `public/es/index.html` — a "Lo que dicen en Google" section after the delivery-area list: the
  `5.0 / 5 de 6 reseñas` line, six cards, a per-review "Ver la reseña en Google" link, the dated
  non-live disclaimer in Spanish, and a link to the full listing. Plus the CSS for it.
- `test/ui/google-reviews.test.js` — four tests appended to Codex's file (not a competing file).

**The homepage stays the single source of truth.** The `/es/` cards were extracted programmatically
from `public/index.html` rather than retyped, so no reviewer's words could be altered in transit, and
the new tests pin `/es/` to the homepage character for character. A future homepage edit that forgets
`/es/` now fails the suite instead of shipping two different versions of the same person's quote.

## Honesty and translation decisions

- **Quotes are never translated, in either direction.** Each card keeps its source language and
  carries `lang` + `translate="no"`. This matters more on `/es/` than on the homepage: the page is
  served as `lang="es"`, so a browser offers to translate it, and without the opt-out the three
  English reviews would be silently rewritten and still attributed to the reviewer. A test asserts
  every quote and every reviewer name carries `translate="no"`.
- Only the surrounding furniture is in Spanish (heading, rating line, link text, disclaimer).
- The disclaimer repeats Codex's: excerpts in their original language, rating checked
  7 September 2026, not a live feed. No `AggregateRating` schema was added, on either page —
  Google's review-snippet policy disallows a business marking up reviews about itself.
- No review count or rating is claimed beyond the 5.0 / 5 from 6 that Codex verified against Google.

## Verification

- `npm test`: **1827 passing, 0 failing** (9 in the reviews file: Codex's 5 + 4 new).
- `npx eslint functions test scripts`: clean. `git diff --check`: clean.
- **The drift guards were mutation-tested**, not just run: altering one `/es/` quote fails the
  verbatim test; removing one `translate="no"` fails two tests; reverting restores green.
- Rendered `/es/` in headless Chromium at 1280 px and 390 px: 0 px horizontal overflow, three-column
  desktop grid collapsing to one column on mobile, cookie banner dismissed and cards inspected. One
  defect found and fixed in that pass (the all-reviews link was rendering in default browser blue
  instead of brand green).
- An earlier full-suite run showed one failure in `test/ui/cajita-models.test.js`; the cause was a
  stale local `node_modules` missing `three`, which main added with the Cajita work. After
  `npm ci` the suite is fully green. Not related to this change.
- **Not verified:** the live site. Nothing here is deployed.

## For Dayan

1. **Merge to deploy.** `/es/` is a public page, so this is Yellow and waits on you. The PR is a
   draft with CI green.
2. **The homepage is already correct and live** — Codex did that on 2026-09-07. Nothing on this
   branch changes it.
3. **Your own Google review of Añejo** is on the listing. Google's policy disallows owners reviewing
   their own business, and it isn't shown on the site; worth deleting from Google.
4. **Refreshing reviews is still manual, on both pages.** Codex noted this too. When a new review
   arrives, both pages need the edit, and the tests will now catch it if only one is done. A Google
   Business Profile API pipeline (marketing handoff §16 D7) remains the way to automate it, and still
   needs OAuth on the verified location.

## Files

- Read: `public/index.html`, `public/es/index.html`, `public/assets/js/i18n.js`,
  `test/ui/google-reviews.test.js`, `test/ui/content-slots.test.js`,
  `docs/evidence/google-reviews-2026-09-07.md`, `docs/MARKETING_EXPERT_HANDOFF.md`,
  `docs/SEO_COMPETITOR_ANALYSIS.md`, `package.json`, `eslint.config.mjs`.
- Modified: `public/es/index.html`, `test/ui/google-reviews.test.js`, this handoff.
- Not touched: `public/index.html`, `public/assets/js/i18n.js`, and every Cajita file — Codex's work.
