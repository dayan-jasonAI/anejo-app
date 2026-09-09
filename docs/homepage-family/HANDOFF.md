# Añejo homepage family release — 2026-09-09

Authorized by Dayan's request to give Catering, Traditional and Fit equal visual prominence and optimize the live site.

## Changes
Three prominent photo navigation tiles replace the small full-menu link and obsolete brand-architecture cards. Dedicated Traditional and Catering sections link into the grouped ordering categories and product customizers. Cajita photography and builder remain in a dedicated section. The macro calculator and story follow the shopping sections. Metadata describes the full offering. New copy includes Spanish translations. Existing checkout, pricing authority, payments and forms are unchanged.

## Research applied
- National Restaurant Association, Off-Premises Restaurant Trends 2025: intuitive ordering/payment and value support repeat business. https://restaurant.org/research-and-media/research/research-reports/off-premises-restaurant-trends-2025/
- ezCater, How to create a catering menu your business customers will love (2026): clear group formats, trays vs individual packaging, and legible menu choices. https://www.ezcater.com/lunchrush/restaurant/how-to-design-a-restaurant-catering-menu/

Application: visible choices by occasion, clear order/quote paths, product photos, direct category and product links. No unsupported discounts, scarcity, ratings or revenue promises introduced.

## Validation and measurement
Existing 1,902 tests passed before final copy additions; deploy runs full suite again. Lint has zero errors and two existing vendor warnings. Browser evidence covers desktop 1440px and mobile 390px, images, local anchors and overflow. No test purchases or form submissions.

Analytics measurement ID remains unconfigured; do not claim visitor conversion tracking is active. Compare paid orders, average order value, repeat orders and catering requests weekly; traffic-to-order conversion requires consented visitor analytics and a baseline. Sales lift is a hypothesis, not a verified outcome.

## Published verification
Production source 47d72b9 verified through authenticated Wrangler deployment listing (production deployment ed5b2d17-cd9f-4d3c-8ee1-45ca2422a4bb). Public homepage HTTP 200: three family tiles, Traditional/Catering/Cajita sections present, obsolete link absent, catering photo HTTP 200. Full predeploy suite: 1,902 passed, zero failed. Final browser checks: no missing images, invalid section anchors or horizontal overflow at either viewport.

The environment-variable postdeploy verifier skipped; authenticated Wrangler and public HTTP checks independently verified deployment. Unrelated optional contract DB checks were not run. No approval is pending for this authorized release. Visitor analytics configuration is the remaining measurement limitation, not a release blocker. Next: establish a conversion baseline before attributing revenue changes.
