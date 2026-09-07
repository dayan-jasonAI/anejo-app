# Cajita occasion image correction

Date: 2026-09-07. Owner: Codex. Direct-session authorization: Dayan asked to correct every clickable occasion/image pairing on the live Cajita page. Scope is gallery behavior only, not the draft 3D builder or homepage redesign.

## Observed evidence

- Live Christmas button changed its title immediately while the image was still loading (`complete:false`, `naturalWidth:0`); the correct Christmas image subsequently loaded at width 1448. Permanent failure was not reproduced.
- All eight source mappings point to unique existing 1448×1086 JPEG files. Christmas, Valentine's, Easter, Patriotic and Custom imagery was visually inspected and has the respective theme. Existing artwork was retained, not regenerated.
- Prior code had no load/decode completion, error/retry, or stale-request protection. Slow or failed loading could leave metadata ahead of the displayed image. This is the observed interaction gap; the user's exact device/network failure remains unknown.

## Changes

- `public/assets/js/cajita-gallery-v3.js`: loads and decodes an image before committing image, caption and selected state together. Last tap wins; stale callbacks cannot overwrite it. Adds loading feedback, 15-second timeout, retry, next-image preloading, visibility-aware sequential autoplay and reduced-motion behavior.
- `public/cajita.html`: initializes the versioned gallery script with all eight existing mappings.
- `test/ui/cajita-gallery.test.js`: five portable Node/VM tests covering assets, atomic changes, rapid taps, failure/retry and reduced motion.
- Release worktree `/tmp/anejo-gallery-fix` starts from production `688d08d`. The 3D configurator branch is excluded. No APIs, data, forms, notifications, payment configuration, secrets, or image files changed.

## Validation before release

- Full `npm test --silent`: 1773 passed, 0 failed.
- `npm run lint`: exit 0.
- `npx wrangler pages functions build --outfile=/tmp/anejo-gallery-functions.js`: compiled successfully.
- `git diff --check`: exit 0.
- Browser desktop and 390×844 mobile: clicked Añejo, Gender Reveal, Halloween, Christmas, Valentine's, Easter, Patriotic, Custom. Each had its matching URL/title/selected button and loaded width 1448. Mobile document had no horizontal overflow. Previous/Next returned the matching Custom slide. No gallery console errors observed.

## Release and remaining risk

Production publication and post-release browser checks are pending at this record's creation. Network/image failures remain possible but are now explicit and retryable. Existing generated artwork and its branding fidelity are not newly certified by this functional repair. No new approvals or purchases needed. Rollback: revert this scoped commit, keeping all unrelated application work intact.

While the audit ran, the main agent implemented and browser-tested the gallery; the delegated test harness was reviewed and corrected for portable paths and isolated mock state. Next action: publish this isolated correction, then repeat all eight live selections.
