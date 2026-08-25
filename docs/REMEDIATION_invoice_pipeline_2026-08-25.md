# Añejo Hub — invoice pipeline remediation plan

**Written:** 2026-08-25 · **Author:** Claude (architecture/documentation)
**Status:** proposal. NOTHING IN HERE HAS BEEN APPLIED. Needs Dayan's approval per item.
**Trigger:** the DGP-0004 incident of 2026-08-25 — an invoice reached a live
customer while the written record said the opposite, and the owner had no copy,
no delivery record, and no audit event to check.

## How to read this

Every finding below is grounded in a file and line, or in a row from the live
`anejo` D1 database. Nothing is inferred from the narrative record — that record
was itself wrong for eleven days, which is part of what this document is fixing.

Severity is by **money and customer trust**, not by engineering interest.

---

## P0-1 — The invoice email undercuts the direct-deposit rail

**Evidence.** `contract_invoices.payment_link_url` for `DGP-0004` is
`https://checkout.square.site/merchant/MLQA5G7HKGK6H/order/EmSxPJNcRQlrjyyDWCTZpHAMkxcZY`.
`sendInvoiceEmail` (contracts.js:335-341) creates a Square payment link for any
unpaid invoice and `invoiceEmailHtml` renders a **"Pay $1,668.00 now"** button.

**Why it matters.** Añejo just completed a vendor registration whose entire
purpose was to get DGP paying by **direct deposit** to the LLC. The 8/25 email
to Roxana says so in writing. The invoice she received the same afternoon offers
her a card checkout button instead. If she uses it: Square takes roughly 2.6-2.9%
(~$45 on this invoice), the money lands in Square rather than the account on the
direct-deposit authorization, and the vendor rail that took two weeks to set up
goes unused on its first invoice.

**Fix.** Make the pay button **opt-in per account**, not automatic.
Add `contract_accounts.allow_card_payment` (default 0). In `sendInvoiceEmail`,
only mint/render `payUrl` when that flag is set. Contract accounts on direct
deposit stay off; ad-hoc and consumer accounts can turn it on.

---

## P0-2 — The owner gets no copy of anything the hub sends a customer

**Evidence.** `_lib/email.js:56` — `const body = { from, to: [to], subject, html };`
No `bcc`. No archive. Nothing is written to D1 beyond `sent_to`.

**Why it matters.** On 8/25 an invoice went to DGP and Dayan could not see what
she was looking at, could not forward it, and had to open a third-party dashboard
to learn whether it arrived. The owner is structurally blind to his own
outbound customer mail. This is also *why* the written record drifted: there was
no artefact in the inbox to reconcile against.

**Fix.** Add an owner BCC on customer-facing sends.
`if (env.OWNER_BCC) body.bcc = [env.OWNER_BCC];` — set per-call in
`sendInvoiceEmail` rather than globally in `sendEmail`, so routine transactional
mail (order confirmations, magic links) does not flood the inbox.

---

## P0-3 — Invoice numbers burn on every void

**Evidence.** `_lib/contract.js:947` — `SELECT COUNT(*) ... ` then `seq = n + 1`.
`voidInvoice` leaves voided rows in place (correct for audit), so each void
permanently consumes a number.

**Why it matters.** DGP's second real invoice was numbered `DGP-0004`. The
customer's file now shows `DGP-0001` then `DGP-0004` with a two-number gap that
a payables department will query, and that had to be explained in writing.

**Fix.** Derive from the highest number issued, not the row count:

```js
const c = await env.DB.prepare(
  "SELECT MAX(CAST(substr(number, instr(number,'-')+1) AS INTEGER)) AS n " +
  'FROM contract_invoices WHERE account_id = ?'
).bind(accountId).first();
seq = (Number(c && c.n) || 0) + 1;
```

Gaps still appear when a void is the most recent invoice, but numbers stay
monotonic and are never reused. **Never reuse a number** — two documents sharing
one is materially worse than a gap.

---

## P1-1 — The four money events are the only ones not logged

**Evidence.** `capture()` fires in contracts.js for `contract.account_created`
(:455), `contract.site_added` (:535) and `contract.billing_contact_set` (:621).
It does **not** fire for invoice **generated**, **sent**, **paid**, or **voided**.
Confirmed against `activity_log`: the 8/25 window contains `dashboard.viewed`
entries either side of 2:48 PM and no record of the invoice send between them.

**Why it matters.** The events that move money leave no trace, while page views
do. Reconstructing 8/25 required querying `contract_invoices` directly and
reading Resend. There is no answer to "what did we send this customer, when, and
who clicked the button" without a DB dump.

