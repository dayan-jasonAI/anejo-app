# Marketing readiness goal — active

## Direct-session scope
Dayan requests full-frame source imagery, real Añejo emblem, adaptive Reposado editorial treatment, repeatable deterministic design, actual auditor scoring, integrated Team Lead/strategy/intel/analytics/context, Aña across social/chat/Google reviews, and voice-directed Hub operations. Automatic operation must respect trust requirements. Existing exclusions remain: no unapproved public posts, customer sends, charges or credentials. Deployment is authorized after release checks. Success is not defined as guaranteed sales or unprecedented performance.

## Current evidence and next actions
- Previous turn was planning, not implementation progress. This turn inspected clean branch codex/kitchen-ready-notifications at f55534c and began implementation.
- Manual drafts do not call auditDraft. Planner calls it in functions/_lib/automations.js. governance.js judges caption and image_brief, not actual attached image pixels. A score from that function alone must not be sold as full visual verification.
- Caption edit left audit_score/audit_flags/audit_at/audit_status intact. Local repair clears them in the same conditional update that changes caption, returns status to draft and removes schedule. A rejected stale edit preserves both caption and verdict. Test: test/money/social-approval-caption.test.js uses actual SQLite migrations.
- Schedule and direct publish can also change captions; these paths still need verdict invalidation. Attach/detach/reorder and generated-media paths need atomic approval invalidation and concurrency coverage. Do not infer they are fixed by the caption-edit patch.
- Existing marketing.html branding engine already uses /assets/img/emblem.png and /assets/img/logo_full.png, adaptive contrast/busyness placement, Cormorant/Josefin typesetting. Its poster extends square sources to 9:16; review/refactor it for requested full-frame composition instead of maintaining a duplicate one-off renderer.
- No new design generated, live draft altered, audit provider invoked or code deployed in this work stretch. Three previously saved carousels remain revision2; desired full-frame revision remains open.

## Completion evidence required
1. Design: rendered revised 26 frames, emblem/source provenance, legibility and food-preservation review; saved draft order/caption checks after reload.
2. Repeatability: shared renderer/template workflow for existing library images; overflow/contrast/placement checks and readable fallback; accessible owner and marketing-role use.
3. Governance: audit entry point for manual/generated drafts; explicit scope; caption plus actual visual evidence; stale-result rejection; every mutation invalidates review; fail-closed autonomous gate.
4. Orchestration: evidence inventory of Team Lead, strategist, analyst, intel and context consumers; source freshness, task flow and failures; test practical brief-to-reviewed-draft path.
5. Aña: inspect permissions and actual implementations separately for comments, DMs, web chat, Google review replies; draft-first review and escalation; no unauthorized test sends.
6. Voice: inspect Aether/DRH source alignment and current command registry; prove supported permission-checked operations; expose unsupported actions honestly.
7. Automation: category trust approval, budget limits, execution heartbeat, idempotency/recovery and revocation verified; actual public activation only within explicit approval.
8. Measurement: source-backed inquiries/quotes/paid-order attribution; missing data explicitly identified; no reach/revenue claim from tests.
9. Release: required root/Studio checks, build/lint/guard, approved deployment and current live acceptance; local test counts are not production evidence.

## Validation this stretch
Focused caption/draft/scheduled-format regression output: /tmp/anejo-audit-invalidation.log. Full release checks pending. Goal stays active. Next implementation: audit invocation and fingerprinted evidence, mutation safety, and shared full-frame design renderer.

## Saved-draft auditing and approval safety — September17 evening

Implemented owner/marketing-role `audit` operation through existing MARKETING_DESK authorization. New helper functions/_lib/social_audit.js snapshots caption, image brief, media type, legacy media key and ordered media identities/keys/sequence, and conditionally persists the verdict only if all still match. Draft/failed only. Missing provider returns flagged/unavailable, never pass. UI exposes Audit saved draft and explicitly states caption/brief scope and outstanding visual review. Unsaved caption changes block the UI action. This is not yet a pixel-aware audit or automatic scoring for every draft.

Attach/detach now atomically clear audit fields and scheduled approval alongside media mutation. Attach guards publishing and concurrent count changes. Reorder requires the whole distinct set and batches sequence changes with approval invalidation. Inline schedule/publish changes clear verdict fields when caption differs; unchanged captions retain verdict. All of this remains a release candidate, not current production evidence.

New SQLite-backed test suite test/money/social-saved-audit.test.js covers persisted judge output, provider absence, stale text, in-flight caption/media/order/publishing changes, attachment rollback, attach/detach approval invalidation, inline scheduling and reorder validation. Focused run:16 passed including caption approval regressions. Root regression and lint output recorded in audit-validation.log and audit-lint.log after final run. No external provider call, public post, customer communication or deployment during these tests.

