# Añejo — Deploy Checklist (2026-06-04)

Pushing `main` auto-deploys the git-connected Pages project **anejo-app** to live **anejocateringco.com**.
This deploy is **sandbox/pre-launch**: no real payments. The go-live flip (real money) is separate and gated on the DBPR license.

## 0. Pre-push gate (all ✓ before pushing)
- [x] All Functions + JS pass `node --check`
- [x] No secrets in the repo (`.dev.vars` gitignored; scanned the diff)
- [x] `wrangler.toml` has the real D1 (`d5ca11c7…`) + KV (`afbedd5c…`) IDs
- [x] `SQUARE_ENV` defaults to sandbox (no real charges)
- [x] Legal pages carry the "draft — pending attorney review" banner

## 1. Cloudflare Pages → anejo-app → Settings → Variables and secrets
Without these, the storefront/subscriptions return 503 ("not configured") but the rest of the site works.

**Secrets (encrypted):**
| Name | Value (sandbox now) |
|---|---|
| `ANTHROPIC_API_KEY` | (already set) — AI calculator + plan generation |
| `SQUARE_ACCESS_TOKEN` | the sandbox access token from `.dev.vars` (rotate at go-live → prod token) |
| `RESEND_API_KEY` | from Resend (⏳ pending Dayan's account) — magic-link login + receipts |
| `SQUARE_WEBHOOK_KEY` | from the Square webhook subscription (step 3) |

**Vars (plaintext):**
| Name | Value |
|---|---|
| `SQUARE_ENV` | `sandbox` |
| `SQUARE_LOCATION_ID` | `L8YZ7SPPJDKGV` (sandbox) |
| `SQUARE_APPLICATION_ID` | `sandbox-sq0idb-eYNC_QdPQOE5wRmcpHcg5w` (sandbox) — used by the subscribe card form |
| `EMAIL_FROM` | `Añejo Catering Co. <noreply@anejocateringco.com>` |
| `APP_BASE_URL` | `https://anejocateringco.com` |
| `SALES_TAX_PCT` | `7.0` (confirm exact PBC rate after FL DOR registration) |
| `LEADS_NOTIFY_TO` | `dayan@anejocateringco.com` (where tasting/wholesale leads are emailed) |
| `SQUARE_WEBHOOK_URL` | `https://anejocateringco.com/api/webhooks/square` (must match Square's configured URL for signature checks) |

## 2. Confirm bindings (Settings → Functions → Bindings)
- `DB` → D1 `anejo`  ·  `SESSIONS` → KV. These come from `wrangler.toml`; verify they show in the dashboard after the first deploy. Smoke-test `/api/leads` (writes D1) + `/api/me`.

## 3. Square webhook (sandbox first)
Square Developer dashboard → your app → **Webhooks → Add subscription**:
- Notification URL: `https://anejocateringco.com/api/webhooks/square`
- Events: `subscription.created`, `subscription.updated`, `invoice.payment_made`
- Copy the **Signature key** → set `SQUARE_WEBHOOK_KEY`.

## 4. Subscription plans in production (at go-live only)
The 3 plan variation IDs in `functions/_lib/plans.js` are **sandbox**. When flipping to production, recreate the plans in the prod Square catalog and override per-tier:
`SQUARE_PLAN_5_VAR`, `SQUARE_PLAN_10_VAR`, `SQUARE_PLAN_12_VAR` = the prod variation IDs.

## 5. Post-deploy smoke tests (against anejocateringco.com)
- `/`, `/order`, `/subscribe`, `/trainer/dashboard` (sign-in gate), `/legal/{terms,privacy,refund}`, `/robots.txt`, `/sitemap.xml` → 200
- Security headers present (CSP, HSTS, X-Frame-Options) — and the **Square card form renders** under CSP on `/subscribe`
- `POST /api/leads` → `{"ok":true}`  ·  `/api/square-config` → returns IDs
- À-la-carte: add to cart → checkout → Square sandbox hosted page → test card `4111 1111 1111 1111`
- Subscribe: `/subscribe?client=…&plan=plan_10` → test card → subscription + rev-share row

## 6. 🚩 Go-live flip (separate — only when DBPR license is in hand)
Set `SQUARE_ENV=production`; swap `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_APPLICATION_ID` to production; do steps 3–4 against prod; flip storefront copy from pre-launch to live; remove sandbox test banners.
