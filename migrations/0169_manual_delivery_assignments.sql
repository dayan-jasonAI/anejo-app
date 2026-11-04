-- Owner-selected drivers stay assigned until they respond or the owner changes the assignment.
-- Existing routes retain the legacy automatic-offer behavior; no historical intent is invented.
ALTER TABLE routes ADD COLUMN dispatch_mode TEXT NOT NULL DEFAULT 'automatic';
