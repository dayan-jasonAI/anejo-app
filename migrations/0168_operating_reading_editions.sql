-- Private, role-gated read-only localized views. Payloads are imported outside Git.
CREATE TABLE IF NOT EXISTS operating_reading_editions (
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('document', 'recipe')),
  entity_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale = 'es'),
  source_version TEXT,
  source_hash TEXT NOT NULL,
  source_title TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (entity_kind, entity_id, locale)
);
