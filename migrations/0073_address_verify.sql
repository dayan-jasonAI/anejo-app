-- Server-side delivery-address verification at checkout (functions/api/checkout.js).
--
-- A real order once shipped to "10330 City Center Blvb" — a typo for Blvd — and nobody caught
-- it. Checkout now asks Google whether the typed address resolves, WARNS the customer and lets
-- them confirm-anyway rather than hard-blocking (new construction and gated communities are real
-- orders Google has genuinely never heard of), and records the outcome here so the kitchen/driver
-- side can see a pin was never confidently confirmed instead of silently trusting it like a clean
-- match.
--
-- address_verify_status:
--   'verified'             — geocoded cleanly, no partial match, precise enough to trust
--   'unverified_confirmed' — could not be confirmed (not found / corrected / imprecise) and the
--                            customer explicitly said "use this address anyway"
--   'unavailable'          — no key configured, or the provider itself was down/rate-limited/
--                            misconfigured at checkout time — never treated as a bad address
--   NULL                   — orders placed before this column existed
-- address_verify_reason (only set when status='unverified_confirmed'):
--   'not_found' | 'corrected' | 'coarse' — see classifyAddressCheck() in checkout.js
ALTER TABLE orders ADD COLUMN address_verify_status TEXT;
ALTER TABLE orders ADD COLUMN address_verify_reason  TEXT;
