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

## PR102 live acceptance

PR102 merged as d31d2ab after Functions/Studio/Pages CI passed on332e63d. Normal main-push release active Production/main deploymentc9b5afda-9e70-4cd6-a701-c2050af79bd0. Evidence production-release-102.json. Public verify:live passed with live DB checks explicitly skipped (public-live-check.log).

Supported live browser: Photos tab loaded; uploaded the three original JPEG event photos with event label Pink first-birthday catering. UI reported3saved, reload retained3rendered photos. Search spread narrowed to1 of3. Create post selected the original catering-spread image in composer, with visible preview and empty caption/schedule. No duplicate social post saved. Existing three campaign drafts remain unchanged and unscheduled.

Caption helper live test: first request produced generic no-preview failure, cause Unverified. One diagnostic retry returned HTTP200 and a bilingual caption with catering CTA. It named dishes not supplied in event notes; that output was not adopted/saved/published. Prompt tightened in follow-up so actual-event dishes must be explicitly present in owner notes and at most five hashtags. AI factual review remains required; model output is not proof of what was served.

Natural scheduler observation (no manual tick): installed anejo-cron every-minute invocation returned social-tick HTTP200, checked0,published[],failed[],missed[]. Sanitized evidence natural-scheduler-observation.json. This is an observed successful invocation, not future uptime or post-delivery proof. Follow-up adds durable heartbeat to avoid invisible staleness.

## Follow-up release candidate

Queue filters preserve unsaved captions, Today deep-links to the specific relevant post after load, and advanced creative tools are collapsed together. Durable scheduler health records authenticated starts/completions, source, last success, generic failure, counts; no post text or secrets. A five-minute stale threshold distinguishes missing evidence. Owner-triggered checks cannot imply automatic executor health. No cron Worker change required; existing natural calls populate the Pages endpoint record.

Validation:2,546root tests passed,0failed/skipped; lint0errors/4existingwarnings; worker build and ancestryguard passed. followup-validation.log preserves output. Operating guide HOW_TO_USE.md created. Rendered-preview approval question is pending; elapsed time is not approval. No campaign scheduled or published.

Final follow-up correction: a draft planner timestamp is now labeled suggested/not scheduled; only approved scheduled status claims a schedule.2,547root tests pass after this regression. Uploaded four remaining original event JPEGs through live Photos UI; readback7of7found by birthday search. Full camera archive still not supplied.

## Final live release and acceptance

PR103 merged as a1fa4cf after all three checks passed onad01f26 (Functions62seconds,Studio17seconds,Pagespass). Active production deploymenta48b7b31-3bc4-4f2f-9c67-8a5f27b938db; provider record production-release-103.json. Final public smoke checks passed with liveDB skipped, not counted as acceptance (final-public-live-check.log).

Authenticated owner Today readback at2026-09-17 04:20:33Eastern:11drafts in latest18posts, Instagram connected@anejo.catering.co, recordedexpirySeptember20, automatic publisher recent completion and lastsuccess04:20:33,counts0/0/0/0. This came from a natural cron heartbeat after release, not a manually triggered run.

Today Review drafts navigated to exactsp_0a39246ba48d6453af3f, focused that card after loading, and showed11drafts/18loaded. Live filter showed7/18; switching back preserved an unsaved newline in caption, then exact original textarea value restored without Save. No server caption mutation or scheduling. Advanced tools collapsed. Draft proposed dates now explicitly say not scheduled.

Photos final collection contains7originals. Caption provider retry success was observed before finalprompttightening; no claim that prompt instructions guarantee factual output. A390px emulation reporteddocumentclientWidth=scrollWidth=390(nohorizontaloverflow), but screenshot scaling was unreliable; real-device visual acceptance remains Unverified. All viewport/networkdiagnostic overrides cleared.

Approval state: code deployment authorized directly; exact three public campaigns still await Dayan's rendered-preview approval. User credential renewal needed before recordedInstagramexpiry. No new ads, purchases, customer sends or public posts. Full digital marketing system and actual brand/sales growth remain Open — evidence missing. LAUNCH_BOARD.md lists boundaries and nextacceptance; HOW_TO_USE.md explains the workingflow. GitHubauthblock resolved, this supersedes earlier blockeddeployment status.

## Shared picker and conservative photo polish — 2026-09-17

Direct session authorization: Dayan requested library access from Today/Create/existing drafts and real-photo enhancement; standing deployment authorization applies after checks. No public post approval, customer communications, credentials or new paid plan authorized.

Implementation: reusable private library picker; context-preserving composer selection and draft attachments; local JPEG uploads saved to shared R2 library; three reference-based polish presets, original retention, derivative provenance and explicit comparison gate. Fixes post-type caption loss and mismatched generated-image preview. Re-enhancing derivatives is blocked. No text-only fallback. Original and AI copy are separate, with review required; fidelity is not guaranteed by prompts.

