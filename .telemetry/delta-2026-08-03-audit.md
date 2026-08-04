# Tracking reconciliation — plan vs. live code

**Audited:** 2026-08-03, **re-run against production 2026-08-04** · **Repo:** `Aether/anejo-app` @ **`origin/main` (560b07f)** — the branch that deploys
**Plan audited:** `.telemetry/tracking-plan.yaml` (v1, dated 2026-06-06, 46 events, destination `posthog`)
**Method:** static extraction of every `capture()` / `captureSystem()` call in `functions/`, `cron/`, `hub-app/`, `public/`, `scripts/`, `tools/` (comments stripped, tests and the `track.js` definition excluded), plus every client-side `Hub.track()` site. Nothing was deployed, redesigned, or regenerated.

> **Amended 2026-08-04**, after reading `_AI_COLLABORATION_COMMAND_CENTER/TELEMETRY_ESTATE.md` (the
> cross-surface registry, which is authoritative over this file's recommendations). Two changes:
> **§5 is now closed by live probe of the Cloudflare Pages config — PostHog has never received an
> event**, and **§3 is reframed accordingly**: the structural "gaps" are de-scope candidates, not
> build work. Sections 1, 2, 4, 6 and the appendix are unchanged.

---

## Headline

**The plan is not behind reality on events — it is behind reality on scope, and it never described the system that was actually built.**

| | Count |
|---|---|
| Events in the plan | 46 |
| Plan events **implemented** | **46 (100%)** |
| Plan events missing | **0** |
| Events **live but not in the plan** | **57** |
| Distinct event names in production code | **103** |
| Call sites | 129 (121 server + 8 client) |

**How these are counted** (figures are for `origin/main` = **what is deployed**, re-verified 2026-08-04):
- **129 call sites** = 121 server `capture()`/`captureSystem()` invocations + 8 client `Hub.track()` invocations. It **excludes** the `capture()` inside [api/hub/track.js](Aether/anejo-app/functions/api/hub/track.js) — that one is the *server-side transport* for the 8 client events, so counting it too would double-count.
- **103 distinct names** = 98 server + 5 client, with **zero overlap**. Names are extracted strictly from inside a `capture()` argument span; a permissive `event:` grep over-reports, because keys like `verified`, `terms_updated`, `site_added` and `activated` are **contract audit-history rows, not telemetry calls**.
- **At runtime it is up to 105**, because `brief_proposal.` + `res.status` composes its name and counts as one static stem here.

> **Two counting corrections were made to this file.** The first pass reported 125 call sites — it wrongly counted the `sendBeacon`/`fetch` lines inside the `Hub.track` **definition** as call sites; they are transport. The second pass reported **96 events / 122 sites**, but was run against branch `claude/lead-brief-proposals`, which is **0 ahead / 70 commits behind `origin/main`** — a stale checkout, not production. Production carries **7 more events** (`social.carousel_generated`, `social.cover_generated`, `social.ig_token_expiry_set`, `social.reference_variant_generated`, `training.example_added`, `training.image_uploaded`, `training.rule_added`) and 7 more call sites. **Audit the branch that deploys.**

The plan's `meta.notes` claim — *"Greenfield: no current tracking"* — and the entire existing `.telemetry/delta.md` ("**ADD:** 46 … current state: greenfield") are **false as of this audit**. All 46 were built. `delta.md` has been marked stale and points here.

The drift is one-directional: **the build shipped everything the plan asked for and then roughly doubled it without writing any of it down.**

And it drifted on destination too, in the direction that saved it: the plan says PostHog, the code writes first-party D1 and treats PostHog as optional. PostHog was never bound (§5), so the deviation is the only reason Añejo has telemetry at all.

---

## 1. Plan events — all 46 present

Every planned event has at least one live `capture()` site, with required properties satisfied. Two apparent property gaps were checked by hand and are **not** gaps:

- `dashboard.viewed` — required `view` **is** passed at all 4 client sites (`Hub.track('dashboard.viewed', { view: … })`). My extractor doesn't parse client-side property objects; the manual read confirms compliance.
- `automation.run` / `alert.triggered` / `eod_report.missed` — the plan models `actor_type` as an event *property*, but the code passes it as a top-level `capture()` argument which `track.js` then injects into the emitted properties. The wire payload is correct; the plan's modelling of it is what differs.

No dead or renamed plan events were found.

---

## 2. The 57 undocumented events

These are live, firing, and absent from the plan. They cluster into whole product areas that did not exist when the plan was written — which is the actual story of the drift.

**Contracts / multi-site ordering (5)** — `contract.account_created`, `contract.site_added`, `contract.billing_contact_set`, `contract.cutoff_missing`, `ordering.settings_changed`
**Social / content / marketing (14)** — `social.post_drafted`, `social.post_scheduled`, `social.post_published`, `social.media_uploaded`, `social.carousel_generated`, `social.cover_generated`, `social.reference_variant_generated`, `social.ig_token_expiry_set`, `campaign.scheduled`, `content.slot_updated`, `content.slot_deleted`, `content.legal_saved`, `studio.content_generated`, `knowledge.document_indexed`
**Creative-studio briefs (3)** — `brief_proposal.created`, `brief_version.restored`, `brief_proposal.<approve\|reject\|needs_info>` *(name composed at runtime — see §4)*
**Order money & kitchen state (6)** — `order.canceled`, `order.refunded`, `order.bowl_checked`, `order.kitchen_cleared`, `recipe.cost_calculated`, `menu.stock_counted`
**Driver route lifecycle (7)** — `route.accepted`, `route.declined`, `route.released`, `route.reoffered`, `delivery.picked`, `delivery.en_route`, `delivery.arriving`, plus `driver.availability`
**Inventory (2)** — `inventory.counted`, `inventory.updated`
**Scheduling & staff (4)** — `shift.scheduled`, `shift.schedule_canceled`, `staff.nudged`, `training.completed`
**Training content authoring (3)** — `training.example_added`, `training.image_uploaded`, `training.rule_added`
**Customers / CRM (5)** — `customer.viewed`, `customer.profile_updated`, `customer.login_link_sent`, `lead.converted`, `rewards.founding_repaired`
**Finance integration (2)** — `qbo.invoice_pushed`, `qbo.disconnected`
**AI / assistant (2)** — `hub.question_asked`, `team_lead.message`
**Push + misc (3)** — `push.subscribed`, `push.unsubscribed`, `reminder.created`

Full per-event detail (file, line, call count, properties) is in the appendix table below.

**Reading:** the plan's 46 events describe an *ops-accountability* app (shifts, EOD, deliveries, kitchen). The 57 undocumented events describe what the HUB actually became: ops **plus** contract catering, a social/content engine, a CRM, refunds, and QuickBooks. The plan isn't wrong about what it covers — it covers about half the product.

---

## 3. Structural gaps — and why most of them should be *deleted*, not built

Each row below is a plan section with **no implementation at all**. My first read called these gaps to close. That was wrong, and §5 is why: **every one of G1–G3 is a PostHog-shaped remedy for a destination that has never existed.** Closing them means building a vendor integration nobody asked for.

The estate registry makes this a standing decision, not a judgment call — *"PostHog is not required anywhere. It appears in exactly one codebase, gated behind an unbound key, over a first-party store that works without it."*

| # | Plan says | Code does | Verdict |
|---|---|---|---|
| G1 | `entities.user` — 15 person traits (email, name, role, `eod_compliance_rate_30d`, …) | **No `identify` / `$set` call exists anywhere.** Verified by grep across `functions/` + `cron/`. | **DE-SCOPE.** These are PostHog person traits. With no PostHog there is no person object to attach them to. The underlying data lives in the `staff` table already — join to it, don't mirror it into a vendor. |
| G2 | `groups:` — business (6 traits) + team (3 traits), `triggers: [creation, trait-change, scheduled]` | `track.js` builds `$groups` — **inside the dead PostHog branch**. No `$groupidentify` anywhere. | **DE-SCOPE.** The `$groups` payload is unreachable code (§5). Añejo is single-tenant; `business` is a constant (`biz_anejo`) and `team` is already a column on `activity_log`. Grouping is a `GROUP BY`, not a group object. |
| G3 | `snapshot_sync:` — hourly job syncing 6 rollup traits | **No such job.** `cron/worker.js` runs 9 automation jobs + 12 admin endpoints; none syncs traits. | **DE-SCOPE.** Its only purpose is pushing traits to a vendor. The same six numbers are live SQL against D1 whenever a screen asks for them. Building an hourly sync to a dead endpoint is the estate's "engine with no screen" pattern in its purest form. |
| G4 | `internal_user_policy` — "exclude `actor_type=system` from adoption metrics" | `actor_type` is recorded correctly on every event, but **no consumer filters on it**. The only `activity_log` reader (`owner/activity.js`) is a raw feed, not an adoption metric. | **KEEP — this is the real gap.** The write side is done and correct. What's missing is the read side: no adoption-metric surface exists, so the policy has nothing to govern. This is the one worth building, and only once someone names the screen and the reader. |
| G5 | `destinations: [posthog]` | `track.js` writes to the `activity_log` D1 table, then POSTs to PostHog only if `POSTHOG_KEY` is set — **it never is** (§5). | **CORRECT THE PLAN.** The declared destination has never received data. The real and only destination is first-party D1, which the plan does not mention once. Invert it: document `activity_log` as the destination, demote PostHog to an unused optional branch or delete it. |

**Net:** three of five "gaps" close by editing the plan, not the code. This also puts Añejo in line with the CORE HUB ruling (first-party D1, no vendor, no SDK, no new secret) — Añejo already *is* that architecture; its plan just describes a different one.

---

## 4. Data-quality findings in the live implementation

1. **`/api/hub/track` accepts any event name.** [functions/api/hub/track.js:13](Aether/anejo-app/functions/api/hub/track.js:13) trims the client-supplied string and forwards it with no allowlist or plan validation. Identity is correctly taken from the session (not spoofable), but the *name* is unbounded — any client typo becomes a permanent new event.
2. **All system events collapse into one PostHog person.** `alert.triggered`, `eod_report.missed`, `automation.run`, `agent_task.completed`, `contract.cutoff_missing` never pass `distinct_id`, so `track.js` falls back to `'anonymous'`. Semantically right (no human actor) but every automation in the product merges into a single synthetic person. The plan defines no system actor ID.
3. **One event name is composed at runtime.** [brief-proposals.js:87](Aether/anejo-app/functions/api/hub/owner/brief-proposals.js:87) emits `'brief_proposal.' + res.status`. It cannot be enumerated statically, so it will never appear in a generated plan or a lint check.
4. **`activity_log` has no retention policy.** [migrations/0003_hub.sql:484](Aether/anejo-app/migrations/0003_hub.sql:484) — three indexes, no pruning anywhere. Every event ever fired is retained forever in D1. (The 30-day `pruneBackups` in `_lib/backup.js` rotates **R2 backups**, not this table.) At 78 events/day (measured on production) this is a hygiene and query-performance issue, not a capacity one — see the retention note below.
5. **`client_ts` is never sent.** The plan's shared-property convention lists it; `track.js` sends server `timestamp` only.
6. **`platform` doesn't mean what the plan implies.** Server-side events default to `platform: 'api'`, so a human tapping in the PWA and a cron job both land as `api` unless the client route was used. `actor_type` is the reliable human/system split; `platform` is not.
7. **7 call sites omit `team`** — all system events (`automation.run` ×5, `agent_task.completed`, `contract.cutoff_missing`). They get no `team` group. Correct by intent, worth stating.

---

## 5. PostHog has never received a single event — proven

**Resolved 2026-08-04 by live probe** of the Cloudflare Pages project config (`GET /accounts/{id}/pages/projects/anejo-app`, read-only, variable **names and types only — no values read or printed**).

The `anejo-app` **production** environment binds **34 environment variables**. `POSTHOG_KEY` is **not one of them**. Neither is `POSTHOG_HOST`. (Preview binds 4, all Square.)

Therefore, in [functions/\_lib/track.js:39](Aether/anejo-app/functions/_lib/track.js:39):

```js
if (!env || !env.POSTHOG_KEY) return;   // has always returned here
```

Every consequence follows from that one line:

- **PostHog has received nothing, ever.** Not misconfigured, not partially wired — the branch has never executed in production.
- **The `$groups` block is unreachable code.** It is constructed *after* the early return, so the plan's entire group model has never been emitted.
- **`destinations: [posthog]` is fiction.** The real and only destination is the `activity_log` table in D1 — which the plan never mentions.
- **The dual-write design saved this.** Because `track.js` writes D1 *first* and PostHog second, 103 event types across 129 call sites have been captured correctly the whole time. Had the plan been implemented as written — PostHog only — Añejo would have **zero** telemetry today. The undocumented deviation from the plan is the reason there is any data at all.

This upgrades the estate registry's hedged *"appears inactive"* to proven-inactive. That row should carry a ✅.

---

## 6. Plan-side defect (the plan is wrong, not the code)

`group_level` uses **five** values — `business` (8), `team` (15), `kitchen` (12), `delivery` (9), `vendors` (2) — but the same file's `groups:` block defines only **two** group types, `business` and `team`. `kitchen`/`delivery`/`vendors` are team *names*, not group types.

The code is right: `track.js` emits exactly `$groups = { business: 'biz_anejo', team: 'team_<name>' }`. The plan's taxonomy is internally inconsistent and should be normalised to the two-level model it already declares.

---

## 7. Estate-rule compliance (checked 2026-08-04)

`TELEMETRY_ESTATE.md` sets cross-cutting rules that override any tracking skill's defaults. Añejo passes all of them — worth recording so nobody re-checks:

| Rule | Status |
|---|---|
| No PII in event properties | ✅ **Pass.** The code is deliberately careful — `has_email`, `email_changed`, `has_address: !!addr`, `has_permalink`, `has_receipt` are booleans, never values. No names, emails, phones or addresses in any property. |
| Identify by `user_id`, never by email | ✅ **Pass.** All identified sites resolve to `ctx.distinct_id` / `sess.uid` / `staff.id`. No email is ever a `distinct_id`. |
| No autocapture, session replay, heatmaps, DOM scraping | ✅ **Pass.** `track.js` is explicit-capture only; there is no client SDK and no external script. |
| Three businesses, three stores — no shared plan/destination/vocabulary | ✅ **Pass.** Añejo's plan, D1 store and event vocabulary are entirely its own. |
| Name the surface and the person who reads it | ⚠️ **Partial.** The owner command-center *feed* reads `activity_log` ([owner/activity.js](Aether/anejo-app/functions/api/hub/owner/activity.js)). But the plan's compliance rates and rollup traits have **no reader** — see G4. |

## Recommended next step (not taken)

Reconcile in the plan's direction, not the code's. **v2 of `tracking-plan.yaml`** should:

1. Correct `meta.notes` (drop "Greenfield") and `meta.updated`.
2. **Set `destinations: [d1_activity_log]`** and demote or delete PostHog — it has never run (§5).
3. Add the 50 shipped events under their real product areas (§2).
4. Normalise `group_level` to the two types the file already declares (§6).
5. **Delete `entities.user` traits, `groups` traits and `snapshot_sync`** (G1–G3) — vendor artifacts for a vendor that isn't there. Keep the underlying questions; answer them with SQL against D1.
6. Add an allowlist check to [api/hub/track.js](Aether/anejo-app/functions/api/hub/track.js) once the plan is true enough to enforce against, and give `activity_log` a retention policy (§4).

**The one thing worth *building*** is G4's missing read surface: an adoption view over `activity_log` that filters `actor_type='system'`. Per the estate's own warning, that should not start until someone names the screen and the person who reads it.

I have not touched `tracking-plan.yaml` or `track.js`.

---

## Appendix — the undocumented events

| Event | Sites | Where | Properties |
|---|---|---|---|
| `brief_proposal.<status>` | 1 | `owner/brief-proposals.js:87` | proposal_id |
| `brief_proposal.created` | 1 | `kitchen/studio/brief-proposal.js:63` | proposal_id, session_id |
| `brief_version.restored` | 1 | `owner/brief-proposals.js:71` | doc_id, version_id |
| `campaign.scheduled` | 1 | `owner/campaigns.js:464` | campaign_id, lead_minutes |
| `content.legal_saved` | 1 | `owner/site-copy.js:128` | doc, published |
| `content.slot_deleted` | 1 | `owner/site-copy.js:147` | slot |
| `content.slot_updated` | 1 | `owner/site-copy.js:195` | slot, active, scheduled, created, placement |
| `contract.account_created` | 1 | `owner/contracts.js:378` | account_id, sites, source |
| `contract.billing_contact_set` | 1 | `owner/contracts.js:474` | account_id, has_email |
| `contract.cutoff_missing` | 1 | `admin/cutoff-check.js:144` | date, missing, count |
| `contract.site_added` | 1 | `owner/contracts.js:400` | account_id, site_id, inherited_terms |
| `customer.login_link_sent` | 1 | `public/hub/owner/customers.html:220` *(client)* | — |
| `customer.profile_updated` | 1 | `owner/customers.js:375` | fields, email_changed |
| `customer.viewed` | 1 | `public/hub/owner/customers.html:183` *(client)* | — |
| `delivery.arriving` | 1 | `driver/stop.js:88` | route_id, stop_id, eta_min, trigger |
| `delivery.en_route` | 1 | `driver/stop.js:75` | route_id, stop_id, eta_min |
| `delivery.picked` | 1 | `driver/pickup.js:144` | route_id, stop_id, confirmed, total, flagged, via_pin |
| `driver.availability` | 1 | `driver/available.js:34` | available |
| `hub.question_asked` | 1 | `owner/ask.js:193` | chars, filed, tokens |
| `inventory.counted` | 1 | `kitchen/inventory.js:140` | item_id, on_hand, par_level |
| `inventory.updated` | 2 | `kitchen/inventory.js:189` | item_id, action, par_level |
| `knowledge.document_indexed` | 1 | `owner/knowledge.js:212` | doc_id, source_kind, authority, chunks, indexed, failed, status, extractor |
| `lead.converted` | 1 | `public/hub/owner/leads.html:198` *(client)* | — |
| `menu.stock_counted` | 1 | `kitchen/inventory.js:169` | item_id, stock_count, was |
| `order.bowl_checked` | 1 | `kitchen/orders.js:181` | order_id, state, via_pin |
| `order.canceled` | 1 | `owner/order-actions.js:363` | order_id, from_status, reason, money_held_cents |
| `order.kitchen_cleared` | 1 | `kitchen/orders.js:222` | order_id, via_pin |
| `order.refunded` | 1 | `owner/order-actions.js:434` | order_id, amount_cents, reason, partial, refund_id, refund_status, manual_followups |
| `ordering.settings_changed` | 1 | `owner/ordering.js:103` | changed, scheduled_only |
| `push.subscribed` | 1 | `push/subscribe.js:78` | — |
| `push.unsubscribed` | 1 | `push/subscribe.js:49` | — |
| `qbo.disconnected` | 1 | `owner/qbo.js:66` | — |
| `qbo.invoice_pushed` | 1 | `owner/qbo.js:83` | invoice_id, already, customer_created |
| `recipe.cost_calculated` | 1 | `kitchen/recipe/cost.js:147` | recipe_id, est_cost_cents, unmatched_count |
| `reminder.created` | 1 | `kitchen/reminders.js:97` | reminder_type, reminder_id, target_team, targeted |
| `rewards.founding_repaired` | 1 | `owner/customers.js:387` | granted |
| `route.accepted` | 1 | `driver/route.js:100` | route_id |
| `route.declined` | 1 | `driver/route.js:108` | route_id |
| `route.released` | 1 | `owner/routes.js:151` | route_id, stops_released, offer_status |
| `route.reoffered` | 1 | `owner/routes.js:177` | route_id, driver_id, unfilled |
| `shift.schedule_canceled` | 1 | `owner/schedule.js:166` | schedule_id, staff_id, shift_date |
| `shift.scheduled` | 1 | `owner/schedule.js:223` | schedule_id, staff_id, shift_date, start, end, label |
| `social.media_uploaded` | 1 | `owner/social-upload.js:69` | bytes, key |
| `social.post_drafted` | 1 | `owner/social.js:119` | scheduled, has_caption |
| `social.post_published` | 2 | `admin/social-tick.js:93` | post_id, scheduled, has_permalink |
| `social.post_scheduled` | 1 | `owner/social.js:242` | post_id, lead_minutes |
| `staff.nudged` | 1 | `owner/nudge.js:80` | staff_id, kind, lang, first_time, sent_at |
| `studio.content_generated` | 1 | `kitchen/studio/content.js:150` | session_id, has_image, demo |
| `team_lead.message` | 1 | `owner/team.js:228` | ok, model, reason, action |
| `training.completed` | 1 | `training/complete.js:47` | module, lang |

*Server paths are relative to `functions/api/hub/`.*
