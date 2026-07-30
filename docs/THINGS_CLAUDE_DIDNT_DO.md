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

## 3. Subscription rotations ignore a sold-out bowl

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

## 4. QuickBooks is still on sandbox credentials

**Status:** proven in sandbox, never against real books · **Added:** 2026-07-28

Live-verified end to end against Intuit's sandbox: CompanyInfo, item and customer creation,
invoice POST, read-back of TotalAmt. `QBO_ENVIRONMENT` still points at sandbox.

**What to do:** register the redirect URI on the Production tab, swap in production keys, delete
`QBO_ENVIRONMENT`. Also: the income account is currently "first one found" rather than a setting.

**Cost of leaving it:** no invoice reaches the real books. DGP billing stays manual.

---

## 5. Instagram token expiry is unhandled

**Status:** works now, fails silently in ~60 days · **Added:** 2026-07-30

The token was generated from the App Dashboard, so it is long-lived — about 60 days, expiring
late September 2026. The Social page reports a refused token clearly, but nothing warns *before*
it expires, and nothing renews it.

**What to build:** either a warning banner as expiry approaches, or a Meta **System User** token,
which does not expire.

**Cost of leaving it:** posting stops dead one day in late September with no warning.

---

## 6. Untested paths (deployed, never executed once)

**Status:** cannot be closed by writing code · **Added:** 2026-07-30

Each of these is built and deployed but has never run against real data. Listed because "tests
pass" is not the same as "has worked once".

| Path | Why it has never run |
|---|---|
| Instagram webhook **receiving** | App not published; 0 events ever received |
| **Sending** a DM reply | `sendDirectMessage` has never called Meta |
| **Replying** to a comment | Never called |
| `social-tick` **publishing** | The one live post was published by hand, not by the timer |
| `campaigns-tick` **sending** | Only the "too late, send nothing" path has been exercised |

The scheduler distinction matters most: it has been proven to **refuse** a stale campaign, never
to **send** a fresh one. Different code paths; only the harmless one has run.

---

## Appendix — what "coordinates" are for

`orders.delivery_lat` / `delivery_lng`. An address is text; a route needs numbers. Without them:

- **Route optimisation** cannot order the stops, so drivers get an unordered list
- **Driven miles** cannot be computed, and driver pay uses miles
- **Distance/ETA** for "driver is approaching" has nothing to measure against

Every new order geocodes on checkout now that the Google key works. Historic orders do not fix
themselves — nothing re-geocodes an order after the fact, which is why the backfill exists.
