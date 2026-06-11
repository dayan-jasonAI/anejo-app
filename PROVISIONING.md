# Añejo — Provisioning Checklist (launch sprint)

What has to exist outside the code for the trainer SaaS + storefront to run. Most of this is Dayan-owned (accounts/credentials). Claude wires the code once these exist. None of it requires the food license — that only gates the final go-live flip.

## 1. Cloudflare D1 (database) + KV (sessions)
Create once, then put the IDs in `wrangler.toml` **or** the Pages dashboard → Settings → Functions → Bindings.

```
# from the webapp/ folder, logged in to the Añejo Cloudflare account
npx wrangler d1 create anejo
npx wrangler kv namespace create SESSIONS
# then apply the schema:
npx wrangler d1 execute anejo --remote --file=migrations/0001_init.sql
```
- D1 binding name: **DB** → paste `database_id`
- KV binding name: **SESSIONS** → paste namespace `id`

*(If you'd rather, give Claude access to the Cloudflare dashboard and it'll click through these.)*

## 2. Resend (transactional email) — ✅ DONE 2026-06-08
For magic-link logins, plan emails, and order receipts. **Live + verified** — domain
`anejocateringco.com` is verified in Resend (DKIM + SPF + DMARC green in Cloudflare DNS), the
`RESEND_API_KEY` secret is set in Pages, and magic-link sign-in emails are delivering to real
inboxes. To re-create in a fresh env:
1. Create a Resend account.
2. Add domain **anejocateringco.com**; Resend shows SPF/DKIM/DMARC DNS records → add them in Cloudflare DNS (DNS-only / grey cloud).
3. Create an API key.
4. Set in Pages → Settings → Variables & Secrets:
   - `RESEND_API_KEY` (Secret)
   - `EMAIL_FROM` = `Añejo Catering Co. <noreply@anejocateringco.com>` (Var)
   - `APP_BASE_URL` = `https://anejocateringco.com` (Var)

## 3. Square (commerce + subscriptions)
1. Finish Square business verification + connect bank.
2. Turn on Square Online; set delivery zones, pickup hours, delivery fees, order cutoff/scheduling, tax.
3. Build the item catalog (Claude provides the mapping from the Stripe Product Catalog spec): 7 bowls, sauces, bites, and meal-plan subscription plans (plan_5/plan_10/plan_12).
4. Get API credentials + create a webhook subscription. Set in Pages secrets:
   - `SQUARE_ACCESS_TOKEN` (Secret)
   - `SQUARE_LOCATION_ID` (Var)
   - `SQUARE_WEBHOOK_KEY` (Secret)
   - `SQUARE_ENV` = `sandbox` now → flip to `production` at go-live.
5. Connect Square → QuickBooks sync so the books stay in QBO.

## 4. FL DOR sales tax
Register at floridarevenue.com (free, ~15 min). Needed so checkout charges tax correctly.

## 5. The go-live flip 🚩
Only once the **DBPR catering license is in hand**: set `SQUARE_ENV=production`, switch Square to live payments, and turn the storefront from "opening soon" to "order now." Everything else ships before this.

---

### Binding/secret summary (Pages → Settings → Functions/Variables)
| Name | Type | Purpose |
|---|---|---|
| DB | D1 binding | trainer/client/plan/subscription data |
| SESSIONS | KV binding | login sessions + short-lived stashes |
| ANTHROPIC_API_KEY | Secret | AI calculator (already set) |
| RESEND_API_KEY | Secret | email |
| EMAIL_FROM / APP_BASE_URL | Var | email + link building |
| SQUARE_ACCESS_TOKEN / SQUARE_WEBHOOK_KEY | Secret | payments |
| SQUARE_LOCATION_ID / SQUARE_ENV | Var | payments / go-live flip |
