# Things Claude Didn't Do — Yet To Do List

Work that was identified, understood, and deliberately **not built**. Each entry says what it is,
why it was skipped, and what it costs to leave alone.

This is not a wishlist. Everything here is a known gap in something already shipped.

---

## 1. Customer subscribe prompt for push notifications

**Status:** ✅ SHIPPED 2026-08-02 (deploy `d35c0ca`) · **Added:** 2026-07-30

The prompt now exists on `/order/confirmed`. Live-verified against production: the page returns
HTTP 200 and serves the opt-in card, the iPhone "Add to Home Screen" instructions, and the SMS
fallback copy. `GET /api/push/subscribe` returns `configured:true` with a real VAPID public key, so
the client has what it needs to subscribe. `/order` now stashes the customer's email and *whether*
they consented to SMS (never the number) through the Square round-trip, because Square's redirect
carries neither.

Behaviour: iPhone outside Home Screen gets instructions instead of a button that cannot work;
anything else gets a real Enable button; **every** failure path — declined, unsupported, VAPID
unconfigured, network error — falls back to naming the channel that still covers them (SMS if they
consented, otherwise email plus a link to `/sms`).

**Not yet true:** no customer has actually subscribed yet, and real iOS behaviour has not been
exercised on a device. The gap this entry described — "there is no moment where a customer is
asked" — is closed; "a customer has said yes" is not, and cannot be closed by writing code.

*Original entry follows.*

The order-tracking notification pipeline is finished and deployed — pending, in prep, out for
delivery, approaching, delivered, rate your experience. It has **never fired to a customer**,
because there is no moment anywhere on the site where a customer is asked to turn notifications
on.

`push_subscriptions` holds 10 rows. **All 10 are staff** — four people across ~10 devices since
June. Zero customers. The plumbing is not the missing piece; the prompt is.

**What to build**

- Ask on the **order confirmation screen**, right after checkout — the moment the customer is most
  motivated and the value is self-evident ("we'll tell you when the driver is close").
- **iOS requires Add to Home Screen first.** Safari will not grant web push to a normal tab. Any
  prompt shown to an iPhone has to say so, or most of the people who tap "yes" get nothing and
  conclude the feature is broken.
- Fall back to SMS where push is declined or unavailable — `notifyCustomer()` already does
  push-then-SMS, so this is a subscribe surface, not a delivery change.

**Cost of leaving it:** the whole customer-notification feature is inert. Every order tracking
message written, tested and deployed goes nowhere.

---

## 2. Backfill coordinates for the 9 pre-geocoding orders

**Status:** ✅ DONE 2026-08-02, on Dayan's explicit approval · **Added:** 2026-07-30

Pressed by a lead session through Dayan's own logged-in owner session at
`/api/hub/owner/geo-check` — the auth gate was used, not worked around.

Evidence, against production D1 (`wrangler d1 execute anejo --remote`):

- Before: `orders` with an address and not canceled = 9, of which geocoded = **0**;
  `contract_sites` = 2, geocoded = **0**.
- The self-test passed first (the endpoint refuses to run otherwise): resolved
  `301 N Olive Ave, West Palm Beach, FL 33401` → `26.7156493, -80.0520646`.
- Endpoint returned: *"Backfilled. 9 orders, 2 sites, 0 clients."* — **zero failures**.
- After: 9/9 orders and 2/2 sites carry coordinates. `SELECT COUNT(*) … WHERE delivery_lat=0 OR
  delivery_lng=0` = **0** — nothing was written as 0,0.

**One thing this turned up, which matters to item 10.** The typo address that shipped once,
`10330 City Center Blvb` (Pembroke Pines), **geocoded successfully** — Google silently corrected
`Blvb` to the real street and returned `26.0059265, -80.2850607`. A plain "does this resolve?"
check would have passed the exact typo it was meant to catch.

---

## 3. Driver route pay was never repriced after geocoding was fixed

**Status:** money, not yet wrong · **Added:** 2026-07-30

Pay formula (`_lib/pay.js`): `$0 base + $3.00/stop + $0.70/mile, minimum $20.00`.

Miles are NULL on every route to date, because there were no coordinates to measure — so the
mileage term contributed $0 and every route fell through to the $20 minimum. Pompano and Delray
are a real drive from the Boca commissary; at $0.70/mile a 25-mile round trip is $17.50 that was
never counted.

**All five routes are still `unpaid`**, so this is a mistake not yet made rather than a correction
owed.

**What to do, in order:** backfill the coordinates (item 2), then reprice the routes, then pay.

### Investigated 2026-08-02 — the UNVERIFIED question above is now answered

**`total_meters` is NULL on all five routes, and there is no code path that recomputes pay for a
route that already exists.** So the routes cannot be repriced from stored data, and it is not one
click. Verified against production D1 and the source:

- All 5 routes: `total_meters` NULL, `total_miles_est` NULL, `pay_cents` = **2000** (the $20 floor)
  — every one of them, which is the signature of the mileage term contributing nothing.
- Root cause chain, in `_lib/routing.js`: the routes were built while every order had
  `delivery_lat` NULL, so `geoStops.length === orderIds.length` was false → `optimizeRoute()` was
  never called → `totalMeters` stayed null → the haversine fallback also needs stop coordinates, so
  `miles` stayed null → `computeRoutePay` charged 0 miles → `$3.00 × stops` alone is below $20 →
  floored.
