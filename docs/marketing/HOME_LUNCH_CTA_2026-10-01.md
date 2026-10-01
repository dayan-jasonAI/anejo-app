# Homepage $10 daily lunch CTA — October 1, 2026

Owner: Codex. Authorization: Dayan's direct request in this chat to add the button underneath the Cajita invitation, wire ordering/payment, and existing authorization to release after checks.

Changes: homepage hero now stacks the Cajita invitation above a $10 daily-lunch link. Brand gold gradient, static glowing border, visible keyboard focus, reduced-motion hover fallback. Spanish label: Pide tu almuerzo diario · $10. Destination /order?category=daily uses the existing guest Square flow.

Validation: 3,400 root tests passed, zero lint errors (11 existing warnings), Functions build passed. Desktop browser verified 56px button, 12px below Cajita, correct destination. At 390px viewport button width346px, height56px, no horizontal overflow. Clicking the CTA opened the daily-lunch category with Papa Añejo and quantity/date controls. Initial Functions command incorrectly specified public as Functions source and failed; corrected no-source-argument command passed.

Payment scope: earlier live acceptance in LUNCH_PREMIUM_RELEASE_2026-10-01.md reached Square with Google Pay/card/Cash App, free group delivery and zero optional tip. This change does not alter checkout/payment logic. No payment made in this acceptance.

Release: PR177 https://github.com/dayan-jasonAI/anejo-app/pull/177. Production verification appended after release.

Remaining unrelated configuration: distance bands, fees, maximum radius and delivery pricing reference city/ZIP still require Dayan's factual input. No pricing assumption introduced.
