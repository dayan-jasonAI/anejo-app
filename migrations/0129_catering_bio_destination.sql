-- Preserve the tracked link identity and campaign history. Do not override an owner-customized
-- or inactive destination. Reapplying is a no-op once the legacy destination is gone.
UPDATE tracked_links
SET dest_url='/catering#quote', updated_at=CAST(strftime('%s','now') AS INTEGER)*1000
WHERE code='ig-catering' AND active=1 AND dest_url='/#tasting';
