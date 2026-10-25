# Recipe standards and owner authority — 2026-10-25

## Scope and approval state

Local implementation on `codex/catering-unified-operations`. No production migration, recipe approval, credential change, purchase, publication or client message was performed by the recipe implementation agent. Deployment and live verification remain separate release steps.

The private fresh catalog audit is outside this public repository at `Aether/anejo-deliverables/recipe-authority-2026-10-25/FRESH_RECIPE_MATRIX.{md,csv,json}`. The observed metadata timestamp is `2026-10-25T21:55:16.267Z`: 243 catalog SKUs, 215 active; 46 recipe records (36 published, 7 draft, 3 archived). The conservative initial classification is 0 version-confirmed SKU mappings, 35 unconfirmed references and 208 missing mappings. These are SKUs, including flavors/sizes/combinations, not 243 distinct dishes. No statement is made that legacy recipes were never verbally approved. A `published` flag alone is not an exact owner receipt.

Raw recipe metadata stays private: legacy records can contain proprietary recipe text in malformed name fields. No raw recipe contents, staff/customer records or secret formulas are included here.

## Workflow and controls

- `/hub/kitchen/recipes.html`: current coverage matrix, source references, staff authoring, owner review. Accessible through Kitchen More, owner Kitchen, Library, Creative Studio and deterministic owner operator command `recipe standards` / `recetas`.
- Staff may save partial drafts and submit them. Required approval facts include batch yield, cooked serving portion, numeric ingredient amounts and units/basis, ordered procedure, equipment, preparation/cook timing, cooking/doneness verification, holding, cooling/reheating, storage, shelf life, allergens, packaging/plating, internal photos, and source evidence. Unknowns stay explicitly open; no food safety values or proprietary details are invented.
- Optional internal training media and exact inventory links are preserved. Exact catalog SKU mappings include an explicit number of recipe portions per sale unit. Pack factors and ingredient conversions are not guessed.
- Drafts are immutable revisions. Saving requires the latest revision ID. Only Dayan’s owner role can approve the current submitted saved hash after reviewing the rendered preview and verifying the source. A new proposal never replaces the operational recipe until approval.
- Approval transaction updates the canonical recipe, authority pointer, exact menu links and versioned kitchen library projection. Approval fails if required facts, hash, source attestation, latest version, linked inventory or master baseline are invalid. No approvals are backfilled.
- Legacy published documents remain readable as unconfirmed references. Authenticated owner/kitchen document reads include current authority and full approved training spec. Public/client/marketing endpoints do not expose recipe bodies.
- Old `/recipe/publish` submits for review only. Old `/recipe/draft` saves a revision only. Studio wording and generated bundles match those semantics.
- Private Studio/owner operator context includes full recipe specifications only for exact current owner-approved matches. Missing/unconfirmed matches never become cookable recipes or purchase quantities.
- Production policies and tasks pin `recipe_version_id` (migration0163). Policy approval, batch admission, start and completion require exact current authority. Mutation SQL rechecks that authority. Legacy policies remain visible but yield no authoritative suggested quantity; no retrospective owner approval is invented.
- Photo storage failures are reported as unsaved. Form controls lock during requests; in-page navigation confirms before discarding edits. Approval waits for the saved preview photos to decode and requires two owner attestations.

## Contracts

`functions/_lib/recipe_authority.js` exports:

- `getApprovedRecipeAuthority(env,{menuItemId,recipeId})`: null when no valid exact current receipt; database errors propagate. Returns recipe/version IDs, owner receipt, master baseline timestamp, structured `recipe` and explicit `portions_per_sale_unit` for catalog lookups.
- `getApprovedRecipeAuthorities(env,menuIds)`: exact ID map for event planning; no fuzzy purchase authority.
- `recipeAuthorityMatrix`, `recipeRevisionView`: private staff projections, not approval evidence by themselves.
- `readRecipeKnowledge`, `buildRecipeKnowledgeContext`: bounded read-only private context with omitted/unavailable evidence explicit.

`/api/hub/kitchen/recipes` GET lists coverage or `?id=RECIPE_ID` loads one revision. POST supports `create`, `save`, `submit`, `approve`, `photo`. Owner approval requires exact `revision_id`, `content_hash`, `owner_reviewed:true`, `source_verified:true`. No API accepts a caller-provided role as authority.

## Validation evidence

- `node --no-warnings --test test/money/recipe-authority.test.js`: real SQLite with every migration; draft isolation, owner/source/hash gate, canonical/library projection, stale master/version, unit mapping, integrity failure, transactional rollback, legacy submission semantics, private role gates, photo failure and model-context exclusion.
- `test/money/inventory-production.test.js`: exact recipe receipt prerequisite, blocked legacy policy visibility, admission race, reservations/start/consumption/yield and changed-recipe safeguards. Existing fixtures now create real synthetic owner receipts rather than assume publication means approval.
- Existing Studio/kitchen-link regressions and owner operator/navigation regressions were rerun; see the parent release log for final combined-suite counts after all agents stop editing.
- `NODE_PATH=<bundled dependencies> CATERING_BROWSER_CHANNEL=chrome node scripts/verify-recipe-authority-ui.cjs`: isolated Chrome, real SQLite recipe API, production CSP, 390px/1440px. Staff partial draft → complete draft → submit leaves master unchanged; owner saved-version review → approval persists exact 25-portions test SKU factor. Screenshots and JSON evidence: `/tmp/recipe-authority-ui-evidence/`. No production writes, external messages or provider payments.
- `npm run build:studio`: TypeScript and Vite build. Existing non-module announce.js advisory remains; build exits successfully.

## Remaining operational facts

Dayan/kitchen must supply or confirm real recipe details, yields, safety guidance, photos and exact catalog links before recipe approval. Conflicting legacy/program-specific references are not silently reconciled. Existing production plans need explicit review against approved recipe versions. A legacy task already preparing without a version receipt cannot mint finished stock through the new authority gate; any such real task needs an owner-led reconciliation rather than a fabricated backfill. A fresh read-only remote count observed zero production policies and zero queued/preparing/completed tasks (evidence: private PRODUCTION_POLICY_READINESS.json; rows_written 0). Parent should reconfirm if production activity changes before release. Rollback should disable new authoring/production actions and retain additive evidence tables; do not delete owner receipts.