- `pay_cents` is written **once**, in the INSERT at `_lib/routing.js:91`. Nothing in
  `owner/routes.js`, `owner/payouts.js` or `owner/pay-config.js` ever recalculates it. Changing the
  rate card does not reprice an existing route either.

**What it is worth.** Every stop on all five routes now has real coordinates (item 2), and
`KITCHEN_ORIGIN_LAT` / `KITCHEN_ORIGIN_LNG` / `GOOGLE_MAPS_API_KEY` are all present and working in
the production Pages environment — so miles are computable now, they simply were not then. Figures
below use the app's **own** fallback estimator (`estimateRouteMiles`, haversine × 1.3 circuity) and
the live rate card `$0/base + $3.00/stop + $0.70/mile, min $20.00`. Base assumed to be the Boca
commissary (~26.394, -80.203); the exact origin is an encrypted Pages secret and was not read.

| Route | Date | Status | Stops | Est. miles | Recorded | Corrected | Δ |
|---|---|---|---|---|---|---|---|
| `route_a3b3af6a…` | 07-23 | assigned | 1 (Lake Worth) | 44.4 | $20.00 | $34.08 | +$14.08 |
| `route_3c9b7d27…` | 07-27 | completed | 2 (Delray, Pompano) | 40.6 | $20.00 | $34.42 | +$14.42 |
| `route_6cc05ca7…` | 07-28 | completed | 2 (Pompano, Delray) | 40.6 | $20.00 | $34.42 | +$14.42 |
| `route_c1c5d254…` | 07-29 | assigned | 2 (Pompano, Delray) | 40.6 | $20.00 | $34.42 | +$14.42 |
| `route_b0272e99…` | 07-29 | completed | 1 (Pembroke Pines) | 71.0 | $20.00 | $52.70 | +$32.70 |

**Only three of the five are actually owed today** — `payRollupColumns()` counts a route as owed
when it is `completed` AND unpaid. The 07-27, 07-28 and 07-29 Pembroke routes qualify: **$60.00
recorded vs $121.54 corrected, so ~$61.54 short.** All five together: $100.00 vs $190.04.

Per driver, which is how it actually gets paid — confirmed by running the app's own rollup against
production:

| Driver | Routes owed | Recorded | Corrected (Boca base) | Short by |
|---|---|---|---|---|
| Anejo House Delivery | 2 (07-27, 07-29 Pembroke) | $40.00 | $87.12 | **$47.12** |
| Vitian Perez | 1 (07-28) | $20.00 | $34.42 | **$14.42** |

Vitian also holds the two stale `assigned` routes, worth $40.00 as recorded and $68.50 corrected —
neither owed until their status is resolved.

The number moves with the base. A central-Palm-Beach base instead of Boca gives $255.97 across all
five rather than $190.04, because the Pompano and Pembroke legs get longer. Confirm the origin
before paying anything.

**Nothing was changed.** No route was marked paid, no `pay_cents` was edited, no rate was touched.

### 2026-08-02, later — the owner chose a model, then paused it. DO NOT BUILD THIS YET.

Dayan chose **pure per-mile at the IRS rate, no floor, no per-stop**, with miles from the
**planned Google route distance**, and then explicitly held it: *"don't make this live on the HUB
yet and ensure it doesn't get deployed live… I want to compare the differences and make a decision
later today."* **No pay code has been written.** This section is analysis only.

Three facts that changed the picture:

1. **The IRS rate is 76¢, not 65–70¢.** 2026 opened at 72.5¢ and the IRS **raised it to 76¢
   effective July 1, 2026**. The live config is `per_mile_cents: 70` — six cents under. Whatever
   gets built must make the rate owner-editable *with an effective date*; a mid-year federal change
   already caught this once.
2. **Every route has `gps=0`, `started=0`, `delivered=0`** — including the two marked `completed`.
   No route has ever been started in the app, no GPS point recorded, no stop marked delivered.
   Mileage pay has nothing to stand on until the tracking actually happens. The tracking is the
   real project; the formula is the easy half.
3. **Classification is unset.** `staff.employment_type` supports `w2|contractor|external` and is
   **NULL for all three drivers**. This decides whether no-floor per-mile is safe: Florida minimum
   wage is $14.00/hr, $15.00 from 2026-09-30, and a 12-mile route that takes 90 minutes pays $9.12
   — about $6/hour. The IRS mileage rate is a *reimbursement for vehicle cost*, not wages. This is
   an accountant question, not a code question.

Comparison at 76¢/mile (estimated miles, Boca base — same caveats as the table above):

| | Recorded | Current formula | Pure per-mile @76¢ |
|---|---|---|---|
| All five routes | $100.00 | $190.04 | **$180.28** |

Pure per-mile pays **less overall** than the current formula, because dropping $3.00/stop costs the
two-stop routes more than the 6¢ rate rise returns. It pays *more* on the long single-stop run.

**Attribution is disputed and must be settled before anyone is paid.** The owner: *"Vitian did one
delivery that I had to close out under Anejo House because she failed to use the hub properly."*
Evidence points at `route_b0272e` (07-29, Pembroke, **single** delivery, recorded under Anejo
House). Reattributing it swings **$54**: Vitian $95.46 → $149.42, Anejo House $84.82 → $30.86.

Also unresolved: `route_a3b3af` (07-23) has `offer_status='unfilled'`, was declined by Vitian,
never started, 0 of 1 stops delivered — yet it is `assigned` and carries $20. It looks like work
nobody did.

