-- Owner-editable operating settings.
--
-- The on-demand ordering window lived ONLY in environment variables (ONDEMAND_OPEN_HOUR etc.),
-- which means changing how the business takes orders required a developer, a secret change and a
-- redeploy. That is the wrong home for a decision an owner makes — "we're scheduled-ahead only
-- this week" is an operating choice, not a deployment.
--
-- Generic key/value on purpose: the next setting someone needs should not require a migration.
-- Values are TEXT and parsed by the reader, same as menu_modifier_prices does for cents.
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_by  TEXT,
  updated_at  INTEGER NOT NULL
);