Local evidence: /tmp/anejo-picker-release-tests.log 2,562/2,562 pass before four additional composer tests; /tmp/anejo-picker-focused.log 22/22 pass including those composer tests. /tmp/anejo-picker-build.log Functions compiled; lint has four pre-existing warnings, no errors; predeploy guard and diff check passed. Live generation and deployed workflow remain Unverified until production acceptance below.

PR104 merged as f48e5d4; production fd137ce8-8b18-498a-9718-e8598fe50608 Active. CI: 2,566 root tests, 23 Studio tests; all three checks passed. Live composer selected the original catering-spread photo from the shared picker while retaining unsaved caption and suggested datetime. Existing library now includes additional owner-uploaded product photos; no assumption that seven files remain the full collection. Live polish request started. Found cosmetic hidden-button override from shared button CSS; follow-up explicitly hides unavailable Enhance control.

Live AI result saved as marketing-library/2026-09/polished_25eb269c38b957ee81d8_photo.jpg from original_a2d6b6f2ebe7f5a138d3_photo.jpg. Both loaded; Use was disabled until review. Visual comparison showed changed framing and reconstructed scene (1800×1350 source →1024×1024 AI copy). It was NOT selected or approved. Corrective scope: default deterministic photographic polish adjusts original pixels and preserves composition; optional experimental AI retouch remains clearly separated. New library metadata validates original lineage; server does not independently verify client pixel processing. No AI claim of perfect fidelity.

Live Today picker searched and selected a photo directly into Create while retaining unsaved caption/date. Feed→Story retained both values. Existing draft picker opened and cancelled without edits. No production draft attachments were changed in these checks. Public verify:live passed with two optional checks skipped; not a database acceptance claim.

PR105 merged f0eb50a; Cloudflare successful production deployment 9662115e-2fcd-47df-b7f8-6cc91b28e154. Live browser still loaded older unversioned editor scripts/styles after reload, despite current HTML including photographic module. Added explicit version URLs for the seven photo-workflow assets; 28 focused UI tests pass. This is a cache-coherence repair, not a credential or deployment-setting change. Final live photographic acceptance remains pending below.

## Final photo-workflow acceptance — 2026-09-17

PR106 merged 0661366; production a0067036-d5e7-49b7-a8fb-2f2f34c484e8 Active. Current browser loaded versioned photo-polish-2 scripts. Enhance hidden before selection (computed display:none). Default method visibly photographic; Bright generated a labeled copy from the real catering-spread photo. Original and copy both loaded at1800×1350; screenshot inspection showed same composition with modest tonal improvement. Explicit Use selected polished_44ae44a388880d51cb98_photo.jpg into composer; preview matched media key; caption/date empty. Photos→Load more→search bright polish found the persistent labeled copy (27 total loaded). One AI preview remained saved but was not selected or approved. No posts saved, scheduled or published during acceptance.

Evidence: photo-workflow-production-evidence.json, photo-polish-validation.log, photo-workflow-public-check.log. Release checks passed; public verification still skips optional DB checks. Current owner flow accepted; marketing-role actual browser session, actual camera RAW/HEIC intake, complete video flow and public post approval remain open. Search is explicitly loaded-page only. Next user action: use the shared picker, select an original, preview photographic polish, choose the copy, and review the final caption before scheduling. No additional approval needed for these shipped settings; public campaign approval remains separate.

## Revised launch carousels saved — 2026-09-17 19:39 Eastern

Dayan directly requested completion of the three creative revisions. Existing drafts updated in place through supported authenticated Chrome UI. Catering: 10 slides, nine-item website collage followed by its nine images. Cajita: 10 slides, Signature first, seven other website themes, personalization and planning panels. Mixed format: 6 slides with both Cajitas and trays. Existing captions retained in substance with obsolete event-photo claims removed, bilingual city targeting and rotating city/Spanish food hashtags. All 26 previously uploaded library files reused; two obsolete media links detached without deleting source photos.

Evidence: revision-2/hub-draft-verification.json. Fresh page reload confirmed all three exact captions and ordered media arrays; 10/10/6 slides, draft status, empty schedule fields. All 26 local JPEG hashes and sizes match revision-2/validation.json. No application code changes or deployment required. No public posts, customer messages, charges or credential changes. No claim of resulting orders or reach.

Preview server restarted after ERR_EMPTY_RESPONSE. Its cached error-page reload was blocked with `Blocked browser navigation by Browser Use URL policy: data:text/html;charset=utf-8,…`; stopped that browser action. HTTP preview response recorded separately; saved Hub drafts remain available for review. This supersedes earlier incomplete-Hub status. Prior artwork/ZIP exports remain available.

Next action: Dayan reviews the exact three saved carousels and captions in Create & schedule, then approves publication timing. Recorded Instagram expiry September20 still needs owner renewal. Broader marketing-role/checkout/Studio/SEO/GBP and paid-order attribution backlogs remain open. Continued safe work: persistence checks, artifact integrity validation, evidence and launch-board updates.
