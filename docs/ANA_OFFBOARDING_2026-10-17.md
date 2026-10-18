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

All 3,754 local tests passed; deployment guard passed; lint had zero errors and ten existing warnings; Pages Functions compiled. PR #210 hosted checks passed and merged as 1e26ae4af2de36a65cdbcc08f9c31d40d445f723. Cloudflare production deployment ed6e8d83-5ca3-45ac-af98-8c721072084e reported success. Supported browser confirms the new offboarded account panel, disabled ordering links for both offices and a successful $10 daily-lunch answer. Deployment, provider connection and live behavior are separate states. No customer DM/comment/SMS was used as a test.


## Live follow-up evidence

The real Instagram provider rejection is now visible: "Session has expired on Monday, 28-Sep-26 13:39:37 PDT." Instagram remains blocked on renewing its existing connection. Meta for Developers was opened using the documented existing app ID; sign-in is pending. No tokens or credentials changed.

A separate production read found zero daily-lunch schedule dates on or after October 17 (configuration version 3, nine historical dates). Ana correctly avoided promising an unscheduled lunch. Publishing future meal dates requires actual menu/date confirmation, not an invented recurrence.

Live screenshots: ../evidence/office-offboarding-2026-10-17/live-offboarded.png and live-ana-daily-lunch.png. Local test log: /tmp/anejo-offboarding-predeploy-final.log. Current release receipt: ../evidence/office-offboarding-2026-10-17/release.json.
