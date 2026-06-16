-- Añejo HUB — Phase 4b: cost + lead-time so the Ops agent can prepare vendor orders with
-- estimated cost and order-by timing (still approval-only — the owner confirms every order).
-- unit_cost_cents = canonical per-unit price (owner-entered; falls back to last-paid restock
-- cost when blank). staff.lead_time_days = a vendor's typical lead time (owner-entered; falls
-- back to inference from restock history). Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0023_vendor_cost_leadtime.sql

ALTER TABLE inventory_items ADD COLUMN unit_cost_cents INTEGER;  -- canonical per-unit price (cents)
ALTER TABLE staff           ADD COLUMN lead_time_days  INTEGER;  -- vendor typical lead time (days)
