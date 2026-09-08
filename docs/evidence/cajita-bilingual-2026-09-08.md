# Añejo new-feature bilingual release — 2026-09-08

Owner: Codex, with reviewed bounded builder, public-page and Hub localization work.
Approval: Dayan, direct session. Prior instruction to publish everything, followed by current instruction to make all new changes follow the main website English/Spanish rule. Scope: localization of the already-authorized website release. No database, secrets, DNS, payments, cron, or email delivery configuration changes.

## Changes and outputs

- Shared language engine: safe saved preference, whitespace-normalized curated lookup, runtime text/attribute updates, stable option values, local-only translation boundary.
- Public homepage additions, Cajita gallery, catering page and builder: curated English/Spanish copy, image descriptions, accessible controls, themes, errors and receipts. New script versions invalidate older cached assets.
- Builder: food/preset/color controls, live counts, summaries, file controls, dialogs and native validation. Document language events update text without resetting input nodes or designs. Customer names, notes, filenames, artwork text and canonical food/theme values remain unchanged.
- Forms capture the selected language when a new request is created. Ambiguous retries keep the original serialized request and ID even after a language change.
- Kitchen and management request views: deterministic bilingual structured configuration summaries, including omissions, ingredient totals and artwork positions. Original customer request content remains literal and excluded from automatic translation.
- Real Google review quotes retain original wording; surrounding headings and links translate.

Source: public/assets/js/{i18n,catering-i18n,cajita-builder,cajita-gallery-v3,cajita-hero}.js, public/{index,catering,cajita,cajita-builder}.html, src/cajita/{builder,i18n}.js, public/hub/assets/catering-i18n.js and owner/kitchen catering pages/navigation.

## Validation

- npm run build:cajita: passed; compiled tracked browser bundle.
- npm run lint: passed.
- npm test --silent: 1,850 passed, zero failed; log /tmp/anejo-bilingual-tests.log.
- npx wrangler pages functions build --outfile=/tmp/anejo-bilingual-worker.js: compiled successfully.
- git diff --check: passed.
- node scripts/predeploy-guard.mjs: branch up to date with origin/main.
- New tests cover shared engine, full static copy/accessible attribute coverage on all three new pages, every gallery theme, actual gallery state changes/failures, native validation, document language-event delivery, builder immutable retries, and bilingual Hub rendering. Actual SQLite request test confirms source_lang=es and exact customer notes/canonical menu values survive storage.
- Browser: English → Spanish → English builder controls and form; 20 boxes, added skewer, mixed-language custom version name and notes remain exact. Christmas selection maps to Navidad with the same design. All three design tabs inspected in Spanish.
- Browser: catering form name and selected birthday value survive language change; canonical value stays Birthday party while visible Spanish label is Fiesta de cumpleaños.
- Browser: gallery Navidad corresponds to loaded christmas-duo-v2.jpg, with Spanish title/alt and pause state.
- Mobile 390 × 844: Spanish homepage and builder have document width 390 (no horizontal overflow); visual layout inspected; missing-name validation reads Completa este campo obligatorio. Temporary viewport restored.
- No test request sent to production in this localization turn. Notification delivery was proven in the preceding release record; not newly re-proven here.

## Boundaries and rollback

This release localizes new features; it is not a full audit of older juice/calculator/legal pages. Customer-authored text, brand names and original reviews intentionally do not translate. Date/time picker internals follow the browser/OS. Photorealistic food models and enabled AI previews remain outside this release and are not represented as finished.

Authenticated production Hub rendering is not newly verified in this turn; deterministic renderer tests cover the changed UI without accessing real customer records. Roll back code through a reviewed revert on main if needed. Do not revert databases or customer requests to roll back language changes.

## Publication

Published by normal fast-forward Git push to main as commit 3007c6e, preserving all existing deployment settings. Cloudflare Pages production deployment: 2d52d595-a85c-4f26-8b60-c6495718d128, main source 3007c6e, Active.

- CI run 34250574354 completed successfully: https://github.com/dayan-jasonAI/anejo-app/actions/runs/34250574354.
- Live /, /catering, /cajita, /cajita-builder, /hub/kitchen/catering and /hub/owner/catering returned 200 and load the new dictionary. These are public shell checks, not authenticated request rendering.
- Served shared/public/gallery/Hub dictionaries match local SHA256. The builder's actual versioned URL /assets/js/cajita-builder.js?v=20260908-bilingual matches the tested bundle (e985a82b0c7044771ab705e4387d0b61f92f2eb2b58de7d78b8ec13582a1778f).
- An initial unversioned bundle read returned a stale cached copy and a first Hub dictionary read returned 404 during propagation. Subsequent Hub read returned 200 with exact matching hash; the versioned builder URL used by the HTML returned the correct matching bundle. No configuration changes or cache purge were needed.
- Live browser verified EN→ES controls, all seven food names, localized summary and quote button. Navigation from builder to /catering retained es and rendered Lleva Añejo a tu mesa. and Enviar solicitud de cotización. No production request was submitted.

No further approval is needed for this language release. Remaining feature limitations are unchanged from the preceding release. Next useful step is customer-side review of the Spanish wording; any requested wording refinement can use the same curated dictionaries.
