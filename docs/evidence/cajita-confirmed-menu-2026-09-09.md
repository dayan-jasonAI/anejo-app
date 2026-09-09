# Confirmed Cajita menu release

Owner: Codex. Authorization: Dayan, direct session, September 8 ET / September 9 UTC: “Update the site now”, followed by “continue.” Scope: confirmed bilingual menu/defaults, filling capture, kitchen/owner summaries and publication. No paid services, purchases, credentials, DNS, payments or database migrations.

## Changes

- Default six: Hawaiian roll with ham spread, guava-and-cheese empanada, ham croqueta, 6 oz macaroni salad, one fruit/ham/guava/cheese/pineapple skewer, 3–4 oz tres leches cup. Grazing bites remain optional, not an additional default duplicate of the skewer.
- Owner-confirmed alternate fillings have explicit controls. Stable flavor IDs survive duplication, local drafts, download, validation, request storage and notification summaries. Historical records without a flavor remain unspecified; defaults are not retroactively applied.
- Public Cajita/catering copy and Hub review are bilingual. Lechon serving is 6 oz; tamales three slices, approximately 5.5 oz total; cooked congri two cups per person, twenty for ten guests. No weight-to-volume conversion or guessed pricing.
- Roll preview changed from patty-like geometry to a soft square roll and thin spread. This is an illustrative correction, NOT the requested photorealistic 3D milestone.
- Current no-butter croqueta direction accepted; no unsupported dairy-free claim or proprietary recipe published.

## Validation

- Full suite: 1,890 passed, zero failed. Log: `/tmp/anejo-menu-update-tests.log`.
- `npm run build:cajita`: successful.
- `npm run lint`: zero errors, two existing vendor unused-variable warnings.
- Functions compilation: successful, output `/tmp/anejo-menu-update-worker.js`.
- Browser: new ham/guava-cheese/ham defaults, one skewer, dessert and zero optional grazing observed. Changed to tuna spread, duplicated version, changed second croqueta to chorizo, switched to Spanish; summary retained separate exact selections.
- Backend integration test exercises lead handler and confirms flavor included in owner email payload. No new production test lead or email sent in this release verification.
- Deploy guard: checkout ahead of origin/main, no released commits missing. Background auto-sync captured early changes in commit 213a3e7 with skip-deploy; inspected rather than reverted.

## Recovered dimensions and limits

Read ChatGPT task “Design Premium Cuban Box,” ID 6a99c93f-ef34-83e9-8d53-e4cfd30b1e14. It discusses the 7 × 5-inch outer box, 3-inch label, 2 × 3.5-inch tag and earlier alternative cup suggestions. It does not establish measured height for the final purchased box. Older AI-suggested smaller salad portions do not override Dayan's current 6 oz instruction. No exact-fit claim added.

Photorealistic meshes and box-height verification remain open. Existing AI theme endpoint stays disabled; no additional paid service activated. Packaging changes remain subject to quote review. Existing requests and assets retained.

## Publication / rollback

Publication evidence to be appended after production verification. Publish only the reviewed changes and retain previous production source 60c4ca6 for code rollback. Do not restore the database or discard newer customer requests to roll back code.

## Production evidence

- Release 9cce3d7 pushed to the reviewed branch and fast-forwarded to main. Pages production deployment: 9cbbf5f5-f677-47dd-8e7d-8ea697785971, source 9cce3d7, main.
- Live `/cajita` and `/catering` returned HTTP 200 and the confirmed updated copy.
- SHA256 comparison of served builder, public catering translation file, and Hub catering translation file against tested local files: all three match. Checked with release query `?release=9cce3d7` after rollout; initial pre-rollout reads correctly showed old assets and were not counted as success.
- Live builder opened and menu controls inspected: Hawaiian roll, all configured filling choices, ham croqueta, 6 oz salad, 3–4 oz dessert, one skewer visible in Spanish. No request submitted and no customer data changed.
- Local fresh-tab screenshot confirms square-roll illustrative geometry replaces the patty-like version. Mobile-width control interaction retained ropa-vieja selection in Spanish summary. Photorealism is still not claimed.
- GitHub workflow API lookup did not establish a CI run; CI status remains unverified. Full local tests and deployed asset identity are the validation evidence for this release.
