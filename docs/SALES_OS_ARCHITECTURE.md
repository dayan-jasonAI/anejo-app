# Añejo Sales OS — Architecture

*Written 2026-09-10 with the build on branch `feat/sales-os`. Current code is the source of truth;
where this document and the code disagree, the code wins and this document is wrong.*

## What it is for

Everything from "this business is our customer" onward already existed: `contract_accounts` →
`contract_sites` → daily headcount → kitchen → route → invoice → payment. What did not exist was the
path **into** that — a clinic Añejo has never heard of becoming a signed, activated account without
Dayan searching or door-knocking. The Sales OS is that path, and nothing else.

```
 Market ─▶ Organization ─▶ Contact ─▶ Score ─▶ Opportunity ─▶ Outreach ─▶ Reply ─▶ Proposal ─▶ CONVERT
 (Places  (dedupe,        (own-site  (determ-  (stage, not   (owner      (owner   (owner-     │
  / CSV /  evidence)       only,      inistic,  a score)      approves    marks /  confirmed  ▼
  manual)                  never      reasons)                every       landing  cents)   registerAccount()
                           guessed)                           email)      form)             activateAccount()
                                                                                             └─▶ existing contract-account ops
```

## Files

**Reusable engine** — nothing in these files assumes a clinic; they take configuration as data.

| File | Job |
|---|---|
| `functions/_lib/sales/normalize.js` | Pure. Name/website/domain/email/phone/address normalisation; the `dedupeKey` two records of one place must share. Social/directory hosts are never an "own domain". |
| `functions/_lib/sales/scoring.js` | Pure, **imports nothing**. `scoreOrganization(facts, icp, area)` → points per criterion **with reasons and evidence**, tier, hard disqualifiers. The only thing that decides a score. |
| `functions/_lib/sales/store.js` | Data layer: organizations (upsert + dedupe, fill-blanks-only merge), contacts (never promoted, SMS/voice always off), immutable evidence, scores, opportunities (one open per org), stage moves, `stopSequences`, suppression checks, activity + telemetry. |
| `functions/_lib/sales/discovery.js` | Provider interface. CSV is the approved production source. `google_places` (Places API New) is kept, isolated, but **refused at the provider boundary unless `sales.places_persistence_approved`** — a flag locked false in this release (Places terms restrict storing its content). A key alone never enables it. Never sample data. |
| `functions/_lib/sales/enrich.js` | Reads an org's **own** website: SSRF guard (own domain only, re-checked on every redirect; no IPs/private names/odd ports/credentials), robots.txt, extraction of emails (own domain or published free-mail only), people **named with a leadership title**, and meal-fit signals with the sentence they came from. |
| `functions/_lib/sales/brief.js` | AI Account Brief (Haiku, budget-gated + metered). Receives structured facts + allowed source URLs; its answer is post-validated in code (unknown sources dropped, un-evidenced people replaced, prices removed, health claims flagged, thin evidence stated). Advisory only. |
| `functions/_lib/sales/outreach.js` | Compose (deterministic, from verified facts), governance checks, the single renderer (preview == send), approval (requires `render_hash`), the gated send loop, follow-up drafting, reply/stop, provider events. |
| `functions/_lib/sales/convert.js` | Proposals (integer cents, totals must agree) and **Convert to Contract Account** (owner-confirmed only, never overwrites an existing account, idempotent, read-back verified). |
| `functions/_lib/sales/metrics.js` | Dashboard tiles, the funnel, conversion by source/tier/template, and the bottleneck diagnosis. |
| `functions/_lib/sales/jobs.js` | Scheduled jobs + owner "run now": discovery, enrichment, follow-up, send, metrics. Each logs `agent_runs`. |
| `functions/_lib/sales/config.js` | Flags + owner settings in `app_settings`. Three flags are **locked** in this build. |

**Añejo configuration** — `functions/_lib/sales/anejo.js`: ICP categories and their fit, the Palm
Beach + Broward service area, discovery queries × areas, and the defaults for the offer, proof,
sender and send window. To reuse the engine for another business (Aether), this is the file to
replace — plus `convert.js`'s adapter, which is the one engine file that calls Añejo's contract
functions.

**Routes**