**Also noticed:** `route_a3b3af6a…` (07-23) still sits at `assigned` with 0 of 1 stops completed,
and `route_c1c5d254…` (07-29) at `assigned` with 1 of 2. Both are more than a week stale. Either
they were finished and never marked, or they were abandoned — worth resolving, because status is
what decides whether a driver is owed.

**Cost of leaving it:** drivers get paid the $20 floor for routes that earned more.

---

## 4. There is no marketing ANALYTICS loop — nothing learns

**Status:** ✅ DONE by a later session (2026-07-31) — verified against prod on the 31st: 14 rows in
`ig_media_metrics`, 2 in `ig_account_metrics`, daily `insights-tick` in the cron worker (e5fa801).
Kept for history. · **Added:** 2026-07-30

Nothing reads Instagram insights. `instagram_business_manage_insights` was deliberately left off
the app. No post performance is recorded, nothing compares posts, and the weekly planner writes
the next week with no knowledge of how the last one did.

Calling the current system a "marketing team that learns" would be false. It drafts from the MENU,
not from results.

**What to build:** add `manage_insights`, record reach/likes/comments/saves per post after ~48h,
and feed the top performers back into the planner prompt as examples.

**Cost of leaving it:** week 10 is written exactly as well as week 1.

---

## 5. Nothing answers a DM or a comment yet

**Status:** ✅ DONE by later sessions (2026-07-31) — Aña drafts and now AUTO-SENDS
(`social.auto_reply='both'`, re-approved by Dayan after the self-reply incident 32f0649 and two
certification rounds). Verified: 27 webhook events, 7 IG threads, 25 outbound replies in prod.
Kept for history. · **Added:** 2026-07-30

`sendDirectMessage()` and `replyToComment()` exist and are tested. **Nothing calls them.** The
webhook receives and files a message into Añejo Comms; no code drafts a reply, and Ana (the
website assistant, `api/chat.js`) has no Instagram awareness at all.

**What to build:** on an inbound Instagram message, draft a reply with Ana's existing knowledge
base, save it to the thread as `ai_drafted`, and let a human send it. Auto-send only after the
drafts have been read for a while and are consistently right.

**Cost of leaving it:** the inbox collects messages that a human still has to answer from scratch.

---

## 6. Subscription rotations ignore a sold-out bowl

**Status:** ✅ SHIPPED 2026-08-02 (deploy `d35c0ca`) · **Added:** 2026-07-29

The kitchen ticket now warns, and only warns. `planRotationWarnings()` in `_lib/menu.js` checks
each plan-rotation line (`bowl_<name>`, the id `suborders.js` gives them — à-la-carte lines use the
bare menu id, so a regular order can never trip it) against the **live** menu on every board poll,
not against what was true when the ticket printed, because a bowl can sell out mid-shift.

Deliberately absent: any substitution, reordering, or hiding of the ticket. It names the bowl and
the reason; a person decides. A bowl with no availability data recorded reads as *unknown*, not
sold out — warning on data we do not have would train the kitchen to ignore the warning on the day
it is real.

15 tests cover sold-out-by-availability, sold-out-by-stock-count, in-stock, never-tracked, unknown
bowl id, à-la-carte lines, and multiple sold-out bowls on one ticket each named separately.

**Live verification is partial, and honestly so.** `/api/hub/kitchen/orders` serves 200 in
production with the new field wired in, but the board was empty at deploy time and there are still
**0 active plans**, so no real ticket has actually rendered a warning. The path is proven by test,
not by a live sold-out rotation. The first real subscriber is what closes that.

*Original entry follows.*

`plans.bowl_rotation` is fixed at signup and nothing on the subscription path re-checks the menu.
A bowl marked sold out would still reach kitchen tickets via `suborders.js`.

There are **0 active plans**, so nothing is affected today. It was deliberately not auto-fixed:
silently rewriting a customer's plan behind their back is worse than the gap.

**What to build:** a warning on the kitchen ticket when a rotation bowl is unavailable — not an
automatic substitution.

**Cost of leaving it:** the first subscriber plus one sold-out bowl equals a kitchen ticket for
something that cannot be made.

---

## 7. QuickBooks is still on sandbox credentials

**Status:** proven in sandbox, never against real books · **Added:** 2026-07-28

Live-verified end to end against Intuit's sandbox: CompanyInfo, item and customer creation,
invoice POST, read-back of TotalAmt. `QBO_ENVIRONMENT` still points at sandbox.

**What to do:** register the redirect URI on the Production tab, swap in production keys, delete
`QBO_ENVIRONMENT`. Also: the income account is currently "first one found" rather than a setting.

**Cost of leaving it:** no invoice reaches the real books. DGP billing stays manual.

---

## 8. Instagram token expiry is unhandled

**Status:** ⚠️ SHIPPED 2026-08-02 (deploy `d35c0ca`) — **but it needs one thing from Dayan** ·
**Added:** 2026-07-30

The HUB Social page now carries an expiry banner that escalates: quiet past 30 days, a visible
warning inside 30, red and urgent inside 7, and a distinct expired state. `docs/
INSTAGRAM_TOKEN_SWAP.md` is the runbook for replacing the expiring user token with a Meta **System
User** token, which does not expire — including the fact that a new Pages secret is inert until the
project is redeployed. The current token was not touched, read, refreshed, or printed.

Live-verified: `GET /api/hub/owner/social` in production returns
`token_expiry: {at: null, status: "unknown", days_left: null, swap_doc: "docs/INSTAGRAM_TOKEN_SWAP.md"}`.

