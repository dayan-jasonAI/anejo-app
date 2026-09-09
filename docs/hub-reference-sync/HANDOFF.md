# Hub source-of-truth and marketing reference sync

Owner authorization: direct request to update the source of truth and all Creative Studio/marketing references in Añejo Hub.

## Completed
- Updated live doc_brand_main with the three-category family, current serving weights, product/format distinctions, checkout routes and current 48h standard / 72h custom-print rules.
- Preserved existing §13 draft kitchen specifications and proposed changes verbatim. Pending proposals remain excluded by AI loaders.
- Created the live Menu, Photography & Marketing Reference manual for kitchen/owner/marketing, including all 140 active SKU descriptions, dated prices and image paths.
- Added five owner-direction training rules; scoped 13 older bowl-composition rules to Fit only. No human messages sent.
- Updated three marketing onboarding/design references, canonical repository brief, compiled marketing/intel/brand fallback modules, Creative Studio fallback and image-generation guidance.
- Expanded full brand context limits together to 32k so the extended brief is not silently cut off. Existing photo rules now respect trays, cajitas, cups and plates.

## Validation
- Live D1 brief and manual read back byte-for-byte equal to expected files. Five new training rules confirmed, including current catering lead times.
- Live /api/menu: 140 items; every ID, price and image matches the dated reference source.
- 1,928 tests passed after merging origin/main catering checkout changes. Lint: zero errors, two existing vendor warnings.
- Production deployment 16882587-0dae-4dbb-84c2-89a94ef2bf00, source cd9ee99, independently verified by Wrangler deployment listing.
- Automated postdeploy token-based verifier skipped for missing token environment; not counted as a pass.
- Knowledge library contains regulatory references and no obsolete brand/menu chunks; no reindex or regulatory edits needed.

## Boundaries and next action
No blockers or additional approval required for this source update. No social publishing, customer outreach or real payment transaction performed. Current catalog prices are not proof of measured production margins. Historical design documents retain their dated operational history with prominent current-reference links. Reopen a Team Lead/Studio conversation to use the current references; old chat replies are historical.

While deployment checks ran, verified the live catalog and preserved the newly merged standard-catering checkout work. Next: use Hub Content to review the new manual and Marketing Training for the five current rules. Future price/availability changes should stay in menu_items and be re-read before publishing.

Before snapshots and guarded apply/followup SQL are retained here. rollback.sql restores initial content and deactivates the new manual/rules; review against any later owner edits before running it.
