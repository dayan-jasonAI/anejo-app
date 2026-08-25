# HANDOFF — Añejo Hub invoice pipeline fixes

**From:** Claude (Cowork session, 2026-08-25) · **To:** Claude Code
**Repo:** `anejo-app` (Cloudflare Pages, git-connected `dayan-jasonAI/anejo-app`)
**Branch:** create `fix/invoice-pipeline-guardrails` off `main`. Do NOT work on `main`.
**Approval state:** Dayan has seen the analysis. He has NOT yet approved any code
change. Ask before the first commit. Do not deploy.

---

## Read these first

1. `docs/REMEDIATION_invoice_pipeline_2026-08-25.md` — the full findings with
   evidence. This handoff is the executable subset.
2. `docs/KNOWN_ISSUES_invoice_numbering.md` — the numbering bug in detail.
3. `CLAUDE.md` — repo conventions. **The store is live and charges real cards.**

## What happened (why this work exists)

On 2026-08-25 an invoice (`DGP-0004`, $1,668) was emailed to a live customer,
DGP Health & Wellness. Nothing malfunctioned — the owner clicked Send and the
confirm dialog fired. The problems were everything around it:

- He had no copy of what was sent and had to check Resend to learn it arrived.
- The email carried a Square "Pay now" button that contradicts the direct-deposit
  vendor agreement signed with that customer two weeks earlier.
- No audit event was written, so reconstructing the event needed direct D1 queries.
- The invoice was numbered `DGP-0004` when the customer has only ever received
  two, because voided invoices consume numbers.

The project's written record was wrong about all of it for eleven days.

## Ground truth (verified 2026-08-25, do not re-derive from notes)

D1 database `anejo` = `d5ca11c7-7b44-4560-919d-b6210753d182`, table `contract_invoices`:

| number | period | total | status | sent_to |
|---|---|---|---|---|
| DGP-0001 | 07-27→08-12 | $2,670 | void | — |
| DGP-0002 | 07-27→08-05 | $1,806 | void | dayan@dayanrealtyhub.com |
| DGP-0003 | 07-27→08-05 | $1,686 | open (actually PAID, to a third party) | — |
| DGP-0004 | 08-10→08-19 | $1,668 | sent | accounting@dgphealthandwellness.com |

---

## TASK 1 — Card payment link becomes opt-in per account  (P0, do first)

**Problem.** `sendInvoiceEmail` (`functions/api/hub/owner/contracts.js` ~:335)
mints a Square payment link for every unpaid invoice, and `invoiceEmailHtml`
(~:296) renders a "Pay $X now" button. Contract accounts on direct deposit must
not be offered card checkout — it costs ~2.7% and bypasses the agreed rail.

**Change.**
1. New migration `migrations/0095_contract_account_card_payment.sql`:
   `ALTER TABLE contract_accounts ADD COLUMN allow_card_payment INTEGER DEFAULT 0;`
   (Latest existing migration is `0094`. Confirm before numbering.)
2. In `sendInvoiceEmail`, load `allow_card_payment` with the rest of the account
   row and only create/pass `payUrl` when it is truthy.
3. `invoiceEmailHtml` already omits the button when `payUrl` is falsy — verify,
   don't duplicate the condition.
4. Owner UI: a checkbox on the account/billing screen, default OFF, labelled so
   it is obvious it puts a card button in front of the client.

**Acceptance.**
- An account with `allow_card_payment = 0` produces an invoice email with no pay
  button and no Square link minted (assert no `createInvoicePaymentLink` call).
- An account with it set to 1 behaves exactly as today.
- Existing rows default to 0 — **no account silently keeps the button**.
- `contract_invoices.payment_link_url` already populated on old rows is left
  alone; do not backfill or null it.

---

## TASK 2 — Owner BCC on customer-facing invoice sends  (P0)

**Problem.** `functions/_lib/email.js:56` builds `{ from, to, subject, html }`.
No BCC, no archive. The owner cannot see his own outbound customer mail.

**Change.** Add optional `bcc` support to `sendEmail`, and pass the owner address
**only from `sendInvoiceEmail`** — not globally. Order confirmations and magic
links must not start copying the owner.
- Read the address from `env.OWNER_BCC`; if unset, behave exactly as today.
- Document the new var in `wrangler.toml` comments and `PROVISIONING.md`.
- The value is set in the Pages dashboard. **Never commit it.**

**Acceptance.**
- With `OWNER_BCC` set, an invoice send includes it in `bcc`; nothing else does.
- With it unset, the request body is byte-identical to today's.
- A suppressed *primary* recipient still short-circuits before send (existing
  behaviour at `email.js:52-55` must not regress).

---

## TASK 3 — Audit the four money events  (P1)

**Problem.** `capture()` fires for `contract.account_created` (:455),
`contract.site_added` (:535), `contract.billing_contact_set` (:621) — but not
for invoice generated, sent, paid, or voided. Page views are audited; money is not.

