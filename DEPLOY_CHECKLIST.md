# Añejo — Deploy Checklist (2026-06-04)

Pushing `main` auto-deploys the git-connected Pages project **anejo-app** to live **anejocateringco.com**.
This deploy is **sandbox/pre-launch**: no real payments. The go-live flip (real money) is separate and gated on the DBPR license.

## 0. Pre-push gate (all ✓ before pushing)
- [x] All Functions + JS pass `node --check`
- [x] No secrets in the repo (`.dev.vars` gitignored; scanned the diff)
- [x] `wrangler.toml` has the real D1 (`d5ca11c7…`) + KV (`afbedd5c…`) IDs
- [x] `SQUARE_ENV` defaults to sandbox (no real charges)
- [x] Legal pages carry the "draft — pending attorney review" banner

## 0.5 Migrations go FIRST — before the code that needs them

There is no automatic migration step. Pushing `main` deploys code within a couple of minutes;
`migrations/*.sql` are applied by hand. **Apply the migration BEFORE pushing the code that reads
it**, or you ship a build whose queries reference columns that do not exist yet.

```
npx wrangler d1 execute anejo --remote --file=migrations/00NN_whatever.sql
```

- [ ] Every new `migrations/*.sql` in this push has been applied to **--remote**
- [ ] Re-read one affected row afterwards to prove the data survived — a table rebuild that
      silently dropped a live row is the failure mode worth 30 seconds
- [ ] For a table REBUILD (SQLite cannot drop a PK/constraint), rehearse it first on a scratch
      SQLite from the previous migration, not on production

**Applied by hand so far, newest first:** `0053_qbo_connection`, `0052_content_blocks_queue`
(rebuild — carried the live announcement across on a deterministic `cb_` id), `0051_content_blocks`.

*Ordering note:* the repo has an auto-sync job that commits and pushes on its own. It can publish
a commit before you have applied its migration, so apply migrations as soon as the file exists
rather than at push time. A code-before-migration window is survivable here only because every
read is wrapped in try/catch and degrades — do not rely on that.

## 0.9 AFTER the deploy: read production. `npm test` passing is not the same as it working.

**Dayan's ruling, 2026-08-03.** In one evening three defects shipped with a fully green suite:

1. The owner's roster + override ops were **unreachable** — they sat below an
   `if (!b.account_id) return bad(...)` guard while the HUB sent only `site_id`. The test asserted
   that `/op === 'set_headcount'/` appeared in the source file. **A source match proves code is
   present; it proves nothing about a request reaching it.** The owner clicked Add, saw a message,
   and the roster stayed empty.
2. The **Allow** button for a pending stand-in rendered but could never be used — the API only ever
   returned *active* roster rows. No test opened the page as the main contact.
3. The first real invite text read *"Añejo Catering: Añejo added you"* — the session context carries
   no `name`, so the one line meant to say WHO added you repeated the brand instead. No test read
   the message a human would actually receive.

All three were found by reading production afterwards — the D1 rows, `sms_log`, the live JSON.
None by the suite. So the read is a step, not a habit:

```
npm run verify:live          # public surfaces + API shape
node scripts/verify-live.mjs --db    # + the live database (needs wrangler auth)
```

- [ ] Ran it **after** the Pages build finished. Static assets and the Functions bundle deploy
      separately and have lagged each other by ~15s — a page that looks updated over an API that is
      not is a real state, and it is how "it's live" gets said too early.
- [ ] Exit code 0. **Skipped checks are not passes** — the script says so; re-run with the flags it
      names, or state plainly what is still unverified.
- [ ] For anything behind a login the script cannot reach: say so out loud rather than implying it
      was checked. Then have the human do the one real click and confirm the result in the data.
- [ ] Fixed and re-deployed until the verifier is green. A defect found in production is not
      "reported" until the read comes back clean.

*Machine-enforced:* invariant **I52** in `Aether/mission-control-mvp/executor/verify-invariants.mjs`
fails the build if `scripts/verify-live.mjs` is missing, cannot fail, is not named here, or if no
test in `test/money` drives a real route handler.

## 1. Cloudflare Pages → anejo-app → Settings → Variables and secrets
Without these, the storefront/subscriptions return 503 ("not configured") but the rest of the site works.

**Secrets (encrypted):**
| Name | Value (sandbox now) |
|---|---|
| `ANTHROPIC_API_KEY` | (already set) — AI calculator + plan generation |
| `SQUARE_ACCESS_TOKEN` | the sandbox access token from `.dev.vars` (rotate at go-live → prod token) |
| `RESEND_API_KEY` | ✅ set — domain verified, magic-link login + receipts sending live |
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

## 5b. Optional feature vars (Pages → Variables) — sensible defaults if unset
| Name | Purpose | Default if unset |
|---|---|---|
| `KITCHEN_KEY` | unlocks the kitchen order list at `/kitchen` (and `/api/orders`). **Unset = locked** (401). | locked |
| `DELIVERY_FEE_USD` | flat delivery fee added at checkout | `5` |
| `ORDER_MIN_USD` | à-la-carte order minimum | `25` |
| `LEADS_NOTIFY_TO` | inbox that tasting/wholesale leads email to (needs Resend) | none (no-op) |

GA4 analytics: add `<meta name="ga4-id" content="G-XXXXXXXXXX">` in `public/index.html` (and other pages) — analytics then loads **only after** the visitor accepts the cookie banner.

## 6. 🚩 Go-live flip (separate — only when DBPR license is in hand)
Set `SQUARE_ENV=production`; swap `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_APPLICATION_ID` to production; do steps 3–4 against prod; flip storefront copy from pre-launch to live; remove sandbox test banners.
