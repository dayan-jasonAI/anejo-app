# anejo-cron

Tiny standalone Cloudflare Worker that runs the HUB automations unattended.
Cloudflare Pages Functions have no native cron, so this Worker fires on a
schedule and POSTs to the Pages app:

```
POST {HUB_BASE_URL}/api/hub/automations/run
Headers: Content-Type: application/json, X-Cron-Key: <CRON_KEY>
Body:    { "type": "<automation_type>" }
```

## Schedule

| Cron (UTC)       | Automations                       |
| ---------------- | --------------------------------- |
| `15 1 * * *`     | `eod_chase`                       |
| `30 1 * * *`     | `daily_summary`                   |
| `30 9 * * *`     | `route_optimize`                  |
| `0 18 * * *`     | `sentiment_scan`, `ticket_triage` |
| `0 10 * * 1`     | `restock_suggest` (Mondays)       |
| `0 12 1,15 * *`  | `payroll_prep` (1st + 15th)       |

## Deploy

```sh
cd cron
wrangler deploy
wrangler secret put CRON_KEY
```

When prompted, paste a long random value. **Set the SAME value as the Pages
project env var `CRON_KEY`** (Pages → anejo app → Settings → Environment
variables) — the run endpoint compares them, so a mismatch means every cron
call is rejected with 401/403.

### Optional: point at a preview deployment

By default the Worker targets `https://anejocateringco.com`. To exercise a
preview branch instead, set a plain var:

```sh
wrangler deploy --var HUB_BASE_URL:https://<preview>.pages.dev
```

(or add `[vars] HUB_BASE_URL = "..."` to `wrangler.toml`).

## Verify

- `curl https://anejo-cron.<account>.workers.dev/` → `anejo-cron ok`
- Cloudflare dashboard → Workers → anejo-cron → Triggers shows the one every-minute cron;
  use "Run now"/`wrangler tail anejo-cron` to watch a scheduled invocation.
- In the HUB, Owner → automations history (`GET /api/hub/automations/run`)
  should show fresh `agent_runs` rows with `triggered_by: cron`.

## Office lunch survey reminders

Each minute the worker independently calls `/api/hub/admin/survey-reminders-tick`,
with a 25-second timeout so it cannot delay existing dispatch jobs. Confirmed contract
drop-off queues one reminder per recipient/order, due at eight minutes and never sent
after ten minutes. Recipient eligibility and STOP preferences are checked again at send.
Unknown provider outcomes are not resent automatically. An SMS-provider acknowledgement
is not proof of delivery to the handset. Scoped SMS links expire 24 hours after drop-off
and allow feedback for that office and meal only. Ordinary order-form links still require
a trusted office device. Owner → Contracts → an office's lunch feedback shows responses
and reminder states, including missed/blocked/unconfirmed jobs.

Release order: migration 0144, Pages revision, then this worker. Never backfill prior
deliveries or fabricate drop-offs to exercise real sends. Verify a scheduled invocation
with a current worker tail and record the version, endpoint status, and acknowledgement
counts. No empty-queue result proves a real SMS reached an office.