**Why this is ⚠️ and not ✅.** The expiry date is **owner-entered**, because the only way to read a
token's real expiry is to interrogate the token itself, which was explicitly out of bounds — and
seeding a guessed date would have produced a precise-looking number nobody had verified. So the
banner currently says *"Token expiry not recorded"*, which is honest but is **not yet a warning**.

**Dayan: open the HUB Social page and record the expiry date once.** Until that happens this item
protects nothing, and the token still dies in late September with no notice. That is the one manual
step, and it takes about ten seconds.

*Original entry follows.*

The token was generated from the App Dashboard, so it is long-lived — about 60 days, expiring
late September 2026. The Social page reports a refused token clearly, but nothing warns *before*
it expires, and nothing renews it.

**What to build:** either a warning banner as expiry approaches, or a Meta **System User** token,
which does not expire.

**Cost of leaving it:** posting stops dead one day in late September with no warning.

---

## 9. Untested paths (deployed, never executed once)

**Status:** cannot be closed by writing code · **Added:** 2026-07-30

Each of these is built and deployed but has never run against real data. Listed because "tests
pass" is not the same as "has worked once".

| Path | Status as of the 2026-07-31 audit |
|---|---|
| Instagram webhook **receiving** | ✅ proven — 27 events received |
| **Sending** a DM reply | ✅ proven — 25 outbound Instagram replies |
| `social-tick` **publishing** | ✅ proven — 4 posts published by the timer |
| `campaigns-tick` **sending** | ✅ proven — see below. This row said "STILL NEVER RUN" and was already wrong when written. |

**`campaigns-tick` sending — closed 2026-08-02.** Two separate pieces of evidence, and the first
one contradicts the row above.

*It had already been sending for two days.* Production `campaigns` shows scheduled sends that
fired long before this session: `cmp_8162d1ba…` (`test` segment) scheduled 07-31 06:48Z, sent
06:49Z; `cmp_f9bd4378…` (`all`) scheduled 07-31 15:00Z, sent 15:00Z, 20 delivered; `cmp_f2437edc…`
(`all`) scheduled 08-01 11:00Z, sent 11:01Z, 20 delivered. Whoever last edited this table did not
check the table it describes.

*Proven again from scratch, 2026-08-02.* A campaign to the `test` segment (which resolves to
`dayan@dayanrealtyhub.com` only — `app_settings['campaign.test_recipients']`) was inserted into
production D1 as `status='scheduled'`, `scheduled_at` = 09:05:28.395Z. It was left alone. The
`anejo-cron` Worker's next minute tick picked it up: `campaigns` went to `status='sent'`,
`recipients=1`, `sent_count=1`, `failed_count=0`, `sent_at` = **09:06:23.483Z** — 55 seconds after
its moment. `campaign_sends` held exactly one row: `dayan@dayanrealtyhub.com`, `status='sent'`,
`reason` NULL. The email itself landed in that inbox at 09:06:23Z from
`noreply@anejocateringco.com`, subject "Scheduler send proof", so this is proven at the mailbox and
not merely in the database. Both rows were then deleted from production.

Worth knowing: `wrangler tail anejo-cron` confirms the Worker runs every minute and posts
`offers-tick`, `campaigns-tick`, `social-tick` and `social-inbox-tick` in that order, each
returning HTTP 200.

**Standing caution, unchanged:** three more campaigns to the `all` segment sit `scheduled` for
08-02 11:00Z, 08-03 11:00Z and 08-04 11:00Z, created by `dayan@anejocateringco.com`. The scheduler
is now demonstrably capable of sending them unattended. That is the feature working, but it means
an unwanted scheduled campaign is a live outgoing risk, not a theoretical one.

---

## 10. Delivery addresses were never checked at checkout

**Status:** ✅ SHIPPED 2026-08-02 · **Added:** 2026-08-02

A real order shipped to **"10330 City Center Blvb"** — a typo for Blvd — and nothing caught it.

**The thing that makes this harder than it sounds.** Proven, not assumed: when the geo backfill ran
that exact address through the live Google geocoder, it **resolved successfully** — Google silently
corrected `Blvb` to `Blvd` and returned coordinates. So the obvious implementation, "does this
address geocode?", would have passed the very typo it was built for. The signal that actually works
is comparing what the customer typed against what Google *found*.

Checkout now geocodes server-side (a client-only check is bypassable) and interrupts only when the
part that decides **which building the driver drives to** looks wrong: the street number/name
differs from Google's, the ZIP differs, Google flagged `partial_match` on an address with no unit,
or the result is only block-level (`APPROXIMATE`/`GEOMETRIC_CENTER`).

**It warns and asks — it never blocks.** The customer sees "you typed X, we found Y", can accept the
correction in one tap or say "no, use what I typed", and the order goes through either way. New
construction and gated communities are real orders Google has genuinely never heard of; refusing
them would refuse money. The outcome is recorded on the order (`address_verify_status` /
`address_verify_reason`, migration `0073`, applied to production before this code shipped) and the
driver's stop card shows an "unverified" badge — a driver who knows an address is unconfirmed
behaves differently.

**Fails open, deliberately.** No key, provider down, rate-limited, misconfigured, dead fetch → status
`unavailable` and checkout proceeds exactly as before. An outage at Google must never cost an order.
Unresolvable addresses keep NULL coordinates; **0,0 is never written**.

