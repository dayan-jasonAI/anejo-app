-- Marketing desk, round two (2026-08-11). Three things the role needed that did not exist.
--
-- 1. TIME TRACE WITHOUT A TIMECLOCK. Dayan: "i don't need her to clock in or out but I do need a
--    time log or time trace of her activity and time actively working in the hub". The kitchen and
--    driver timeclock (`shifts`) is the wrong shape — it is a shift a person starts and ends, tied
--    to hourly food ops, and she is not that. What he actually wants is evidence of engaged time.
--    So: a session opens on its own the first time she touches the desk, and is kept alive by a
--    heartbeat while she is working. ACTIVE seconds are accumulated from those heartbeats, not
--    from (ended - started) — a tab left open overnight must not read as ten hours of work. A
--    heartbeat further apart than IDLE_GAP_MS is treated as her having walked away and contributes
--    nothing. That is the whole difference between a time trace and a lie.
--
-- 2. THE END-OF-SESSION REPORT. Same message: an update at the end of her session covering the
--    work she did, the obstacles she ran into, good news, bad news, and feedback — "it also gives
--    a sense of accountability". Those five fields are columns rather than one free-text blob
--    precisely so the shape is the prompt: a person asked five specific questions answers five
--    questions, and a person given an empty box writes "all good".
--
-- 3. IMPROVEMENT REQUESTS AS A TRACKED OBJECT. Until now a request to change something shared the
--    alert feed with findings, and an alert is read once and acknowledged — which is fine for
--    "the link is dead" and useless for "we should build X". A request needs a STATUS the owner
--    moves, so she can see he decided rather than wondering whether he saw it. Declining is a
--    first-class outcome with a reason attached: an unanswered request becomes an unasked one.

-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_sessions (
  id             TEXT PRIMARY KEY,
  staff_id       TEXT,
  run_date       TEXT NOT NULL,             -- YYYY-MM-DD America/New_York, for joining to the run
  started_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,          -- moved by every heartbeat
  ended_at       INTEGER,                   -- null while the session is live
  active_seconds INTEGER NOT NULL DEFAULT 0, -- accumulated engaged time, NOT wall clock

  -- The end-of-session report. Null until she submits one; a session can be closed without a
  -- report (she closed the tab), and that absence is itself visible to the owner.
  work_done      TEXT,
  obstacles      TEXT,
  good_news      TEXT,
  bad_news       TEXT,
  feedback       TEXT,
  reported_at    INTEGER,

  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mkt_sessions_staff_date ON marketing_sessions(staff_id, run_date);
CREATE INDEX IF NOT EXISTS idx_mkt_sessions_open ON marketing_sessions(ended_at);
CREATE INDEX IF NOT EXISTS idx_mkt_sessions_reported ON marketing_sessions(reported_at);

-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS improvement_requests (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT,
  role          TEXT,                        -- who asked, kept even if the staff row is later gone
  kind          TEXT NOT NULL DEFAULT 'improvement',  -- improvement | bug | question
  title         TEXT NOT NULL,
  body          TEXT,
  area          TEXT,                        -- which surface it is about (free text, optional)
  -- open → the owner has not decided. accepted/declined are his decision. shipped is the truth
  -- afterwards. 'declined' is not a failure state: a decided request is a served request.
  status        TEXT NOT NULL DEFAULT 'open',
  owner_note    TEXT,                        -- his reason, shown back to her verbatim
  decided_at    INTEGER,
  decided_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_improvement_status ON improvement_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_improvement_staff ON improvement_requests(staff_id);