| Route | Who | What |
|---|---|---|
| `GET/POST /api/hub/owner/sales` | owner | dashboard, list, detail, queue, settings, review, metrics; org/contact/opportunity ops, research, brief, CSV import, discover-now, run-job |
| `GET/POST /api/hub/owner/sales/outreach` | owner | the approval queue: start sequence, preview, approve, edit, reject, snooze, reply received, stop, send now |
| `POST /api/hub/owner/sales/settings` | owner | flags, JSON settings (offer needs `confirm:true`), sequence delays |
| `GET/POST /api/hub/owner/sales/deal` | owner | proposals, confirm, convert, link existing |
| `POST /api/hub/admin/sales-tick?job=` | cron key / owner | the scheduled jobs |
| `GET /for/<token>` | public (token) | the personalised landing page |
| `POST /api/sales/request` | public (token) | pricing / call / tasting request — stops the sequence, alerts the owner |
| `POST /api/sales/landing-event` | public (token) | engagement beacon (always 204) |
| `GET/POST /api/sales/unsubscribe?t=` | public (token) | the opt-out, one-click compatible; the link never carries the address |
| `POST /api/webhooks/resend` | Svix-signed | existing suppression logic, **plus** delivered/opened/clicked/bounced/complained for sales rows |

**UI**: `public/hub/owner/sales.html` — Dashboard · Prospects (+ detail) · Approvals · Settings ·
Launch review. In the owner's More sheet (the six-slot bar is unchanged).

## Data model (`migrations/0103_sales_os.sql`)

| Table | Notes |
|---|---|
| `sales_organizations` | `dedupe_key` UNIQUE; `(source, source_external_id)` UNIQUE when set; `current_score/tier` denormalised from the latest score; `category_locked` when the owner set the category. |
| `sales_contacts` | `dedupe_key` UNIQUE (org + email, else org + name, else org + phone). `email_status` says how we know; only `public_site`, `owner_provided`, `owner_verified`, `provider_verified`, `self_provided` are sendable. `marketing_sms_allowed` and `voice_allowed` are always 0 in this build. |
| `sales_prospect_sources` | Immutable evidence, ≤ 8 KB each, text only. |
| `sales_scores` | Score, tier, `criteria_json` (reasons + evidence), disqualifiers, `model_version`, `config_hash`. |
| `sales_briefs` | AI or deterministic brief + its post-validation flags. |
| `sales_opportunities` | Stage (not a score). One OPEN per organization (partial UNIQUE index). `landing_token` UNIQUE. |
| `sales_sequences` / `sales_sequence_steps` | Seeded: `sseq_default_v1`, 4 email steps, every step owner-approved. |
| `sales_enrollments` | UNIQUE (opportunity, sequence). `next_step_at` drives follow-up drafting. |
| `sales_outreach` | Every touch. UNIQUE (enrollment, step) — a step can exist once. `body_snapshot` is what was approved and what is sent. `unsub_token` UNIQUE. |
| `sales_unsubscribes` | Prospect opt-outs, separate from `campaign_unsubscribes` (both are checked). |
| `sales_activity` | Append-only Sales feed (meaningful rows also go to `activity_log`). |
| `sales_proposals` | Owner-confirmed terms, integer cents; `converted_terms_json` is the snapshot a won account was created with. |

No CHECK constraints: vocabularies live in code, so widening one never needs a D1 table rebuild.

## The approval law, mechanically

1. A step is **drafted** (`startSequence` or the follow-up tick) as `pending_approval`. Nothing sends it.
2. **Preview** renders the exact email with the one pure renderer (`renderOutreachEmail`) — subject,
   body, the compliance footer, From, Reply-To, To — and returns a `render_hash` of all of it.
3. **Approve** recomputes the render and refuses unless the hash matches the preview the owner saw.
   Flagged claims need an explicit, recorded acknowledgement. Suppressed recipients cannot be approved.
4. **Send** selects only `approved` rows with `approved_by` + `approved_at`, re-checks every gate
   **immediately before delivery**, renders `body_snapshot` with the same renderer, and **compares the
   result with `approved_render_hash`**: if the sender, reply-to, postal address or link origin changed
   since approval, the email goes back to the queue for re-approval instead of out. It then claims the
   row with a conditional UPDATE (at most once). Links are always built from `APP_BASE_URL`
   (default `https://anejocateringco.com`), never from the host the Hub was used on.
   A provider error returns the row to `approved` (up to 3 attempts, then `failed` and the sequence
   stops) and stops the batch; every send carries the idempotency key `sales-outreach-<id>`, so a
   retry after an ambiguous failure cannot double-send. A row left in `sending` by an interrupted
   Worker is returned for retry after 15 minutes.
