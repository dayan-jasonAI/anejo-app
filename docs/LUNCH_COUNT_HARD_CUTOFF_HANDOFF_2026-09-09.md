# Añejo — the lunch count locks at 10:45 AM — Handoff

Date: 2026-09-09
Branch: `claude/anejo-google-reviews-sync-t1m6f1`
Base: `origin/main` at `7f85a46` (the kitchen-count reconcile, PR #61, merged earlier today)
Owner: Claude Code
Status: built and tested, NOT deployed — merging to `main` auto-deploys (Red: production intake +
kitchen path, Dayan approves)

## The decision this implements

Dayan, 2026-09-09: **"Hard cut off on lunch count is 10:45am."**

This is the open question left at the end of the PR #61 handoff — there was no lock on the count,
so an office could raise it at any hour, including after the truck had left. PR #61 made a late
change land *everywhere* instead of only on the invoice. It could not make a change at 11:20
physically possible. This is the other half.

## Two cutoffs, doing different jobs

| | what it is | what happens after it |
|---|---|---|
| `contract_sites.cutoff_time` — **09:00**, per site | a **pricing** rule, already live | the count still goes through, with a rush fee |
| `HARD_CUTOFF_TIME` — **10:45 ET**, business-wide | a **lock**, new here | the intake page cannot move the count at all |

10:45 against an 11:30–12:30 delivery window: late enough for an office to do a real morning head
count, early enough that a change still fits in a tray. One number, so every office can be told
the same thing and every cook can trust it. `hardCutoffMin()` will read a per-site
`hard_cutoff_time` column if one is ever added; nothing sets it today and no migration ships here.

## What happens at 10:45

**The intake page closes.** `siteContext` now returns `count_locked` + `hard_cutoff`, so
`lunch-count.html` stops rendering the form at all past the cutoff. It renders instead: what the
office **is** getting today ("You're getting 23 lunches today"), why it can't be changed, a
tappable **561-567-1047**, and the note that tomorrow reopens overnight. A page that was already
open across the cutoff and submits anyway is switched to the same view by the server's reply — it
never gets an inline error next to a form that can no longer do anything.

**The write is refused before anything moves.** `submitHeadcount` returns
`{ ok:false, locked:true, hard_cutoff, count, requested }` *before* the orders upsert, the bowl
reconcile and the ledger upsert. The order row is not even touched (`updated_at` is unchanged) —
verified by test.

**No verification code is sent.** `processIntake` refuses in the pre-OTP branch too. Texting
somebody a 6-digit code to unlock a refusal is how a security step gets a reputation for being
pointless.

**The request still reaches a human.** This is the part that matters commercially — a refusal
nobody hears is how a client quietly stops being a client:

- An **audit row** (`event: 'locked_out'`) goes on the append-only trail with what they asked for
  and what is on file. Every attempt is kept; it's the same trail that answers "what did they
  actually ask for" six weeks later at invoice time.
- A **`contract_count_locked` alert** reaches the kitchen — **`warning`** when there is a count we
  might stretch, **`critical`** when the site has **no count on file at all**, because then an
  office is expecting lunch and nothing is being made. Deduped per site per day: four taps of the
  submit button is one problem, not four alerts.
- Re-submitting the number we are already building raises **no** alert. A reload is not an ask.

**Dayan is not locked out.** `ownerSetHeadcount` — the Hub's Contracts override, which already
ignores the delivery-day and cutoff rules by design — is untouched. A human agreeing to a late
change on the phone is a different act from a form silently accepting one. Pinned by test.

**The SMS receipt now names the deadline that is actually enforced.** It used to say "Must be in
by 09:00" — a deadline nothing enforced. It now reads "Changes by 09:00 AM please — 10:45 AM at
the latest, then call us" (and the Spanish equivalent), which keeps the incentive to submit early
without lying about the wall.

## Verification

- `test/money/contract-cutoff-lock.test.js` — **19 new tests against real SQLite**: the 10:44/10:45
  boundary, ET vs UTC, nothing downstream moving (ledger, order row, `updated_at`, checklist), the
  refusal payload, the audit row, both alert severities, the quiet re-submit, dedupe across four
  attempts, no OTP and no SMS on the locked path, non-delivery-day precedence, `siteContext`, the
  rendered locked page, the owner override still working, and an in-window raise still landing
  everywhere (PR #61 is not undone).
- **Mutation-checked three ways.** Disabling the lock fails **12 of 19**; changing `>=` to `>` on
  the boundary fails 2; deduping per-count instead of per-day fails 1. They catch the real
  behaviour, not their own construction.
- Full suite: **1965 passing, 1 failing** — `hub-push-vendor.test.js`, which fails identically on
  clean `main` (`ENOENT @block65/webcrypto-web-push/package.json`, not installed in this sandbox).
  Untouched.
- `npx eslint functions test scripts`: 0 errors (2 pre-existing vendor warnings).
  `git diff --check`: clean.
- The locked page was **rendered in a real browser** at 390px in both languages against a stubbed
  `/api/contract/site` — it is the screenshot behaviour above, not an assumption about the markup.
- **Not verified:** live production. Nothing here is deployed.

## For Dayan

1. **This is the deploy decision.** Merging `main` auto-deploys the client-facing intake page and
   the write path behind it.
2. **Tell the offices before it goes live.** Today an office that submits at 11:00 gets a rush fee
   and a lunch; tomorrow it gets a phone number. That is the intended change, but it should not be
   the first they hear of it. The receipt text change helps from the first order after deploy.
3. **You will get alerts you did not used to get.** Every refused late change pings the kitchen.
   That is the point — but if Pompano tries this three days a week, the alert is telling you the
   cutoff is in the wrong place for them, not that the alert is noisy.
4. **Still one number for everyone.** If a site with a later delivery window needs a later lock,
   that is a column and a small migration, not a rewrite — say the word.

## Files

- Read: `functions/_lib/contract.js`, `functions/_lib/alerts.js`, `functions/_lib/push-message.js`,
  `functions/_lib/twilio.js`, `functions/_lib/orderbowls.js`, `functions/api/contract/headcount.js`,
  `functions/api/contract/site.js`, `public/lunch-count.html`,
  `migrations/0026_contract_accounts.sql`, `migrations/0030_contract_nonrepudiation.sql`,
  `test/money/contract-count-change.test.js`, `test/money/contract-staff-roster.test.js`,
  `test/money/catering-outbox-fixture.js`, `public/hub/owner/contracts.html`.
- Created: `test/money/contract-cutoff-lock.test.js`, this handoff.
- Modified: `functions/_lib/contract.js`, `functions/_lib/alerts.js`,
  `functions/_lib/push-message.js`, `public/lunch-count.html`.
