# Ana recovery and office offboarding — October 17, 2026

Owner: Codex, direct-session authorization from Dayan. Branch: codex/office-offboarding, based on main 0c4d999. Background autosync commit 5dfe283 captured partial source; final release must include all tests and evidence.

## Production action

DGP service ended October 7 per Dayan. On October 17 the account acct_dgp was marked terminated, site_dgp_delray and site_dgp_pompano inactive, ordering staff disabled, trusted devices revoked, feedback QR disabled, queued surveys blocked. Two append-only contract_terms_events preserve the effective date and owner instruction. Readback confirms zero eligible DGP reminder sites. There were no existing open contract_site alerts and no orders after October 7. All order, delivery and invoice history remains unchanged. No customer messages or charges were made.

Evidence: ../evidence/office-offboarding-2026-10-17/production-readback.json. Original execution/readback logs: /tmp/anejo-offboard-write.json and /tmp/anejo-offboard-after.json.

## Feature

Adds explicit owner account offboarding with effective date, reason and confirmation. Atomic D1 batch disables service access, closes office alerts and records history; failures roll back. Existing orders/invoices remain and today/future orders produce a review warning. Terminated accounts cannot be accidentally activated by Edit terms, Activate, adding a site/staffer or filing new counts. Cutoff check requires active site and active account. Billing remains available for reconciliation.

## Ana

Supported browser generic Spanish daily-lunch question received a live website reply after credit update. This proves website AI response only. The initial answer incorrectly emphasized Fit bowls. Added shared current daily lunch context from the same validated configuration and availability functions as checkout; correct $10 service and links, no invented availability or private office pricing.

Instagram is NOT verified restored. Current worker reports identity_unavailable, no successful sends. Owner UI displayed missing Facebook Login IG_USER_ID; code investigation found it masked the first Instagram provider rejection. Diagnostic repair retains the real provider failure. Credential changes/renewal require Dayan separately; no secrets changed.

## Validation and release

Focused tests and lint passed; full local suite/release checks and post-deployment supported-browser acceptance pending. Deployment, provider connection and live behavior are separate states. No customer DM/comment/SMS was used as a test.
