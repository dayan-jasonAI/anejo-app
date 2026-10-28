# Public English / Spanish coverage audit

**Source snapshot:** `codex/public-spanish-coverage` at main base `4d15ab35`  
**Audit date:** 2026-10-27  
**State:** Local source preparation and static verification only. No deployment or live browser verification is included.

## What changed

- Added a curated EN→ES dictionary for public pages, forms, customer status copy, product and brand content, and faithful translations of existing legal, privacy, refund, and SMS terms in `public/assets/js/public-i18n-coverage.js`.
- Preserved six Spanish-source variants through inverse-only aliases. The module calls `AnejoI18n.extendAliases()` when available and otherwise stages `window.__anejoI18nAliases`; the root-owned shared engine must consume that contract before the aliases work in the browser.
- Corrected the Spanish meal-prep logo image alt text to `Emblema de Añejo` on the keto, paleo, and high-protein source pages.
- Added a static HTML audit and route/source evidence report. The scanner now respects quoted HTML attributes so inline SVG fallback markup does not become bogus text.

## Static evidence

- Repository inventory: 298 HTML routes total; 221 are public outside `/hub/**`; 77 Hub routes are excluded from this task.
- Of the 221 public routes, 13 currently include the shared `i18n.js` source and 208 do not. Root owns universal loading and route integration.
- 89 public routes have an authored Spanish companion file. This indicates available source content, not an interactive language selector.
- The static scan found 11,161 visible text and accessible-attribute occurrences on public non-Hub pages. It excludes script/style/SVG contents and does not inspect runtime-created JavaScript strings.
- The merged source dictionaries contain 2,575 English keys and 2,534 distinct Spanish values; six additional inverse-only aliases cover authored Spanish variants. The source audit currently reports zero unmatched static literals after those aliases are included.
- 91 English/Spanish route pairs were found: 77 had fully aligned static node paths and 14 had partial alignment. The audit preserves 649 distinct source-pair candidates and 2,756 aligned occurrences with source routes and DOM paths. Positional/path correspondence proves where strings were taken from; it does not independently prove translation quality.
- Five existing-dictionary/source conflicts and five duplicate-source translation variants remain explicitly listed in `public-spanish-coverage-route-audit.json`. They include “Skip to content” (`Ir al contenido` / `Saltar al contenido`), “Request a quote” (`Solicitar cotización` / `Solicita cotización`), the language-selector label “English” paired with “← Back to site”, and alternate meal-prep/logo text. Root should review these before any release.

## Catalog and dynamic content boundary

The local catalog snapshots contain 206 and 79 products, respectively, with Spanish name and description fields present. Source inspection confirms `functions/_lib/menu.js` exposes `name_es` and `desc_es`, and `public/order.html` reads those fields. This does not establish current production D1 contents or runtime behavior. `order.html`, `subscribe.html`, and other page scripts render dynamic text outside this static HTML scan; those need a separate string inventory and browser review.

The `studio` React route and separate `/trainer` surface each have a route entry but are outside this static HTML dictionary audit. Hub pages are excluded by request; their localization audit is separate.

## Validation and approval state

- `node scripts/audit-public-spanish-coverage.mjs --write` regenerated the route and text evidence report.
- `node --test test/ui/public-spanish-coverage.test.js`: 6 passed, 0 failed.
- No local browser screenshots, deployed changes, production catalog reads, or live language-switch checks were performed.
- The dictionary is locally prepared and test-validated. Spanish copy, especially legal copy, still needs bilingual review before release. No public publishing or deployment occurred.
