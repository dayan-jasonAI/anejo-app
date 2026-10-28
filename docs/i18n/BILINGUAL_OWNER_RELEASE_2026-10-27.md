# Añejo bilingual owner operations — release record

Owner: Codex. Authorization: Dayan's direct-session request on October 27, 2026 to make all Añejo/Hub pages switch English/Spanish and train Arianne to run daily operations. This authorizes engineering/localization and the tested release; it does not approve social content, client sends, financial changes, or account impersonation.

## Requirements and implementation

| Requirement | Implementation | Evidence boundary |
| --- | --- | --- |
| Language available on every site page | Top-level HTML middleware injects an idempotent first-party engine, including older public/Hub/Studio routes | Source inventory 298 HTML files; live middleware behavior requires deployed checks |
| Changing screen content translates | Active mutation observer, coalesced updates, text/placeholder/tooltip/alt/aria/submit labels, anchored variable templates, native dialog copy | Real isolated Chrome fixture; not a claim that every possible business-data permutation was exercised |
| English/Spanish reversibility | Original text/value preservation; Spanish-source inverse aliases; language-link persistence; Studio shared-language event bridge | Synthetic round trips and submitted option identity checks |
| Arianne starts in Spanish | Existing account preference remains es; first visit seeds authenticated staff.lang only when no device choice exists | Synthetic first-visit and manual-English preference checks; no PIN/account impersonation |
| All owner learning in Spanish | 37 owner lessons, 32 displayed mockups and notes localized; current operating guide expanded | Every lesson rendered in each language without recording completion |
| Structure on every work area | 48 explicit bilingual contextual playbooks, seven daily routines, daily sales follow-up block | Authenticated owner role before contextual help; no cached-role access grants |
| Phone usability | Progressive disclosure, retained open/search/form state, touch controls; Studio mobile overflow and duplicate-toggle repair | 375px and desktop isolated browser proof |
| Preserve business facts and private originals | No price/quantity/payment/ISO-key changes; user text/editable drafts/source review quotes protected; no internal unknown text sent to translation API | No sends, payments, production-data writes or training-completion records by these tests |

## Validation and limitations

See the sibling deliverable evidence folder `Aether/anejo-deliverables/bilingual-owner-release-2026-10-27/` for exact commands, results, source/deployment identifiers, browser route matrix and live screenshots. Test fixtures use synthetic records, not Arianne's credentials. The original-language content of customer messages, uploaded documents and immutable customer-approved quote/caption text is preserved; these records must not be silently rewritten by a UI switch. Browser/operating-system and Square-owned checkout controls remain provider interfaces.

The source audits distinguish static coverage from runtime and semantic review. Static public copy was checked across 221 routes; the Hub/Studio browser harness loads 78 routes in English and Spanish, and separately renders 37 owner scenes. Unsupported fixture states are not production defects or proof of production business outcomes. New feature copy must include both languages and pass these coverage checks. A strict AST guard checks 675 authored DOM/dialog variants across 110 Hub files with no baseline waiver; browser checks cover rendered HTML separately. Native warning templates preserve distinct amounts and the exact spacing/newlines of reviewed message bodies. The root TypeScript dev dependency makes Studio source scanning reproducible in CI without relying on an untracked nested installation. Shared translation assets revalidate online, and the universal head bootstrap removes legacy duplicate tags so a cached phone cannot replace the new engine.

## Release and rollback

Release only after focused browser checks, full tests, lint, Studio build and Pages Functions build pass. Use the repository's guarded deployment path and verify the returned production deployment plus ordinary live navigation. Record the final result in the evidence folder. Rollback uses the preceding production deployment, not a stale checkout. Deployment status is separate from Arianne completing a real operating shift.

## Other work

The Instagram campaign remains private and requires finished creative review. No campaign scheduling/publication, customer outreach, purchases, token updates or database changes are included in this release.