**Fix.** `capture()` on all four, with `account_id`, `invoice_id`, `number`,
`total_cents`, and for sends the `sent_to` domain (not the full address).

---

## P1-2 — Delivery is unprovable inside the app

**Evidence.** `sendEmail` returns `r.json()` — Resend's response, containing the
message `id`. Every caller discards it. Nothing persists it.

**Why it matters.** Confirming DGP-0004 arrived meant leaving the product and
searching a third-party dashboard by recipient and timestamp, because there was
no message id to look up.

**Fix.** Add `contract_invoices.resend_message_id` alongside `sent_at`/`sent_to`
and store the returned id. Optionally register Resend's `delivered` /`bounced`
webhook and record the terminal state.

---

## P1-3 — Changing who gets invoiced is not auditable

**Evidence.** `set_billing` (contracts.js:600-626) writes the new
`billing_email` and captures only `{ account_id, has_email: !!email }` — a
boolean. The previous value is overwritten with no before/after record.

**Why it matters.** `acct_dgp.billing_email` changed from the owner's own address
to the customer's between 8/14 and 8/25. That single change is what turned
"generate an invoice" from a private act into a customer-facing one, and there
is no record of when it happened or who made it. The 8/14 invoice went to the
owner; the 8/25 invoice went to the client; nothing in the system marks the
moment the meaning of the Send button changed.

**Fix.** Log `before`/`after` values on `set_billing` (the codebase already has
this pattern — see the `before`/`after` audit call at contracts.js:533), and
surface the current billing email on the invoice screen, not just in a form field.

---

## P2-1 — The send guard does not distinguish routine from first-contact

**Evidence.** `public/hub/owner/invoice.html:105` —
`window.confirm('Email invoice '+number+' to '+to+'?')`. A guard exists and it
does name the recipient. That is better than nothing, and it fired on 8/25.

**Why it matters.** It is the same one-line dialog whether you are re-sending to
an address that has received ten invoices or emailing a brand-new client contact
for the first time. Browser `confirm()` is muscle-memory-dismissed. The 8/25 send
was not a bug — the system asked and got a yes — it was a guard too weak for the
consequence.

**Fix.** Escalate only the risky case: when `to` has never appeared in
`contract_invoices.sent_to` for that account, show an inline warning panel
("This is the first invoice ever sent to accounting@… — it will reach the
customer") requiring a deliberate second click, rather than a `confirm()`.
Leave routine re-sends as they are.

---

## P2-2 — Void invoices are not visually disarmed

Voided rows keep their number and sit in the same list. Any total computed over
the account is wrong unless it filters `status != 'void'`. The written record
carried a voided $1,806 invoice as a live receivable for eleven days.

**Fix.** Strike-through + a VOID chip in the list; exclude voids from every
total; and make the printable page stamp VOID across the document the way the
paid state already stamps PAID.

## P2-3 — There is no "send me a test copy"

Nothing lets the owner see the rendered invoice email before a customer does.
A `send_invoice` with `to` forced to the owner would cost one line and would
have surfaced the Square pay-button conflict (P0-1) before it shipped.

---

## P3 — Payment recorded outside the system

`markInvoicePaid` records `paid_at`/`paid_by`/`paid_ref` but has no concept of
**who received the money**. Hub `DGP-0003` ($1,686) was paid — into Arianne's
account, not Añejo's. There is no way to record that, so the row still reads
`open` and the books cannot be reconciled from the hub.

**Fix.** Add `paid_channel` (direct_deposit | card | check | third_party) and
`paid_to` free-text. A payment that landed with a third party is a real state
this business has been in twice and cannot currently express.

---

## Suggested order

1. **P0-1** (pay link) — before DGP pays the wrong way. Highest cash impact.
2. **P0-2** (owner BCC) — one line, restores visibility immediately.
3. **P1-1 / P1-2** (audit events + message id) — makes the next incident
   diagnosable inside the product.
4. **P0-3** (numbering) — cosmetic to us, but it is customer-visible.
5. **P1-3, P2, P3** as capacity allows.

P0-1 and P0-2 are each a handful of lines and are the two that would have
prevented or immediately exposed the 8/25 incident.

## Handoff

Same repo, separate branch, per the collaboration rule. No file in
`functions/` or `public/` has been modified by this analysis — this document
and `KNOWN_ISSUES_invoice_numbering.md` are the only artefacts. Codex should not
begin on any item here without Dayan's explicit go-ahead on that item.
