-- Saved templates, and sending a campaign at a time nobody has to be awake for.

-- A template is a REUSABLE body, not a campaign: no segment, no status, no roster, no send
-- history. Keeping them in their own table means loading one can never drag a previous send's
-- audience or counters along with it.
CREATE TABLE IF NOT EXISTS campaign_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'email',   -- 'email' | 'sms'
  subject     TEXT,                            -- remembered with the template: the subject is part of the design
  body        TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'html',    -- 'text' | 'html'
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
-- Unique per channel, so saving under a name you already used UPDATES that template rather than
-- silently growing a second "Founders 8am" you then have to tell apart in a dropdown.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_templates_name ON campaign_templates (channel, name);

-- When a scheduled campaign should go out (epoch ms, UTC). NULL for everything that sends by hand.
ALTER TABLE campaigns ADD COLUMN scheduled_at INTEGER;

-- Why a schedule did NOT fire. A campaign that missed its window is not a failure to retry
-- quietly at whatever hour the scheduler recovers — "order by 10 AM" landing at 6 PM is worse
-- than not landing. The reason is kept so the HUB can say what happened instead of showing a
-- draft that mysteriously un-scheduled itself.
ALTER TABLE campaigns ADD COLUMN schedule_note TEXT;

-- The sweep is "scheduled, and due" — the same shape as the index social_posts already has.
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns (status, scheduled_at);
