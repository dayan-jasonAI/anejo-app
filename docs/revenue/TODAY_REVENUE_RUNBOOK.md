# Añejo — same-day revenue runbook

**Staged 2026-08-04. Nothing in this folder has been sent.** Every artifact here is a draft
written to be pasted into the HUB by the owner. The send is Dayan's tap, per the standing law.

Why Añejo and not the other two: it is the only business currently taking money. Store is live
(`SQUARE_ENV=production`, DBPR granted 2026-07-21), and the last 7 days were **7 orders /
$1,021.82** (`dmd-ops/_AI_COLLABORATION_COMMAND_CENTER/ANEJO_STATUS.json`). The payment rail is
proven. The gap is that the broadcast desk that ships with this repo has apparently never been
fired at the warmest list the business will ever have.

---

## 0. PREFLIGHT — one blocking item, do this first

**Set the campaign postal address.** HUB → Marketing → Settings (`/hub/owner/marketing-settings.html`),
key `campaign.postal_address`.

This is not optional and it is not cosmetic. `functions/api/hub/owner/campaigns.js` falls back to
`Añejo Catering Co. · Palm Beach County, FL` when the setting is empty — and the file says why
that fallback is wrong: *a service area is not a postal address, so it does not satisfy CAN-SPAM.*
The same domain carries receipts and magic links; a bulk send with a defective footer puts those
at risk too.

⚠️ **Do not resolve this with the commissary street address.** `CLAUDE.md` forbids publishing the
kitchen address until the lease + license land, and a marketing footer is publishing. Use a PO box
or a private mailbox — that satisfies CAN-SPAM and keeps the guardrail intact. If neither exists
yet, getting one is the single blocking errand for this whole plan.

---

## 1. Mint the 48-hour campaign code

HUB → Partners (`/hub/owner/partners.html`) → mint a code.
The endpoint is `POST /api/hub/owner/partners` with `op:'create_code'`. Exact body in
[`promo-code-config.json`](./promo-code-config.json).

`kind:'campaign'` is the shareable, no-partner code kind — `evaluatePromo` treats it as
*"owner-minted general code, shareable on purpose; the only limits are `expires_at` / `max_uses`"*.
That is exactly the honest-urgency lever the conversion playbook calls for: the deadline is real
because the code actually expires.

Correction worth recording: there is **no generic "promo" admin page**. Codes are minted from the
Partners desk. `/api/promo-check` is the customer-facing validator only.

## 2. Load the draft and send it to yourself first

HUB → Marketing → Create → Email (`/hub/owner/marketing.html#create-email`).
`campaigns.html` is now a redirect stub; the desk moved under Marketing in the 2026-08-04
consolidation.

- **New campaign** → paste the subject and body from
  [`campaign-01-launch-list.md`](./campaign-01-launch-list.md)
- Segment: **`launch_list`** · Channel: **email** · Format: **text**
- Set your own address in `campaign.test_recipients`, switch the segment to **`test`**, and send.

The `test` segment exists precisely for this — it is the only segment that does not consult
marketing consent, because you do not need your own permission to email yourself. Read it on your
phone. Check the footer rendered a real address.

## 3. Preview the real segment before you send it

Switch back to `launch_list` and hit preview. `op:'preview'` reports who the segment resolves to
**and who it excludes and why** (no consent / unsubscribed / no address). If the excluded count is
large, that is information, not a bug — read it before sending, not after.

## 4. Send

Batches of 25, resumable, driven by the page — a big list will take several passes and is designed
to survive a half-finished send. Do not close the tab mid-run.

## 5. Then the second one

[`campaign-02-past-customers.md`](./campaign-02-past-customers.md) goes to `past_customers` and
sells the **weekly plan**, not another one-off bowl order. One conversion to `/subscribe` is worth
more than four single orders and it recurs every week after today. Send it a few hours after the
first, or tomorrow — not back-to-back into overlapping audiences.

---

## Deliberate choices, so a later session doesn't "fix" them

- **Text format, no merge tokens.** `renderCampaign` only runs `renderTemplate` for
  `body_format:'html'` (campaigns.js:100). A text body is passed straight through — so
  `{{first_name}}` in a text campaign would ship those literal braces to the entire list. The
  staged copy therefore contains **no tokens at all**. If you want first-name personalization, it
  requires an HTML template that self-serves both `{{unsubscribe_url}}` and `{{postal_address}}`,
  which is the documented opt-out from the appended footer.
- **Email only, no SMS today.** `_lib/audience.js` reads `marketing_sms_consent` and deliberately
  never falls back to the transactional `sms_consent`, because a promotional text on transactional
  consent is $500–$1,500 per message per recipient under the TCPA. The marketing-consent
  population is likely near zero. Email has a lawful basis via the existing business relationship;
  today's money does not need SMS.
- **The founding benefit is not a discount.** `promo_codes.kind='customer'` is 2x rewards points
  for life, auto-applied at checkout when the member is signed in (`autoCustomerCodeFor`). The
  copy says "already on your account" rather than "here's your code" because that is what the code
  actually does. The 48-hour `campaign` code from step 1 is the separate, percentage-off lever.

## What I could not verify from the repo

These live in D1, not in git. Check them in the HUB before you commit to the plan:

1. **How many addresses `launch_list` and `past_customers` actually resolve to.** The step-3
   preview answers this in one click. Everything above is worth doing at 40 recipients and worth
   doing at 400; it is worth knowing which.
2. **Whether the email provider is configured** — the desk reports `email_ready` / `sms_ready` on load.
3. **Whether `campaign.postal_address` is already set** (see preflight).

If the preview comes back near-empty, tell me and the plan changes — that would make the B2B
office-catering rail (`business.html` → `/api/contract/register`) the better use of the day, even
though it pays later.