**One defect was caught in review and fixed before deploy**, worth recording because it nearly
shipped: the first implementation compared the *whole* typed line against Google's whole formatted
address. `formatAddress()` folds the unit into line 1, and Google routinely cannot verify an
apartment — it drops it and sets `partial_match`. Every apartment order would have gotten a red
"we couldn't quite match this address" warning showing their own street minus the unit. In an
apartment-heavy market that is a wrong warning on a large share of real orders, and it trains people
to tap through the one warning that matters. The comparison is now street-and-ZIP only, and there is
a named regression test for it at both the unit and the full-handler level.

**Live-verified against production, with the real address from the incident.** `POST /api/checkout`
against `anejocateringco.com`, hitting the real Google Geocoding API:

- `10330 City Center Blvb, Pembroke Pines, FL 33025` → **HTTP 409**, `reason: "corrected"`, and the
  suggestion offered back is `10330 City Center Blvd, Pembroke Pines, FL 33025` — the actual fix,
  one tap. **The address that shipped once is now caught.**
- `99999 Nonexistent Fakestreet Blvd, Lake Worth, FL 33461` → **HTTP 409**, `suggestion: null`.
- Neither created an order: `SELECT COUNT(*) FROM orders` for those test contacts = **0**. The gate
  returns before Square is ever called, so a warned customer has nothing to clean up.

A second defect was caught *by that live test* and fixed before this entry was written. The first
run answered the fake street with `suggestion: {formatted: "Palm Springs, FL 33461, USA", street:
null}` — Google answers an unrecognised street with the surrounding city. Offered as a one-tap "Use
this address", that would have overwritten the customer's **city** while leaving their street alone,
producing an address neither party meant and pointing a driver at the wrong town. A suggestion now
requires a street; without one the customer just gets "deliver here anyway". Pinned by a regression
test named after the real response.

**Still not verified:** no real customer has hit the warning yet, and the confirm-anyway path has
not been exercised by a human. The first genuinely bad address a customer types is what closes that.

---

## 11. AI images looked like AI, and the grid looked like a green block

**Status:** ⚠️ engine SHIPPED 2026-08-02 — **inert until two API keys are added** · **Added:** 2026-08-02

The owner's verdict: *"you can tell it's AI"*, and *"the ig page of a food business should show
food at first glance and right now it looks like a green block."* Both were correct, with two
separate causes.

**Cause 1 — the model.** `_lib/plate_image.js` ran only `@cf/leonardo/phoenix-1.0` on Workers AI.
It is now a fallback **chain**: OpenAI `gpt-image-1` → Gemini image → Workers AI, reorderable from
KV without a redeploy, metered into the same `$50/week` `ai_spend` ceiling (not a separate budget),
per-provider timeouts, and a provenance ledger (`image_generations`, migration `0074`, applied)
that records which provider actually made each image and why the others were skipped — so a silent
degradation back to the worst model is visible instead of mysterious.

**It does nothing until `OPENAI_API_KEY` and `GEMINI_API_KEY` are set as Pages secrets.** Without
them the chain skips both and behaves exactly as before. Adding a secret is inert until redeploy.

**Cause 2 — the covers were never AI at all.** The green grid came from
`tools/cardgen/series_cards.py`, a **local Python script** rendering text cards on `BG=(9,20,10)`,
run by hand and uploaded. Instagram's grid shows only slide 1 of a carousel, so the food photos on
slides 2–4 were never visible. Handled separately — see the food-first guard.

**Not verified:** no image has been generated through the new chain yet (0 rows in
`image_generations`), and the response shapes for `gpt-image-1` and `gemini-2.5-flash-image` come
from documentation, not a live call. Watch the first real generation.

---

## 12. "Is the marketing team a real role, or generic AI?" — audited, answered

**Status:** answered 2026-08-02, honestly · **Added:** 2026-08-02

The owner asked directly. The answer from the code is: **both, and that split is the problem.**

- There **is** a genuine strategist — `_lib/team_lead.js`: *"You are the Añejo Marketing Team Lead
  — the strategist on a small marketing team… PROPOSE strategy with reasoning the owner can argue
  with."* Opus, with a rich context spine (brand, live menu with kitchen build, Instagram results,
  budget). Not generic.
- But **it does not write the posts.** The weekly planner that does (`socialPlan()` in
  `_lib/automations.js`) had a role of exactly one clause: *"You write Instagram posts for Añejo
  Catering Co."* No audience, no objective, no funnel, no format theory.

**Why it could not notice it was failing:**
- It has **never seen an image** — it writes a text `image_brief` and inserts `media_key = NULL`.
- Its results feed is top-3 + weakest-1 from a **single** capture date, captions cut to 90 chars.
  No trend, no per-category rollup, no attribution from a result back to what produced it.
- `intel_reports` — the web research it commissions — **had no reader anywhere in the codebase.**

**Do NOT add another agent on top of Creative Studio.** Studio already generates images but cannot
post them; the marketing pipeline needs images but cannot generate them. The gaps were four missing
**wires**, not a missing brain: Studio's image generator → `social_post_media`, knowledge base →
marketing prompts, `intel_reports` → any reader, Lead's `team_briefs` → the planner.

---

## 13. The owner could not train the team without a laptop and a deploy

**Status:** ✅ SHIPPED 2026-08-02 · **Added:** 2026-08-02

> "it's hard for me to do it from the local files, the hub should be the only place I go, and
> future owners will have to train it from the hub itself."

