# Catering final-payment collection

Direct-session authority: Dayan requested collection, branded Hub email, and customer-account workflow repairs on 2026-10-24. Engineering and scoped release are authorized; customer sends and new automated templates require rendered review under the workspace preview rule.

## Behavior

- Owed balance tile scrolls to actionable bookings; request cards distinguish agreed quotes from original inquiry/menu suggestions.
- Collect final balance opens saved payment state, due date and reminder receipts, then stages a branded Resend email. No send or charge occurs on opening/staging.
- Owner review binds recipient, current amount, checkout identity, date, quote version and rendered content. Unknown outcomes remain locked for provider reconciliation; concurrent clicks cannot create repeat sends.
- The scheduled collection runner stages eligible reminders. Automatic sends require a current per-language rendered-template approval. Template changes invalidate the policy. Prior reminder claims/receipts remain authoritative; no retroactive resend is introduced.
- Email customer opens the Hub branded composer, with exact preview, review approval and persistent send receipts projected into Hub messages. It no longer opens the owner's mail application.
- Paid retail/catering purchases create canonical normalized-email customer records without creating sessions, consent, meal plans or reward entitlements. Existing verified-email sign-in remains required.
- Customer accounts expose the customer's own current payment button, recorded payment/reminder activity and existing rewards. Catering point accrual policy is unchanged. This is not a universal refund ledger.

## Release and rollback

Apply only additive migrations 0157, 0158 and 0159 in that order before deploying dependent application code. Do not run the historical pending-migration list wholesale. Preserve account, receipt and draft tables on rollback; roll application source back through the normal guarded release path. No secrets, credentials, price, due-date or payment-provider settings are changed.

## Validation

Local full suite: 3988 passed, 0 failed/skipped on this implementation checkpoint. Root ESLint: 0 errors and 10 pre-existing warnings. Pages Functions bundle compiled. Synthetic browser checks use production CSP at desktop/390px and make no external messages/payments. Owner and customer scripts verify previews, image decoding, duplicate/unknown locks, current booking values, verified-identity-only payment requests, provider failures, settled-state refresh and meal-plan rendering.

Validation commands:
- `npm test`
- `npm run lint`
- `npx wrangler pages functions build --outfile=/tmp/anejo-balance-functions.js`
- `node scripts/verify-catering-balance-ui.cjs`
- `node scripts/verify-catering-client-account.cjs`

Hosted exact-head checks, deployment/source readback and live owner acceptance are separate evidence gates. Their final results belong in the private session release record. No production customer send or payment is established by local tests.
