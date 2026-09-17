# Marketing recovery and photo drop-off — September 17, 2026

Authority: Dayan asked to prioritize social marketing, make generating/scheduling easier, and create a designated photo drop-off accessible to marketing and Hub. Existing guarded-deployment authority persists. Public posts require rendered preview review before final approval. No credentials, customer messages or public posts changed in this work.

Observed supported-browser state: @anejo.catering.co connected, 76 followers, 9 posts; Hub activity reports41 days since last publication. Old drafts include governance flags and August proposed dates. Recorded token expiry September20 is a configured date, not an independently verified Meta expiry. Public Instagram shows /go in bio. Existing metrics and zero attributed orders do not establish actual sales or unique visitors.

Implemented private Photos/Fotos folder in Marketing, shared by owner and marketing role. Uses existing R2 with a restricted marketing-library/ namespace, not Google Drive sync or a public folder. Original JPEG/PNG/WebP <=5MB preserved; name,event/folder,tags stored; bounded paginated listing. HEIC/videos are not yet supported. PNG/WebP can generate separate JPEG copies for Instagram. Search explicitly covers loaded photos only. Employee desk links directly to Photos. Photo selection opens unsaved composer; caption preview generation uses current brand/menu context and existing metered AI budget without executing actions. Saving/scheduling remain explicit.

Repaired atomic creation of post+first slide, invalid/past scheduled dates, and silent scheduler query failure (now503, no unknown work processed). Stale publishing-state recovery not changed; automatic retry can duplicate external posts and needs receipt reconciliation.

Prepared3 original-event campaign previews in drafts.json and preview.html. These are not scheduled/published. Personalized birthday tags visible in original photos require Dayan's review/permission; captions do not name or tag people. Suggested times are not claimed to be optimized from metrics. No synthetic event imagery.

Validation before final search control:2522 root tests passed, lint0errors/4existingwarnings, Pages Functions build and ancestry guard passed. New search control passed its focused test; all451UI tests passed. Logs /tmp/anejo-marketing-*. Final release/browser evidence appended below.

## Final evidence — September 17

Current local validation: `npm test --silent` passed 2,525 tests, zero failures/skips (10.363 seconds). Full output: `validation.log` beside this file. Previous lint: zero errors and four existing warnings; Pages Functions build passed. No Studio source changed. Local responsive Photos fixture was inspected at mobile width; it uses mocked listing data, so it is not proof of deployed storage. Final UI corrections preserve private JPEG copies and hide inactive controls/native duplicate chooser.

Release is blocked, not deployed. `git push origin codex/kitchen-ready-notifications` returned `fatal: could not read Username for 'https://github.com': Device not configured`. PR creation returned `HTTP 401: Requires authentication (https://api.github.com/graphql)`. `gh auth status` reported the default dayan-jasonAI token invalid. Dayan must restore normal GitHub login; no credentials or deployment settings were changed, and no deployment bypass was attempted. After login: push, create PR, pass existing CI/release guard, deploy under prior authorization, then verify live Photos upload/list/selection for owner and marketing roles. Provider caption generation remains locally mocked, not live-verified.

While release was blocked, three actual photo posts were saved through the supported live Hub browser interface. Reloaded Hub readback showed all three as BORRADOR / Sin programar, one image each:
- Gather: `sp_20fbf4bea6aea85f30bf`, media `studio/2026-09/up_de2cbf5fb142c5bef326.jpg`.
- Personal: `sp_58424887f40e1a1b611f`, media `studio/2026-09/up_117a7d2fe0dacd0ce5f3.jpg`.
- Choice: `sp_0a39246ba48d6453af3f`, media `studio/2026-09/up_31c59c5882c456d5f7bc.jpg`.

These drafts are unscheduled and unscored. No public posting, customer replies, credentials, payment or old drafts changed. Existing Hub incorrectly labels missing provenance on new manual drafts as predating tracking; remains open. Rendered review is `preview.html`, also open at http://127.0.0.1:8766/preview.html. Approval required for the exact three images/captions, including visible personalized birthday tags, before scheduling. Proposed dates must be rechecked against actual approval time. Recorded Instagram expiry is September 20; renewal remains a user credential handoff. No paid orders can be attributed to unpublished drafts.

## Authorized release continuation

Dayan restored GitHub login through the normal device flow and explicitly asked to finish deployment and continue marketing system improvements. PR102 created. Before merge, review found scheduled media_type loss, unsaved caption/approval drift and arbitrary operational-media token exposure. Repaired scheduled Reel/Story dispatch, public token namespace restrictions, draft/attach namespace validation, atomic caption+schedule/publication claims, stale caption conflict rejection, and publishing-state edit protection. Editing a scheduled caption returns it to draft for fresh approval. Corrected the inaccurate manual-draft provenance message.

Today now starts with one next-post action and timestamped connection status; detailed reports remain expandable. Saved schedules are not presented as delivered posts. Photo chooser has one keyboard-accessible button. Final local suite: 2,536 passed, zero failed/skipped; lint zero errors/four existing warnings; worker build passed; ancestry guard passed. Evidence: release-validation.log. Public campaigns remain unscheduled pending rendered-preview approval. No provider publish call was used to test these repairs.