**HUB → Train the team** (`/hub/owner/team-training`) now takes plain-language rules and reference
photos with the owner's own notes ("this is the look I want" / "never do this"), stored in D1 +
R2 (migration `0075`, applied). No file, no script, no deploy.

The feature that matters most is the panel at the top: **"What the team currently believes"** shows
the *literal text* handed to the AI, with a character budget counter. The owner can verify his
training actually landed instead of taking it on faith — which is the whole answer to "how do I
know this isn't just generic AI."

**Wired into both surfaces that write marketing** — the weekly planner (`_lib/automations.js`) and
the Team Lead (`_lib/team_lead.js`), each budget-capped at 4,000 chars, each degrading silently to
empty if the tables are missing. **The wiring is source-pinned by test** (`training-wiring.test.js`)
because this repo already had two features that looked live from the HUB and were read by nothing:
the knowledge base (Studio-only) and `market_intel` (no reader at all). Both are now also wired
into the planner.

Live-verified end to end: added a rule through the real page on production, watched it appear in
the "what the team believes" panel as prompt text (`162 / 6,000 characters`), then removed it —
0 active rules, page back to *"The team has not been trained yet."*

**Honest empty state:** with nothing recorded, `trainingContext()` returns an empty string and the
page says so plainly. An untrained team must never read as a trained one.

---

## 14. The planner was a caption generator wearing the team's name

**Status:** ✅ SHIPPED 2026-08-02 · **Added:** 2026-08-02

Three things changed in `socialPlan()`:

**A real role.** The old framing was one clause — *"You write Instagram posts for Añejo Catering
Co."* It now carries a specified strategist role in the same voice as the Team Lead, including the
food-business specifics it lacked: the cover frame must show food, carousels and Reels out-reach
static posts, saves and shares beat likes, a caption needs a reason to act now.

**Cadence that cannot stall.** `WANT = 5` was a top-up against the *entire* unshipped backlog with
no time bound — so a stale approval queue pinned the count at 5 and drafted **zero, forever**. That
is the trickle the owner was seeing. It is now a real weekly target scoped to the current ET week,
owner-settable without a redeploy at `/api/hub/owner/social-cadence-config`.

