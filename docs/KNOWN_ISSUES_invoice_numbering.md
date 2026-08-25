# Known issue — contract invoice numbers skip on every void

**Logged:** 2026-08-25 · **Status:** open, not fixed (logged at owner's instruction)
**Severity:** medium — cosmetic to us, confusing to the customer's payables dept.

## Symptom

DGP's second real invoice was numbered `DGP-0004`. The customer has only ever
received two invoices, so her records show `DGP-0001` and `DGP-0004` with an
apparent two-invoice gap.

## Cause

`functions/_lib/contract.js:947`

```js
const c = await env.DB.prepare(
  'SELECT COUNT(*) AS n FROM contract_invoices WHERE account_id = ?'
).bind(accountId).first();
seq = (Number(c && c.n) || 0) + 1;
```

The sequence is `COUNT(*) + 1` over **all** rows for the account, voids included.
`voidInvoice` (functions/api/hub/owner/contracts.js) leaves the voided row in
place by design — correct for audit, but it permanently burns a number.
Two voids on acct_dgp (2026-08-14) is exactly why the next live invoice
became 0004 rather than 0002.

## Actual state of acct_dgp at time of logging

| Number | Period | Total | Status | Sent to |
|---|---|---|---|---|
| DGP-0001 | 2026-07-27 – 08-12 | $2,670.00 | void | never sent |
| DGP-0002 | 2026-07-27 – 08-05 | $1,806.00 | void | dayan@dayanrealtyhub.com (8/14) |
| DGP-0003 | 2026-07-27 – 08-05 | $1,686.00 | open | never sent from hub |
| DGP-0004 | 2026-08-10 – 08-19 | $1,668.00 | sent | accounting@dgphealthandwellness.com (8/25 2:48 PM ET) |

Note the divergence: the PDF the customer holds labelled "DGP-0001" ($1,686)
is in fact hub row `DGP-0003` (inv_016b21ab6f360476347c) — it was sent by hand
on 8/12 after the hub had already voided its own 0001 and 0002.

## Proposed fix (NOT applied — needs owner approval)

Derive the sequence from the highest number already issued rather than a row
count, so a void no longer consumes a number:

```js
const c = await env.DB.prepare(
  "SELECT MAX(CAST(substr(number, instr(number,'-')+1) AS INTEGER)) AS n " +
  'FROM contract_invoices WHERE account_id = ?'
).bind(accountId).first();
seq = (Number(c && c.n) || 0) + 1;
```

This keeps numbers monotonic and never reuses one (reuse would be worse than a
gap — two documents sharing a number is what actually stalls a payables dept).
It does not retroactively renumber existing rows.

## Related

- Resend message IDs are discarded by `sendEmail` (functions/_lib/email.js:79),
  so there is no delivery receipt stored anywhere in D1. Confirming whether a
  customer received an invoice requires the Resend dashboard. Worth storing
  `resend_message_id` on `contract_invoices` alongside `sent_at`/`sent_to`.
- `contract_accounts.billing_email` for acct_dgp changed from the owner's own
  address to the customer's between 8/14 and 8/25. Any invoice generated in the
  hub now emails the customer directly on send.

## Second issue — the owner never gets a copy of what was sent

`sendEmail` builds `body = { from, to: [to], subject, html }` (functions/_lib/email.js:56).
There is no `bcc`, and no copy is written anywhere. When an invoice goes to a
customer, the owner has no record of the document that left the building — he
cannot see what the client is looking at, cannot forward it, and finds out only
by asking the customer or opening the Resend dashboard.

Confirmed live 2026-08-25: DGP-0004 was delivered to the customer (verified in
Resend) and the owner received nothing.

**Proposed:** add the owner address as `bcc` on customer-facing invoice sends,
e.g. `if (env.OWNER_BCC) body.bcc = [env.OWNER_BCC];` in `sendEmail`, or set it
per-call in `sendInvoiceEmail` so only invoices (not every transactional mail)
copy the owner. Also worth persisting Resend's returned `id` so delivery can be
audited without leaving the app.

NOT applied — needs owner approval.
