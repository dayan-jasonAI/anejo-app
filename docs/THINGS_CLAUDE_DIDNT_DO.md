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

**Not verified:** no real Google API call was made from the test suite (mocked responses shaped from
the real backfill evidence), and no real customer has hit the warning yet. The first genuinely bad
address is what proves it end to end.

---

## Appendix — what "coordinates" are for

`orders.delivery_lat` / `delivery_lng`. An address is text; a route needs numbers. Without them:

- **Route optimisation** cannot order the stops, so drivers get an unordered list
- **Driven miles** cannot be computed, and driver pay uses miles
- **Distance/ETA** for "driver is approaching" has nothing to measure against

Every new order geocodes on checkout now that the Google key works. Historic orders do not fix
themselves — nothing re-geocodes an order after the fact, which is why the backfill exists.
