# Catering quote editing and delivery fees

A request that already has an active quote previously offered a new-quote action, making it easy to create a second checkout while trying to edit. The owner desk now opens an existing revision, asks which quote to edit when there are multiple, and exposes an explicit Save changes action after the updated preview.

Manual delivery/setup fees are separate from food, included in the grand total and deposit, and rendered consistently in the email and hosted quote. Blank means unconfirmed; zero explicitly means free. Existing paid bookings are not editable through this path.

Initial owner checkout creation has a durable identity and a reconciliation fence for ambiguous outcomes. Duplicate retirement verifies the retained checkout, verifies cancellation of the obsolete unpaid checkout, preserves history, and resolves old hosted links to the retained offer. It never sends or charges. A separate additive journal permits several obsolete quotes to resolve to one current quote without rewriting revision history. Pending reconciliation blocks edits, sends, and reminders.

Migration: apply only migrations/0154_catering_quote_creation_claim.sql before the dependent release. Do not bulk-apply historical migration bookkeeping. Rollback may retain these additive tables; payment reconciliation records must not be removed.

Validation and production acceptance evidence are recorded privately outside this public repository. A passing local suite does not establish deployment or successful customer payment.
