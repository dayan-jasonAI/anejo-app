# Things Claude Didn't Do — Yet To Do List

Work that was identified, understood, and deliberately **not built**. Each entry says what it is,
why it was skipped, and what it costs to leave alone.

This is not a wishlist. Everything here is a known gap in something already shipped.

---

## 1. Customer subscribe prompt for push notifications

**Status:** built but unreachable · **Added:** 2026-07-30

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

**Status:** one button, unpressed · **Added:** 2026-07-30

See the note below on what coordinates are for. The button exists at
`/api/hub/owner/geo-check`; nobody has pressed it. It is safe, idempotent, and takes seconds.

**Cost of leaving it:** route optimisation, driven-miles driver pay and every distance calculation
stay wrong for that history.

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

**UNVERIFIED and needs checking first:** `total_meters` is the driven distance computed at
dispatch, and it is separate from an address's coordinates. Whether repricing a historic route is
even wired up is unknown — it may need a manual recalculation. Do not promise "one click" until
that is checked.

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

**Status:** known gap, currently harmless · **Added:** 2026-07-29

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

**Status:** works now, fails silently in ~60 days · **Added:** 2026-07-30

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
| `campaigns-tick` **sending** | ❌ STILL NEVER RUN — no campaign has ever been scheduled. Proven to refuse a stale one only. |

The one that remains is the one that emails the whole list unattended. Prove it with a scheduled
send to the `test` segment before trusting it with a real audience.

---

## Appendix — what "coordinates" are for

`orders.delivery_lat` / `delivery_lng`. An address is text; a route needs numbers. Without them:

- **Route optimisation** cannot order the stops, so drivers get an unordered list
- **Driven miles** cannot be computed, and driver pay uses miles
- **Distance/ETA** for "driver is approaching" has nothing to measure against

Every new order geocodes on checkout now that the Google key works. Historic orders do not fix
themselves — nothing re-geocodes an order after the fact, which is why the backfill exists.
