-- Añejo HUB — Phase 5: doc images, thread close, recurring reminders. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0010_phase5.sql

ALTER TABLE docs    ADD COLUMN image_key TEXT;            -- R2 key for an attached image (manuals/recipes)
ALTER TABLE threads ADD COLUMN closed_at INTEGER;        -- set when status flips to 'closed'

-- Recurring reminders: a template row (is_template=1, recurrence JSON) spawns daily instances.
ALTER TABLE reminders ADD COLUMN is_template INTEGER DEFAULT 0;
ALTER TABLE reminders ADD COLUMN parent_id TEXT;                  -- instance → its template
ALTER TABLE reminders ADD COLUMN last_materialized_date TEXT;     -- template: last YYYY-MM-DD it spawned
CREATE INDEX IF NOT EXISTS idx_reminders_template ON reminders(is_template);
