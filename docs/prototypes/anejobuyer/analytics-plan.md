# Añejo Buyer Prototype Analytics Plan

Existing convention: server-side `capture(env, { event, distinct_id, role, actor_type, team, properties })` writes `activity_log` and optionally PostHog using snake_case object.action event names. Browser-origin events currently go through an allowlisted `/api/hub/track` pattern for hub use.

Prototype recommendation: do not instrument production analytics during prototype review. If isolated browser events are later added, namespace them as `prototype_anejobuyer.*` and keep them out of operational dashboards.

## Recommended events

| Requested signal | Event name | Core properties |
|---|---|---|
| Hero CTA click | `prototype_anejobuyer.hero_cta_clicked` | `cta`, `viewport`, `path` |
| Menu viewed | `prototype_anejobuyer.menu_viewed` | `viewport`, `filter` |
| Product viewed | `prototype_anejobuyer.product_viewed` | `product_id`, `price_cents`, `source` |
| Standard path selected | `prototype_anejobuyer.standard_path_selected` | `entry_point` |
| Macro path selected | `prototype_anejobuyer.macro_path_selected` | `entry_point` |
| Macro Portal started | `prototype_anejobuyer.macro_portal_started` | `entry_point` |
| Macro Portal completed | `prototype_anejobuyer.macro_portal_completed` | `plan_tier`, `estimated_bowl_oz` |
| Plan selected | `prototype_anejobuyer.plan_selected` | `plan_tier`, `weekly_cents`, `source` |
| Meal added | `prototype_anejobuyer.meal_added` | `product_id`, `qty`, `price_cents` |
| Cart viewed | `prototype_anejobuyer.cart_viewed` | `item_count`, `subtotal_cents` |
| Checkout started | `prototype_anejobuyer.checkout_started` | `mode`, `subtotal_cents`, `delivery_cents` |
| Checkout completed | `prototype_anejobuyer.checkout_completed` | `prototype_only`, `total_cents` |
| Subscription selected | `prototype_anejobuyer.subscription_selected` | `plan_tier`, `weekly_cents` |
| Skip or pause action | `prototype_anejobuyer.delivery_pause_action` | `action`, `plan_tier` |
| Delivery-area error | `prototype_anejobuyer.delivery_area_error` | `zip`, `reason` |
| Pricing section viewed | `prototype_anejobuyer.pricing_viewed` | `context` |
| FAQ opened | `prototype_anejobuyer.faq_opened` | `question_id` |
| Video played | `prototype_anejobuyer.hero_video_played` | `muted`, `source` |
| Video completed | `prototype_anejobuyer.hero_video_completed` | `duration_ms` |
| SMS CTA clicked | `prototype_anejobuyer.sms_cta_clicked` | `cta` |
| Email CTA clicked | `prototype_anejobuyer.email_cta_clicked` | `cta` |

## Validation notes

- Use `source: "fixture_fallback"` when displaying fallback product/plan prices.
- Never send prototype events as if they were live customer conversions.
- Do not add events to `track-allowlist.js` until owner approves the production event naming and reporting destination.
