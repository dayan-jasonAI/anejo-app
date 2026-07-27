-- Knowledge base for Creative Studio: manuals, SOPs, DBPR / food-safety documents.
--
-- WHY: studio_context.js injects docs into every system prompt under a fixed char budget
-- (18k brand / 8k SOP) and clampJoin() SILENTLY truncates the overflow. That is fine for one
-- brand brief and catastrophic for a document library — upload 200 pages of DBPR material and
-- ~98% never reaches the model, while the Studio answers food-safety questions with total
-- confidence from the 2% that fit. Retrieval replaces stuffing: we chunk each document, embed
-- the chunks, and pull only the passages relevant to the question being asked.
--
-- Vectors live in Vectorize (binding VECTORIZE); this table holds the text and provenance so a
-- retrieved chunk can be quoted and CITED back to its source document and page.

CREATE TABLE IF NOT EXISTS kb_documents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  source_kind   TEXT NOT NULL DEFAULT 'manual',  -- manual | policy | procedure | dbpr | training | other
  filename      TEXT,
  mime          TEXT,
  bytes         INTEGER,
  r2_key        TEXT,                            -- the original file, kept for re-indexing
  lang          TEXT,                            -- 'en' | 'es' | NULL when mixed/unknown
  authority     TEXT NOT NULL DEFAULT 'internal',-- 'regulatory' outranks 'internal' when they conflict
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  chars         INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | indexing | ready | failed
  error         TEXT,                            -- why it failed, shown in the HUB. Never silent.
  active        INTEGER NOT NULL DEFAULT 1,
  uploaded_by   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id          TEXT PRIMARY KEY,                  -- also the Vectorize vector id
  doc_id      TEXT NOT NULL,
  ord         INTEGER NOT NULL,                  -- position within the document
  heading     TEXT,                              -- nearest markdown heading, for citations
  page        INTEGER,                           -- page number when the converter reported one
  text        TEXT NOT NULL,
  chars       INTEGER NOT NULL,
  embedded    INTEGER NOT NULL DEFAULT 0,        -- 0 = text stored but NOT searchable yet
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id, ord);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedded ON kb_chunks(embedded);
CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status, active);