5. `sales.auto_send_enabled` and `sales.owner_approval_required` are **locked** in `config.js`; a
   settings write cannot change them, and a row written straight into `app_settings` is ignored.

**Send gates** (all must hold; the Hub prints whichever fail): Sales on · prospect email on · Resend
configured · a From on the verified domain · a real Reply-To · a real postal address (not the service
area) · the offer confirmed by the owner · inside the ET business-hours window · under the daily cap ·
this contact not already emailed today · opportunity open · sequence active · no reply recorded ·
contact sendable · not in `sales_unsubscribes`, `campaign_unsubscribes`, `email_suppressions` · org not
do-not-contact · recipient unchanged since approval.

**Stop conditions** (all call `stopSequences`, which also cancels drafted/approved steps): reply
(owner-marked or a landing-page request), unsubscribe, hard bounce, complaint, manual stop, won, lost,
nurture, do-not-contact, a rejected draft.

## Scoring

Seven criteria with owner-editable max points (defaults: category 25, recurring-meal 20, volume 15,
route 15, contact 10, multi-site 5, operational 10), normalised to 0–100. Tiers A ≥ 80, B ≥ 65,
C ≥ 45, else D. Hard disqualifiers force D: do-not-contact, provider says closed, outside the service
area. **Unknown facts earn zero with the reason "unknown"** — an unstated capacity is never estimated.
Distance is measured from `KITCHEN_ORIGIN_LAT/LNG` and every active contract site with coordinates.

## Scheduling (`cron/worker.js`)

| UTC | Job | Behaviour when its flag is off |
|---|---|---|
| `40 * * * *` | send | returns the list of unmet gates |
| `25 * * * *` | enrich | one settings read, no-op |
| `15 12 * * *` | discovery | one settings read, no-op |
| `10 11 * * *` | followup | one settings read, no-op |
| `50 3 * * *` | metrics | runs (read-only) |

The cron Worker is deployed separately (`cd cron && wrangler deploy`); until it is, nothing scheduled
runs and the owner's "run now" buttons are the only trigger.

## Telemetry

`sales.*` events (see `.telemetry/tracking-plan.yaml`), all server-side, ids/counts/enums only.
Every job writes `agent_runs` (`automation_type = sales_<job>`) and `automation.run`.

## Security

Owner-only guards on every workspace route (not the marketing desk: approving a cold email and
creating a billed account are the owner's acts). Public routes authenticate with 128-bit tokens and
reveal nothing about whether a token exists beyond a uniform 404/204. CSRF is covered by the existing
`/api/_middleware.js` Origin check. Public forms are rate-limited and honeypotted. Enrichment cannot
be pointed anywhere but the organization's own domain. Scores, notes and contacts never reach a
public page. The kitchen street address appears nowhere.

## Where this build deliberately differs from the spec, and why

| Spec said | Current `main` / this build | Why |
|---|---|---|
| "migrations after 0090" | New migration is **0103** | `main` already runs to 0102 (and has two files numbered 0090). |
| Reuse `campaigns.js` | Separate send path; shares `sendEmail`, `escHtml`, the suppression list and the Broadcast postal address | Broadcast is built around warm, consented segments; cold prospects must never enter them. `sendEmail` gained opt-in `from`/`replyTo`; existing callers' request bodies are byte-identical (tested). |
| Reply detection | **Not configured** — manual "Reply received"; the landing form counts as a reply | There is no inbound-mail ingestion for the sending domain. Replies go to the owner's Reply-To. The UI says so instead of pretending. |
| Marketing desk may use Sales | Owner-only | Approving cold outreach and converting to a billed account are owner decisions. |
| AI writes the cold email | Deterministic composer from verified facts; the owner edits | It makes "the model cannot invent a price or a fact" true by construction. The AI brief informs the owner; it never writes the email. |
| Flags named `sales.*` | Each is its own `app_settings` key, exactly as named | Greppable and individually auditable. |
| Team Lead Broadcast bridge, 3 card templates | **Deferred** — see the handoff | The acquisition loop comes first; both touch the brand/marketing surfaces that need the owner in the room. |
| Voice (Sprint F), avatar video | Not built; `sales.voice_enabled` locked off | Per spec: only after the email funnel has been exercised. |
