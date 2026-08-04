-- 0073 — activity_log retention + adoption index. Additive only: no column is dropped, no row
-- is touched. Two indexes and nothing else.
--
-- WHY THIS EXISTS
-- activity_log has had three indexes since 0003 (created_at, event, actor_id) and NO retention
-- policy — every event ever fired is kept forever. The 2026-08-04 audit found that is not a
-- capacity problem (production: ~4,400 rows over 57 days, ~78/day, in a 6.3 MB database against
-- a 10 GB limit) but it is a hygiene problem, and the fix must never destroy a financial record.
--
-- Dayan's ruling 2026-08-04: TIERED retention.
--   · Money, food-safety and contractual events are NEVER pruned. activity_log is the durable,
--     append-only trail behind order.refunded / order.canceled / temp_log.recorded — the code
--     itself calls it that. Square is the source of truth for the money; this is the trail that
--     says who did what, when. A blanket 365-day sweep would delete refund and temperature
--     history to reclaim megabytes we are not short of.
--   · Only high-volume navigation noise is pruned, after 180 days, BY EVENT NAME.
--   · Everything else is kept. Pruning is opt-in per name, never a blanket sweep — so a new
--     event added next year is retained by default rather than silently swept.
-- The authoritative lists live in .telemetry/tracking-plan.yaml → retention:, and are mirrored
-- in functions/_lib/retention.js. Change them together.
--
-- THE INDEXES
--   idx_activity_actor_type_created — the adoption screen's whole question is "human activity
--     over a window", i.e. WHERE actor_type='human' AND created_at > ?. The existing single-column
--     created_at index makes that a scan-then-filter; this makes it a range scan. It also serves
--     the internal_user_policy rule that actor_type='system' is excluded from every adoption
--     metric — the exclusion is now cheap enough that nobody is tempted to skip it.
--   idx_activity_event_created — the prune job deletes by (event name, age). Without this the
--     weekly sweep scans the table once per pruned name.

CREATE INDEX IF NOT EXISTS idx_activity_actor_type_created
  ON activity_log(actor_type, created_at);

CREATE INDEX IF NOT EXISTS idx_activity_event_created
  ON activity_log(event, created_at);
