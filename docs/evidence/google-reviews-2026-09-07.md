# Homepage Google reviews — 2026-09-07

## Scope and approval

Dayan authorized replacing the homepage placeholder testimonials with the business's real Google reviews in this direct session on 2026-09-07. Owner: Codex. Release branch: `codex/google-reviews`, isolated from the unfinished Cajita builder, based on production `dd54aec524d6fde06692a4298bc28799d274231b`.

Excluded: builder release, homepage redesign, pricing, forms, production databases, credentials, email, DNS and deployment settings.

## Source verification

Observed the Google business review dialog for **Añejo Catering Co.**, matched to `anejocateringco.com`, using the public Google Search and Maps UI on 2026-09-07. Google displayed **5.0 from 6 reviews**. Expanded the original Spanish wording instead of using Google's English translations. Collected each review's own Share review link:

| Reviewer | Original review |
| --- | --- |
| WA WA | https://share.google/yhoMF3rSC82P140qA |
| Herduin Garcia Heal | https://share.google/wjOAoPjHXu8GDnRNb |
| Randy Sanchez | https://share.google/Pxi2BRwOCn6ctE2SE |
| Michel Diaz Mordoche | https://share.google/PvZ47z3bdcR9XXxPe |
| Gabriela Barrios | https://share.google/jdBJZipGFgiN1TjhZ |
| Barbaro Gonzalez | https://share.google/9og2RSX7UtOrQTaCD |

Business source: https://www.google.com/maps/place/A%C3%B1ejo+Catering+Co./data=!4m2!3m1!1s0x0:0xd07b3989f9f471fc

Only short verbatim excerpts are displayed. No exact publication dates or individual star scores were inferred. The aggregate has an explicit observation date and non-live disclaimer; this is not an automatic Google feed or a verified-purchase claim.

## Change log and artifacts

- `public/index.html`: replaced all three testimonial placeholders with six attributed original-language review cards, individual source links, the dated aggregate, all-reviews link, and responsive 3/2/1-column layout.
- `public/assets/js/i18n.js`: translated review-section controls to Spanish; honors `translate="no"` for source quotations/names and protected attributes; removed obsolete placeholder translations. Homepage uses a versioned script query to avoid stale translation behavior.
- `test/ui/google-reviews.test.js`: exact quote/author/link mapping, source uniqueness, disclaimer, placeholder removal, translation guard tests and execution of the actual protected-text walker.

## Validation

- `npm ci --ignore-scripts`: success, 0 reported vulnerabilities.
- `npm run lint`: passed.
- `npm test --silent`: 1,778 passed; 0 failed, skipped or cancelled.
- `git diff --check`: passed.
- Static local preview at `http://127.0.0.1:8803/#testimonials`: browser inspected desktop and 390 × 844 mobile; no horizontal overflow, mobile single-column cards. Clicked a review source link. Spanish toggle translated section controls while preserving all six original quotations and reviewer names.
- No quote/tasting/order forms submitted; static preview cannot use production bindings.

## Release state / remaining risks

Published through [PR 60](https://github.com/dayan-jasonAI/anejo-app/pull/60), merge commit `c50aedb2098a02f33d0eb794459a2364d913509c`. Functions CI, Hub lint/test/build, and Cloudflare Pages checks passed. The Cloudflare skill kept this release on the existing Git-triggered path with no deployment-setting changes.

Production browser verification on 2026-09-07 at `https://anejocateringco.com/#testimonials`: observed all six exact quote/author/source mappings, 5.0/6 aggregate, dated non-live disclaimer, versioned i18n script, three-column desktop grid and no horizontal overflow. Visually inspected live cards; placeholder review cards are absent. This scoped update is complete with live artifact and test evidence. The production change was merged back into `codex/cajita-3d-builder` with `[skip deploy]` to preserve the unfinished draft without publishing it.

New reviews and aggregate changes require a future refresh; no automated synchronization was added. Revert this scoped release commit to roll back without touching the Cajita draft.

No information blocker or additional approval remains for this scoped change. While release checks ran, regression tests and evidence review continued. Next action for Dayan: view the live reviews section. Automatic refresh would be a separate future enhancement, not a feature of this release.
