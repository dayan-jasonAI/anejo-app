# Square go-live runbook (flip sandbox → production)

**Status:** the site runs on Square **sandbox**. Everything is wired; going live is a credentials
swap. **Do NOT do the final flip until the DBPR food license is in hand** — production = real charges.

The flip is split in two so nothing risky happens early:
- **Part A — Stage now** (safe, no real money): create the production plans + register the webhook,
  collect values into the *go-live packet* below. Nothing changes on the live site.
- **Part B — Flip later** (when DBPR clears): set all production values in Cloudflare in one session.

---

## Part A — Stage now (do this anytime)

### A1. Get production credentials
Square Developer dashboard → your app → switch from **Sandbox** to **Production**:
- **Application ID** (starts `sq0idp-…`)
- **Access Token** (production; starts `EAAA…`) — ⚠️ treat like a password, never paste it in chat
- **Location ID** — Square dashboard → Account & Settings → Locations

### A2. Create the 3 production subscription plans
On your machine, in this repo, run (token stays local — it's only read from the env):
```
SQUARE_ACCESS_TOKEN='YOUR_PRODUCTION_TOKEN' node scripts/create-prod-square-plans.mjs
```
Copy the 3 `SQUARE_PLAN_*_VAR` IDs it prints.

### A3. Register the production webhook
Square Developer dashboard → your app → **Webhooks** → Add endpoint:
- **URL:** `https://anejocateringco.com/api/webhooks/square`
- **API version:** latest
- **Events:** `payment.created`, `payment.updated`, `subscription.created`, `subscription.updated`, `invoice.payment_made`
- Save, then copy the **Signature Key**.

### Go-live packet (hold these securely until Part B — do NOT commit them anywhere)
```
SQUARE_ENV            = production
SQUARE_APPLICATION_ID = sq0idp-…           (A1)
SQUARE_ACCESS_TOKEN   = EAAA…              (A1, production)
SQUARE_LOCATION_ID    = …                  (A1)
SQUARE_WEBHOOK_KEY    = …                  (A3 signature key)
SQUARE_WEBHOOK_URL    = https://anejocateringco.com/api/webhooks/square
SQUARE_PLAN_5_VAR     = …                  (A2)
SQUARE_PLAN_10_VAR    = …                  (A2)
SQUARE_PLAN_12_VAR    = …                  (A2)
```

---

## Part B — Flip to live (only once DBPR license is in hand)

### B1. Set all 9 values in Cloudflare
Cloudflare → Workers & Pages → **anejo-app** → Settings → **Variables & Secrets** → **Production**.
Overwrite the existing sandbox `SQUARE_*` secrets with the production go-live-packet values above
(set `SQUARE_ENV = production`). Save.

### B2. Redeploy
Env-var changes only apply to a **new deployment**. Trigger a production redeploy (push any commit,
or Cloudflare → Deployments → Retry latest).

### B3. Verify (ping the build session to run these, or check yourself)
- `https://anejocateringco.com/api/square-config` reports `"env":"production"` + the production app/location IDs.
- The `/order` and `/subscribe` "test mode" banners are **gone** (they auto-hide on production).
- Run **one real card** through `/order` for a small amount → confirm it charges in your Square dashboard, then refund it.
- Run **one real subscription** on `/subscribe` (5-bowl) → confirm it appears in Square Subscriptions.
- Square dashboard → Webhooks → the endpoint shows a recent **2xx** delivery (signature verified).

### B4. Final
- Remove this file's go-live packet from wherever you stored it.
- **Rotate** the sandbox token (no longer used) and any tokens shared during setup.

That's it — the site is live on real payments.
