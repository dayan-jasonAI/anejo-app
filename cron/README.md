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
- Cloudflare dashboard → Workers → anejo-cron → Triggers shows the six crons;
  use "Run now"/`wrangler tail anejo-cron` to watch a scheduled invocation.
- In the HUB, Owner → automations history (`GET /api/hub/automations/run`)
  should show fresh `agent_runs` rows with `triggered_by: cron`.
