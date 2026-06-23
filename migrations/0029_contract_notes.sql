-- Añejo — per-day allergies/special notes on contract head-count submissions. The office
-- contact can flag allergies/dietary needs with each day's count; it reaches the kitchen
-- (order delivery_notes) and shows in the office's monthly history. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0029_contract_notes.sql

ALTER TABLE contract_orders ADD COLUMN notes TEXT;
