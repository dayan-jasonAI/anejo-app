-- Owner-supplied HTML email templates for campaigns.
--
-- `body` has always held plain text that the sender escaped and wrapped in the Añejo shell. A
-- designed template is the opposite: it IS the whole document, shell included, and must not be
-- escaped. Rather than guess from the content (a body that merely starts with '<' is not a
-- reliable signal), the format is recorded explicitly and defaults to the old behaviour, so every
-- campaign already in the table keeps rendering exactly as it did.
ALTER TABLE campaigns ADD COLUMN body_format TEXT NOT NULL DEFAULT 'text';   -- 'text' | 'html'

-- The frozen roster carried only an address, so the recipient's name — which resolveAudience
-- already knows at freeze time — was thrown away. Merge tokens need it at SEND time, and
-- re-resolving the audience mid-send is exactly what freezing the roster exists to prevent.
ALTER TABLE campaign_sends ADD COLUMN name TEXT;