Open technical limits: generated-image replacement paths still require mutation review; reorder/detach competing edits need fuller concurrency checks; audit evidence must include actual pixels and source-context versions before autonomy; trust ledger currently counts approval events and needs repeated-approval deduplication. Full-frame shared branding renderer and all broader objective items above remain active. Existing autosync captured source changes as dc2c9ad [skip deploy]; do not mistake this for a release.

Final root suite: 2,587 passed, 0 failed. Two legacy source-shape assertions were updated: stale reorder IDs now reject intentionally, and the publishing claim includes audit assignments. SQLite behavior tests validate these changes. Lint: no errors, four pre-existing warnings; touched-files lint clean. Release/deployment remains pending.

## Full-frame Reposado first implementation — September17 evening

Added full-frame Reposado as the first branding preset in the existing Hub tool. Reuses original image dimensions and draws source edge-to-edge, authentic emblem, adaptive gold/parchment/forest inks, restrained hairline frame, measured edge placement. Headline typesetting now rejects unfit text instead of silently discarding words. Full-frame text block capped to 24% of image height; logo placement avoids wording. This is geometric protection, not semantic food detection.

Normal Chrome local browser rendered three actual website sources: croquetas, Signature Cajita and combined trays/Cajitas. Screenshot inspection confirmed full-frame photos and authentic emblem with readable short headings. The dense combo has little empty space and its corner emblem overlays part of a tray; needs further subject-aware protection before calling placement fully automatic. Native aspect ratios differ (square trays, landscape Signature); final carousel consistency and cropping behavior must be resolved before replacing the live26frames. Existing revision2 drafts remain unchanged.

Review artifact: revision-3/preview.html and renderer-preview.js (extracted from current production renderer, asset paths adjusted for repository-root preview). This is a local design proof, not a deployed feature or final campaign. Browser preview: http://127.0.0.1:8780/docs/marketing/cajita-social-2026-09-17/revision-3/preview.html. No image API calls. 27 focused tests pass, including executed headline-fitting and adaptive-ink cases. Root test log recorded after final run.

Next: eliminate preview copy via shared renderer, include auditable layout/contrast and subject-clearance results, generate consistent revision3 carousels, provide safe in-place branded slide replacement at 10-slide limit, add actual-image audit, then complete release/live checks and broader readiness inventory.

Full-frame candidate root validation: 2,590 passed, 0 failed (revision-3/validation.log). Not deployed; visual refinements and full goal acceptance remain open.

## Shared renderer and safe branded replacement — September17 evening

Extracted the real branding engine into public/hub/owner/assets/marketing-branding.js, loaded by the Hub and revision3 preview. Retired the copied preview implementation (file retained as a notice). Source asset paths resolve relative to the script so repo previews and production load the same authentic emblem. Reopened normal Chrome preview, rendered all three images successfully with the shared module; status explicitly remains review required.

Added replace_media operation: compare expected original media key, restrict editable states and JPEG library/Studio destinations, change only the selected slide reference/token, clear schedule/audit atomically. Original storage object remains intact. Branding acceptance now replaces the selected slide instead of adding an eleventh image. SQLite tests verify ten-slide count/order retention, stale-key rejection, publishing protection, private path rejection and approval invalidation.

Validation:2,593 root tests passed; changed-file lint, renderer syntax and git diff checks passed. revision-3/shared-renderer-validation.log contains root output. No deployment, live draft replacement, provider call or customer send. Dense-photo subject protection, common carousel ratio, final26renders, actual-image auditing, autonomous pipeline and all wider completion requirements remain open. Next: add layout evidence/subject exclusion support, render final campaign, then release with Studio/build/production checks.

## Subject exclusion and team context — September17 evening

Renderer accepts validated normalized protected regions, tries alternate text edge if necessary, excludes protected regions from emblem anchors, and rejects no-room layouts. Default is explicitly center geometry, not semantic food detection. onLayout reports source dimensions, preserved aspect, text/emblem rectangles, chosen ink and protection source; visualReviewRequired remains true. Hub warns to inspect food near edges. Added owner-authorized black contrast fallback when preferred kit ink cannot clear 4.5 and black improves it. Protected areas are an API capability; drawing/persisting semantic regions through owner/library UI remains open.

Delegated read-only capability audit reviewed; TEAM_CAPABILITY_AUDIT.md records files and gaps. Corrected Team Lead catalog filtering to include every non-bowl kind, retaining live availability and descriptions. Intel competitor sweep now loads live brand_source and frames Catering/Traditional/Fit across Palm Beach/Broward, without promising geographic service coverage. Added coverage for Cajita/Traditional/dessert visibility and sold-out state.

Validation:40 team/intel focused tests passed; 2,596 root tests passed before final black fallback; subsequent30 focused branding tests passed. Changed-function/test lint and renderer syntax clean. Combined log revision-3/protection-context-validation.log. No provider calls, live draft changes, public sends or deploy. Broader goal remains active; next is campaign rendering and measured layout review, actual-image governance/autonomy, then release and wider integrations.