**Change.** Add `capture()` to `generateInvoice` result handling, `sendInvoiceEmail`,
`markInvoicePaid`, `voidInvoice`. Events:
`contract.invoice_generated | _sent | _paid | _voided`.
Properties: `account_id`, `invoice_id`, `number`, `total_cents`, plus for sends
the **domain only** of `sent_to` (never the full address — these land in analytics).

Also extend `set_billing` to log before/after `billing_email`. The existing
before/after audit pattern is at contracts.js:533 — reuse it, don't invent one.

**Acceptance.** Each of the four ops emits exactly one event on success and none
on failure. No PII beyond a domain in any property.

---

## TASK 4 — Persist the Resend message id  (P1)

**Problem.** `sendEmail` returns Resend's JSON containing `id`; every caller drops
it. Delivery can only be proven by leaving the product.

**Change.** Migration adds `contract_invoices.resend_message_id TEXT`. Store the
returned id in the same UPDATE that writes `sent_at`/`sent_to`. Surface it on the
owner invoice page. Keep the existing schema-missing fallback path intact —
`sendInvoiceEmail` already degrades gracefully when columns are absent; preserve that.

---

## TASK 5 — Invoice numbering no longer burns on void  (P0-cosmetic)

**Problem.** `functions/_lib/contract.js:947` uses `COUNT(*)` including voids.

**Change.**
```js
const c = await env.DB.prepare(
  "SELECT MAX(CAST(substr(number, instr(number,'-')+1) AS INTEGER)) AS n " +
  'FROM contract_invoices WHERE account_id = ?'
).bind(accountId).first();
seq = (Number(c && c.n) || 0) + 1;
```
**Do NOT renumber existing rows.** DGP-0004 is in a customer's payables system;
Dayan decided on 8/25 not to renumber. Numbers must stay monotonic and must never
be reused — a duplicate number is worse than a gap.

**Acceptance.** With rows 0001(void), 0002(void), 0003, 0004 the next number is
`DGP-0005`. Prefix derivation from account name is unchanged.

---

## TASK 6 — First-contact send warning  (P2, optional this pass)

`public/hub/owner/invoice.html:105` already confirms with the recipient named,
and it fired correctly on 8/25. Do not add friction to routine re-sends.
Escalate only when `to` has never appeared in `contract_invoices.sent_to` for
that account: show an inline warning panel requiring a deliberate second click.

## TASK 7 — Void invoices visually disarmed  (P2, optional this pass)

Voided rows keep their number and sit in the same list; totals computed over an
account are wrong unless they filter `status != 'void'`. Add a VOID chip and
strike-through, exclude voids from every total, stamp VOID on the printable page
the way PAID is already stamped.

## TASK 8 — Record who received the money  (P3, needs a product decision — ASK)

`markInvoicePaid` has no concept of *who* was paid. Hub `DGP-0003` ($1,686) was
paid into Arianne's account, not Añejo's, so the row still reads `open` and the
books cannot be reconciled from the hub. Proposed: `paid_channel`
(direct_deposit | card | check | third_party) + `paid_to`. **Do not implement
without asking Dayan** — it touches how revenue is attributed.

---

## Working rules for this branch

- **Branch:** `fix/invoice-pipeline-guardrails`. Never commit to `main`.
- **Tests:** `npm test` must pass. Money-path changes belong in `test/money/`.
  Add coverage for Tasks 1, 2 and 5 — each is a regression that already cost real
  money or credibility once.
- **Lint:** `npm run lint` (eslint over `functions test scripts`).
- **Deploy:** DO NOT. Not in this pass, not `npm run deploy`, not
  `npx wrangler pages deploy`. Dayan deploys. The store is live and charges real
  cards; a push to `main` auto-deploys.
- **Migrations:** additive only (`ALTER TABLE ... ADD COLUMN` with defaults).
  No backfills, no data rewrites, no touching existing `contract_invoices` rows.
  Confirm the highest existing migration number before you pick the next one.
- **Secrets:** `OWNER_BCC` and everything like it go in the Pages dashboard.
  Never commit a value.
- **Do not touch:** the kitchen payment gate, or anything guarded by invariant
  **I27** in `mission-control-mvp/executor/verify-invariants.mjs`. Nothing here
  should go near order status.
- **Handoff log:** append what you changed to
  `_AI_COLLABORATION_COMMAND_CENTER/executor/CLAUDE_HANDOFF_RUNNER_LOG.md`
  before finishing, per the no-overwrite collaboration rule.

## Suggested order

1, 2 → 3, 4 → 5. Tasks 1 and 2 are a handful of lines each and are the two that
would have prevented or immediately exposed the 8/25 incident. 6, 7 if there is
room. 8 only after Dayan answers.

## Open questions for Dayan (do not guess)

- What address should `OWNER_BCC` be — `dayan@anejocateringco.com` or the realty
  inbox? (Entity rule says the Añejo address.)
- Should `allow_card_payment` be ON for any existing account, or off everywhere?
- Task 8: how should a payment received by a third party be represented?
