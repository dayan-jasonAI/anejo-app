# Derived audit authority reasons — October3,2026

Observed trigger: supported Chrome Review saved source design on published catering post sp_20fbf4bea6aea85f30bf. Production D1 saved a v14 unavailable audit with assessment_authority_conflict, no score. The published post was not edited. This establishes a contract failure, not which exact raw model claim caused it: provider raw response was not retained.

V15 removes redundant model assessment_reason from provider schema/transport. The model must still explicitly report supported, contradicted or unresolved with selected supplied authority IDs. Code derives reason from unchanged assessment and reference presence. Empty support/contradiction references still reject, all source IDs resolve independently, and model reasons/extraneous claim fields reject. Unresolved assessments always remain unresolved; supported claims cannot upgrade aggregate unknown or violated. Older reviews become historical via rubric version. No fabricated evidence, automatic pass, publication/trust switch, new API call or changed customer content.

Validation:50 focused actual provider/validator tests pass;3,434 root tests pass;lint exits0 with existing warnings;git diff check clean. Independent read-only reviewer reports no material bug,33 modified-file tests and20-case probe; root separately reviewed diff and ran50focused/full suite. Evidence is fixture/contract-level only; semantic and live acceptance remain unverified until release and current source review.

Direct-session authority covers continuing tested gated releases. No customer communications, public posting, payment or credential changes. Next: exact-head release checks/deployment, one supported-browser source review, persistence/readback and explanation inspection. Broader goal remains open.

## Release and live readback

PR186 passed all four release checks at head8ebd6e37cbc572b2a30b1a1f7dc363d99ab3f72c and merged as f4b38a0b06168db1d86ba73b52eb0250570be159. Provider production inventory lists b63143cf-0103-4751-889c-dd3f623c88c5 active for source f4b38a0. Initial browser attempt still saved v14; this is not v15 acceptance. After page refresh, the observed normal UI request returned HTTP200 with v15, and separate production D1 readback confirmed the same timestamp, published status and saved review. Evidence files here include both observed browser response and D1 readback.

The v15 contract is live-verified for this one catering source review: all seven criteria and explicit claims returned, no transport diagnostic. Semantic acceptance FAILED: product_fidelity remains unknown, partly because the model treats “Grazing skewers” as requiring exact pictured ingredients/SKU, despite no such written exact-assortment promise. The code preserves that unknown; no automatic pass, published edit, trust activation or customer communication occurred. This is not proof of reliable future judgments or all-three-carousel acceptance.

Next: separate written product-name/ingredient assertions from image-only ingredient guesses with a reusable contract and meaningful negative tests. A read-only architecture review is assigned; root must inspect its evidence before implementing. Broader renderer, integrated-team, Ana/voice, role/checkout and external-provider acceptance remain open.
