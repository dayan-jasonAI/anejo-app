# $10 menu, navigation and corporate ordering — October 1, 2026

Authorization: Dayan's direct chat request to align homepage navigation, highlight the daily-lunch link, add supplied lunch images to slideshow, introduce a separate exact-$10 category and enable fifty-meal office ordering. Existing release authorization applies after checks. Source prices remain D1 authority.

Changes: centered navigation against wordmark; gold daily-lunch navigation highlight; four supplied lunch photographs converted to WebP and added to slideshow; separate $10 Menu category filters individual SKU prices at exactly1000 cents, retaining IDs and server pricing. Four daily meal cards display actual dated availability, with unavailable items directing to corporate quote intake. $10 Menu links added to menu and catering. Daily lunch remains first. Fifty-meal shortcut and max50 enforced by server/API/UI. Larger orders link to catering quote.

Observed local browser evidence: nav label center36px and wordmark center35.996px; all four new photos loaded; nine slideshow frames; no desktop horizontal overflow. $10 category displays four daily products. Phone390px viewport displays four cards without horizontal overflow. Fifty-meal shortcut changes only quantity; Continue places qty50 in cart with subtotal500, fee0, estimated tax35, estimated total535. No payment or customer notification sent.

Acceptance tests: actual checkout handler with mocked Square verifies quantity50, server unit1000 cents, zero delivery and durable kitchen ticket. Exact-price test excludes12/9.99/NaN variants. Browser tests verify deliberate team shortcut. Full test and release results recorded after completion.

Pending facts: Dayan confirmed corporate buyers may choose any lunch with advance notice. Exact lead time and whether mixed selections are allowed await reply. This release offers self-service featured-date lunch up to50 and quote inquiry for unscheduled/custom corporate selections. It does not enable an unspecified lead-time policy. Mileage fees/maxradius/cityZIP likewise remain pending from earlier task.

Risk/limitation: browser cart and mock-provider evidence do not establish a completed real payment, fulfilment or revenue. Existing earlier live Square payment-screen acceptance is documented in LUNCH_PREMIUM_RELEASE_2026-10-01.md. No changes to credentials or payment settings.