Defaults, and why they are not what was asked for: the owner asked for **3–6 posts daily**. For
*feed* posts that is wrong — 2026 data (Buffer's 2M-post analysis, Hootsuite) shows past 3–5/week
average reach *drops*, because the algorithm weights early engagement per post. At 46 followers,
six daily feed posts split one small audience six ways. So: **feed 4/week**, **stories 3–6/day** —
his number, on the surface where it is correct.

**A posting-time table.** There was none; the model picked an hour 8–19, defaulting to 11.
Now `/api/hub/owner/social-posting-times`, defaulting to weekdays `[12, 18]` and weekends `[18]`
ET — the researched food windows (lunch decision 11am–1pm, dinner 5–7pm; Tue–Thu strongest,
weekends weakest for feed). Slots are de-duplicated against posts already on the calendar, so the
"never two posts in the same hour" rule the old prompt merely *asked* for is now enforced.

**Not verified:** no planner run has executed against the live config yet — the weekly job fires
Sundays. First real run is the proof.

---

## 15. The grid showed text cards because the grid shows slide 1

**Status:** ✅ SHIPPED 2026-08-02 · **Added:** 2026-08-02

Instagram's profile grid renders only the **first slide** of a carousel, and slide 1 was a text
card. `publishSocialPost()` now promotes the first real food photo to the front when the cover is a
known text card. **Reordering only** — nothing is invented, nothing is dropped, no post is blocked.

**The detection signal, and a defect caught in review.** The first implementation keyed off the
`series/` folder. Production keys prove that folder holds cards *and photos side by side*
(`p6_cover.jpg` next to `p6_photo.jpg`), so every slide matched, nothing was ever promoted, and it
raised a false "no photo" warning on the posts that did have one — a no-op exactly where it
mattered. Detection is now the filename's **role suffix**: photo = `_photo` or one of the eight
bowl names (imported from `bowl_art.js` so the lists cannot drift); card = `_cover|_cta|_hook|
_rule|_facts|_why`; **anything else is unknown and left alone**.

Verified against the five real production carousels: `p1`, `p3`, `p6` reorder to lead with food;
`p4` and `p5` are correctly identified as having **no food photo at all** — flagged for a human,
not blocked, not faked. That last finding is real and the owner needs it: two queued posts have no
food image in them anywhere.

---

<<<<<<< HEAD
## 16. One person could order for a site, and nobody could override it

**Status:** ✅ SHIPPED 2026-08-03 · **Added:** 2026-08-03

**The incident.** Pompano Beach, Mon 2026-08-03. The registered contact was out. A colleague
opened the intake link, typed her own name and her own mobile — and the 6-digit code went to the
absent contact's phone anyway. The office could not order. The count reached the owner as a text
message from the accountant, and **he could not enter it either**: this API could set a contact,
revoke a device and raise an invoice, but nothing could write a head count. The day was recorded
nowhere — no ledger row, no kitchen order, no audit event. It would have gone unbilled.

**The cause was one line** in `_lib/contract.js`:

```js
const dest = onFile || normalizePhone(phone);   // onFile wins, forever
```

Once a site had a `contact_phone`, that was the only number a code could ever reach; the phone a
person typed was used solely on a site's *first* use, to self-enrol. The name box was, in effect,
decorative. `contract_intake_devices` had always allowed **many** trusted devices per site — the
roster was never the limit, the single enrolment phone was.

**The roster is now real** (`contract_site_staff`, migrations/0077). Pick who you are and the code
goes to *your* number; or say **someone else is covering today**, enter your own mobile, and order
under your own name. Either way it is still one code, one verified person, one audit row — the
security did not move, the bottleneck did. A stand-in is recorded `active = 0`: they could order,
and they are visible, but **placing one order does not authorize you** — the owner or the site's
primary contact promotes them. Both can add people; the primary contact does it from the intake
page itself, gated on their *verified device* rather than on holding the link, because the link
lives in an office inbox and cannot be the credential that decides who may commit an account to
spend.

**Two things the roster forced open:**
- **Receipts now go to the submitter AND the site primary**, de-duplicated. Sending only to the
  contact on file would mean the person who actually ordered never gets their confirmation
  number, and the registered contact never learns an order went in while they were out.
- **A trusted device no longer files an order under the wrong name.** An office shares one
  browser; the cookie belongs to the device, not to whoever is sitting at it. A request naming a
  different person now re-verifies instead of sailing through.

**And the owner can record a count himself** — `set_headcount` → `ownerSetHeadcount`. It sends
**no text** (this is the owner correcting his own books, not a client confirming an order that
never happened), **requires a reason** that lands on an `owner_override` audit row with
`verified = 0`, and ignores the delivery-day and cutoff rules, which exist to stop a *client*
ordering into a day we do not serve and must never stop us recording what was delivered. A
backfilled past day lands `fulfilled` so it cannot reappear as work on the kitchen board.

**2026-08-03 was recorded by hand** (23 lunches · $138 + $20 delivery = $158, `is_rush = 0` —
the office was blocked by our own form, not late), with the same three writes and an
`owner_override` audit row stating where the count came from.

**Not verified:** not yet deployed, and migration 0077 is not yet applied — the roster is empty
until it runs, and the code falls back to the old single-contact behaviour until then, which is
why the migration seeds each site's existing contact as its own primary. npm test: 1074/1074 pass.
npm run lint: clean.

---

## 16. Four guidance stores, none reaching every surface

**Status:** ✅ SHIPPED 2026-08-03 · **Added:** 2026-08-03

An audit of who-reads-what found the owner could edit guidance in the HUB and have it reach some
of his team and not the rest, with no way to tell which:

| Store | Team Lead | Planner | Brand Auditor | Aña | Studio |
|---|---|---|---|---|---|
| Owner Training | ✅ | ✅ | **was NO** | **was NO** | no |
| Knowledge Base | no | ✅ | no | **was NO** | ✅ |
| Live D1 brand doc | ✅ | **was NO** | **was NO** | no | ✅ |
| Compiled snapshot (deploy-gated) | fallback | was primary | was primary | no | no |

**The brand-brief split was the trap.** Editing the brief in HUB → Content moved the Team Lead and
Studio but NOT the planner or the Brand Auditor — those read the compiled snapshot, which only
changes on a deploy. The owner could rewrite his brand voice and have the auditor still judging
against the old text, silently.

Fixed by extracting `loadBrand()` / `withoutProposals()` into `_lib/brand_source.js` — live D1
first, compiled snapshot as the floor, unapproved Studio proposals still stripped (Dayan's ruling:
one of those proposals quotes wrong prices, and an unapproved proposal is not a standard). Planner,
Auditor and Lead now share one definition. Source (`d1`/`repo`) is reported, so a thin D1 doc is
visible rather than mysterious.

**The Brand Auditor now reads the owner's training**, and a training-rule violation is a `flag`
enforced in *code* — an inattentive model cannot verdict `pass` over the owner's own rule.

---

## 17. Aña was auto-talking to customers and could not be trained

**Status:** ✅ SHIPPED 2026-08-03 · **Added:** 2026-08-03

She drafts and **auto-sends** DM and comment replies (`social.auto_reply='both'`, the owner's
approval) and was grounded in nothing but the live menu and prices. The one part of the system
actually speaking to customers was the one part with no trainable input at all.

She now reads owner training (1,200 chars) and knowledge-base retrieval (topK 3, 1,200 chars) —
budgeted far tighter than the planner's 4,000 because she runs on Haiku on every inbound message.
Both degrade to empty independently; a missing table never blocks a reply.

**Her safety rails were not touched and are pinned by test**: no invented facts, no medical claims,
no made-up discounts, and an angry/medical/refund message still escalates with **no draft leaked**.
`social.auto_reply` was not changed — verified `'both'` in production after deploy.

---

## 18. The team could not learn from its own results

**Status:** ✅ SHIPPED 2026-08-03 — needs data before it says anything · **Added:** 2026-08-03

The real ceiling on the whole system. `performanceBrief()` gave the planner the top 3 and weakest 1
posts from a **single capture date**, captions cut to 90 characters. No trend, no per-category
rollup, and **no attribution**: nothing recorded which rule, brief or format produced a post. The
owner could write a rule, watch reach move, and nothing anywhere connected the two.

Now: `post_provenance` (migration `0076`, applied) stamps every planner-written post with the
training rules in force, the directing brief, and the category. `attributionRollup()` reports reach
by rule, brief, category and format — median and mean, with sample size beside every number.

**It refuses to rank below n=5 per side** (matching `AUTO_PUBLISH_AFTER`, this codebase's own
existing bar for "enough repeats to trust a signal"). That refusal matters more than the feature: a
confident ranking built on two posts would train both the owner and the AI on noise.

Live-verified after deploy: `minSampleSize: 5`, `totalPublished: 2`, `totalWithProvenance: 0`,
every comparison `enoughData: false` with null reach. It says nothing, honestly, which is correct —
stamping begins with the next planner run.

**Both halves are source-pinned by test.** Stamping without reading is a table nobody queries;
reading without stamping is a report with nothing in it. This repo has shipped two features before
that looked live from the HUB and were connected to nothing.

---

## 19. Photography style was locked in code

**Status:** ✅ SHIPPED 2026-08-03 · **Added:** 2026-08-03

The owner compared his ChatGPT images to the app's and called it "day and night". Two causes, and
it is worth separating them because only one is fixable by training:

- **The renderer** — model-bound. `OPENAI_API_KEY`/`GEMINI_API_KEY` are still **absent**, so every
  image still falls through to Workers AI Leonardo. No volume of rules moves this. The key is the
  fix, and it is not substitutable.
- **The prompt** — was a one-line `image_brief` plus a hardcoded `PLATING_STYLE` constant. The
  owner could not change how his own food is photographed without a developer.

`_lib/image_prompt.js` now expands the brief into a rich, provider-shaped prompt grounded in the
owner's training first, the brand photo standard second, and the old constant only as the floor
when nothing has been trained. This is the ChatGPT-app behaviour we were missing: that app silently
rewrites a short prompt into a long one before rendering, and we did none of it.

Cheap model (Haiku), metered into the same `$50/week` ceiling, cached in KV per (brief,
training-version) so an edit to training invalidates by changing the key rather than by deletion.
**Only successful expansions are cached** — so adding the API key or a budget reset takes effect
immediately instead of being masked by a cached "not configured" answer.

**Fails safe to byte-identical current behaviour** on: no API key, budget exhausted, HTTP error,
thrown error, timeout, unparseable output, refusal-shaped output. Pinned directly against the
exported `PLATING_STYLE`/`NEGATIVE_PROMPT` constants.

**Not verified:** no expansion has run against a live model, and no image has been generated
through the chain (`image_generations` is empty). The first real generation is the proof.
=======
## 16. The quality gate could name the defect and not fix it

**Status:** ✅ SHIPPED 2026-08-03 · **Added:** 2026-08-03

The owner asked the right question about §15's warning: *if the goal is post quality, why does the
team raise the alert instead of fixing it before scheduling?*

He was right on both counts, and the second reason is worse than the first.

**The guard shipped after the posts.** §15 landed 2026-08-02; the flagged slides are from
`studio/2026-07/series/`. `p4`/`p5` were a backfill finding, not a new failure.

**But nothing on the team could have satisfied the gate anyway.** The planner writes `caption` +
`image_brief` and inserts `media_key NULL` — art direction, never pixels, and *nothing downstream
had ever read that brief*. The Team Lead attaches one staged bowl image, and only when the caption
names exactly one bowl; a caption about "every Añejo bowl" names none, so it attaches nothing. A
text-card-only post was a state the team could **create and could not repair**. The warning was the
entire remedy, and it handed the work back to the person the team works for.

**The capability was already in the building, wired to the wrong surface.** `_lib/plate_image.js`
generates an on-brand plate photo (OpenAI → Gemini → Workers AI, under the same $50/week ceiling)
and was reachable only from Creative Studio. `_lib/food_photo.js` is that wire, shared by all three
doors — planner, Team Lead, and the owner's button — for the same reason `publishSocialPost` is
shared.

**Prevent + repair.** New drafts get a food photo at creation (planner always; Lead only when no
bowl art matched, because real photography must win). Existing warned drafts get a
**🍽️ Generate a food photo** button on the warning itself → `op: 'generate_cover'`.

**Two traps that would have made it a fake fix**, both pinned by test:
- **Format.** Instagram is JPEG-only and this Worker has no image binding to transcode with.
  gpt-image-1 defaults to PNG. Asked for `output_format: jpeg`; a provider that still returns
  non-JPEG is **skipped** (`not_jpeg`) rather than stored — a PNG slide is a repair that produces
  an unpublishable post.
- **Naming.** `putMedia` mints `studio/2026-08/med_x.jpg`, which the §15 guard reads as UNKNOWN.
  Without the new `role` suffix, the image this app generated *as food* would not be recognised as
  food and the warning would survive its own fix.

**What it deliberately does not do:** never changes a post's status (attaching an image is not
approval — an AI-made bowl photo must not schedule itself onto the grid), never replaces an
existing slide, never runs on a post that already has a recognised photo. Generated covers are
stamped `social_post_media.origin = 'ai_generated'` (migrations/0076) and **badged AI in the slide
strip** — a placeholder the owner replaces with real photography, never a claim to be one.

**Not verified:** no image has been generated against live provider keys yet. The chain, the
skip-on-non-JPEG, the ordering and the refusals are unit-tested; the first real generation is the
proof. npm test: 1073/1073 pass. npm run lint: clean.
>>>>>>> claude/social-food-photo

---

## Appendix — what "coordinates" are for

`orders.delivery_lat` / `delivery_lng`. An address is text; a route needs numbers. Without them:

- **Route optimisation** cannot order the stops, so drivers get an unordered list
- **Driven miles** cannot be computed, and driver pay uses miles
- **Distance/ETA** for "driver is approaching" has nothing to measure against

Every new order geocodes on checkout now that the Google key works. Historic orders do not fix
themselves — nothing re-geocodes an order after the fact, which is why the backfill exists.
