# Square go-live runbook (flip sandbox → production)

**Status (2026-07-20, pre-launch check): Part A COMPLETE; full sandbox checkout re-verified
end-to-end today** (order → Square payment link → test payment → webhook → `paid` in D1; subscribe
page SDK + card + Apple/Google Pay buttons initialize clean; $25 min, 7% tax, 6PM-prior cutoff and
Sunday-closed all enforced). Launch target Wed 2026-07-22; DBPR inspection Tue 2026-07-21 — flip
Part B as soon as the license clears. Added B2.5 (Apple Pay prod domain), previously missing.

**Status (2026-06-23): Part A COMPLETE — staged and waiting on DBPR.** The 3 production
subscription plans are created and the production webhook is registered; the owner holds the
go-live packet (prod token, App ID, Location ID, 3 plan var IDs, webhook signature key) off-line.
The site still runs on Square **sandbox** (working, no real charges). **Only Part B remains** —
the Cloudflare env flip — and it is **blocked on the DBPR food license** (production = real charges).
Do NOT do Part B until that license is in hand. (Note: the owner ran `scripts/create-square-plans.mjs`
for A2; the `create-prod-square-plans.mjs` reference below is an equivalent earlier copy.)

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

### B2.5. Apple Pay production domain (wallets)
Sandbox Apple Pay domain verification does NOT carry over. With the **production** token:
```
curl -X POST https://connect.squareup.com/v2/apple-pay/domains \
  -H "Authorization: Bearer $SQUARE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"domain_name":"anejocateringco.com"}'
```
Expect `VERIFIED` (the domain-association file already serves at
`/.well-known/apple-developer-merchantid-domain-association`). Also confirm Apple Pay + Google Pay
are enabled in Square Dashboard → Payment settings. Until this runs, `/subscribe` silently degrades
to card-only on iPhone — checkout still works.

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
